/** GET|POST /api/unsubscribe?a=<alertId>&t=<jeton> — désabonnement en un clic depuis un email (sans connexion). */
import crypto from 'node:crypto';
import { api, allowMethods } from '../lib/http.js';
import { db } from '../lib/db.js';
import { features } from '../lib/env.js';
import { unsubscribeToken, siteUrl } from '../lib/notify.js';

const page = (title, msg) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — TalentPulse</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;color:#0F172A"><h1 style="font-size:1.4rem">${title}</h1><p>${msg}</p><p><a href="${siteUrl()}/mon-espace" style="color:#C2410C">Gérer mes alertes</a></p></body></html>`;

export default api(async (req, res) => {
  allowMethods(req, res, ['GET', 'POST']);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const a = String(req.query?.a || ''), t = String(req.query?.t || '');
  const valid = /^[0-9a-f-]{36}$/i.test(a) && t.length === 32 && features().auth &&
    crypto.timingSafeEqual(Buffer.from(t), Buffer.from(unsubscribeToken(a)));
  if (!valid) return res.status(400).send(page('Lien invalide', 'Ce lien de désabonnement est invalide ou a expiré.'));
  await db().query(`update alerts set channels = '{}', updated_at = now() where id = $1`, [a]);
  return res.status(200).send(page('Désabonnement confirmé', 'Vous ne recevrez plus d’envoi pour cette alerte. La recherche reste enregistrée dans votre espace.'));
});
