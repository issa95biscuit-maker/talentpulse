/** Exécution quotidienne des alertes : recherche, filtrage des offres déjà envoyées, envoi, journalisation. */
import { db } from './db.js';
import { features } from './env.js';
import { searchJobs } from './jobs.js';
import { renderAlertEmail, sendEmail, sendWhatsApp, siteUrl } from './notify.js';
import { alertRow } from './userdata.js';

const MAX_PER_ALERT = 10;

export async function runAlerts({ budgetMs = 50000, batch = 100, search = searchJobs, now = Date.now } = {}) {
  const f = features();
  const started = now();
  const summary = { processed: 0, sent: { email: 0, whatsapp: 0 }, skipped: 0, errors: 0, cleaned: {} };
  if (!f.db) return { ...summary, skippedReason: 'database_not_configured' };
  if (!f.emailAlerts && !f.whatsappAlerts) return { ...summary, skippedReason: 'no_delivery_channel_configured' };

  const rows = await db().query(
    `select a.*, u.email, u.email_verified_at from alerts a join users u on u.id = a.user_id
      where a.active and cardinality(a.channels) > 0
        and (a.last_run_at is null or a.last_run_at < now() - interval '20 hours')
      order by a.last_run_at nulls first limit $1`, [batch]);

  for (const r of rows) {
    if (now() - started > budgetMs) break;
    const alert = { ...alertRow(r), email: r.email, emailVerified: !!r.email_verified_at };
    summary.processed++;
    try {
      const q = alert.query || {};
      const result = await search({ motsCles: q.kw || '', lieu: q.city || '', contrat: q.contrat || '', temps: q.temps || '', experience: q.experience || '', salaireMin: q.salaireMin ? String(q.salaireMin) : '', publie: alert.lastRunAt ? '1' : '3', tri: 'date' });
      const jobs = (result.body?.resultats || []).filter(j => j.id && j.url);
      // E-mail uniquement vers une adresse vérifiée (évite d'écrire à quelqu'un qui n'a rien demandé)
      const channels = alert.channels.filter(c => (c === 'email' ? f.emailAlerts && alert.emailVerified : c === 'whatsapp' ? f.whatsappAlerts && alert.whatsappTo : false));
      for (const channel of channels) {
        const ids = jobs.map(j => j.id);
        const done = ids.length ? new Set((await db().query('select job_id from alert_deliveries where alert_id = $1 and channel = $2 and job_id = any($3::text[])', [alert.id, channel, ids])).map(x => x.job_id)) : new Set();
        const fresh = jobs.filter(j => !done.has(j.id)).slice(0, MAX_PER_ALERT);
        if (!fresh.length) { summary.skipped++; continue; }
        if (channel === 'email') {
          await sendEmail({ to: alert.email, ...renderAlertEmail(alert, fresh) });
        } else {
          const label = alert.label || [q.kw, q.city].filter(Boolean).join(' · ');
          await sendWhatsApp({ to: alert.whatsappTo, label, count: fresh.length, link: `${siteUrl()}/mon-espace`, body: `TalentPulse : ${fresh.length} nouvelle(s) offre(s) pour « ${label} ».\n${fresh.slice(0, 3).map(j => '• ' + j.title + ' — ' + j.url).join('\n')}` });
        }
        await db().query(
          `insert into alert_deliveries (alert_id, job_id, channel) select $1, unnest($2::text[]), $3 on conflict do nothing`,
          [alert.id, fresh.map(j => j.id), channel]);
        await db().query('update alerts set last_sent_at = now() where id = $1', [alert.id]);
        summary.sent[channel] += fresh.length ? 1 : 0;
      }
    } catch (e) {
      summary.errors++;
      console.error('[cron/alerts]', alert.id, e.message);
    }
    await db().query('update alerts set last_run_at = now() where id = $1', [alert.id]);
  }

  // Hygiène : sessions expirées, compteurs de débit, historique d'envoi > 90 jours.
  summary.cleaned.sessions = (await db().query('delete from sessions where expires_at < now() returning 1')).length;
  summary.cleaned.authTokens = (await db().query(`delete from auth_tokens where expires_at < now() - interval '1 day' returning 1`)).length;
  summary.cleaned.rateLimits = (await db().query(`delete from rate_limits where window_start < now() - interval '2 days' returning 1`)).length;
  summary.cleaned.deliveries = (await db().query(`delete from alert_deliveries where sent_at < now() - interval '90 days' returning 1`)).length;
  return summary;
}
