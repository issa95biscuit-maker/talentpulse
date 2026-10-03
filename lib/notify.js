/** Envoi des alertes : email (Resend) et WhatsApp (Twilio), via leurs API HTTP. */
import crypto from 'node:crypto';
import { env } from './env.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function siteUrl() { return env('APP_URL', 'https://talentpulse-topaz.vercel.app').replace(/\/$/, ''); }

export function unsubscribeToken(alertId) {
  return crypto.createHmac('sha256', env('AUTH_SECRET')).update('unsub:' + alertId).digest('base64url').slice(0, 32);
}
export function unsubscribeUrl(alertId) {
  return `${siteUrl()}/api/unsubscribe?a=${encodeURIComponent(alertId)}&t=${unsubscribeToken(alertId)}`;
}

export function renderAlertEmail(alert, jobs) {
  const label = alert.label || [alert.query.kw, alert.query.city].filter(Boolean).join(' · ');
  const unsub = unsubscribeUrl(alert.id);
  const items = jobs.map(j => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #E5E7EB">
      <a href="${esc(j.url)}" style="font:600 16px/1.35 Arial,sans-serif;color:#0F172A;text-decoration:none">${esc(j.title)}</a>
      <div style="font:14px/1.5 Arial,sans-serif;color:#475569;margin-top:2px">${esc([j.company, j.city].filter(Boolean).join(' · '))}</div>
      <div style="font:13px/1.5 Arial,sans-serif;color:#475569">${esc([j.contract, j.salary, j.sourceSite || j.source].filter(Boolean).join(' · '))}</div>
    </td></tr>`).join('');
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F8FB">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;padding:24px">
    <tr><td style="font:800 20px Arial,sans-serif;color:#0F172A">Talent<span style="color:#C2410C">Pulse</span></td></tr>
    <tr><td style="font:16px/1.5 Arial,sans-serif;color:#0F172A;padding-top:12px">${jobs.length} nouvelle${jobs.length > 1 ? 's' : ''} offre${jobs.length > 1 ? 's' : ''} pour <strong>${esc(label)}</strong></td></tr>
    <tr><td><table role="presentation" width="100%">${items}</table></td></tr>
    <tr><td style="padding-top:18px"><a href="${siteUrl()}/mon-espace" style="display:inline-block;background:#C2410C;color:#fff;font:600 15px Arial,sans-serif;padding:12px 18px;border-radius:8px;text-decoration:none">Voir toutes les offres</a></td></tr>
    <tr><td style="font:12px/1.5 Arial,sans-serif;color:#64748B;padding-top:20px">Vous recevez cet email car vous avez activé une alerte sur TalentPulse. <a href="${unsub}" style="color:#475569">Se désabonner de cette alerte</a>.</td></tr>
  </table></td></tr></table></body></html>`;
  const text = `${jobs.length} nouvelle(s) offre(s) pour « ${label} »\n\n` + jobs.map(j => `- ${j.title} — ${[j.company, j.city].filter(Boolean).join(', ')}\n  ${j.url}`).join('\n') + `\n\nSe désabonner : ${unsub}`;
  return { subject: `${jobs.length} nouvelle${jobs.length > 1 ? 's' : ''} offre${jobs.length > 1 ? 's' : ''} : ${label}`, html, text, unsub };
}

export async function sendEmail({ to, subject, html, text, unsub }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('ALERTS_FROM_EMAIL'), to: [to], subject, html, text,
      headers: unsub ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * WhatsApp via Twilio. Hors fenêtre de 24 h, WhatsApp impose un modèle approuvé :
 * définir TWILIO_WHATSAPP_CONTENT_SID (variables {{1}} = libellé, {{2}} = nombre, {{3}} = lien).
 */
export async function sendWhatsApp({ to, label, count, link, body }) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const form = new URLSearchParams({ From: 'whatsapp:' + env('TWILIO_WHATSAPP_FROM').replace(/^whatsapp:/, ''), To: 'whatsapp:' + to });
  const contentSid = env('TWILIO_WHATSAPP_CONTENT_SID');
  if (contentSid) { form.set('ContentSid', contentSid); form.set('ContentVariables', JSON.stringify({ 1: label, 2: String(count), 3: link })); }
  else form.set('Body', body);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
