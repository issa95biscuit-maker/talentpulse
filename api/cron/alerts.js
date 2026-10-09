/**
 * GET /api/cron/alerts — appelé chaque jour par Vercel Cron (voir vercel.json).
 * Vercel envoie « Authorization: Bearer $CRON_SECRET » ; toute autre requête est refusée.
 */
import crypto from 'node:crypto';
import { api, sendJson, allowMethods, HttpError } from '../../lib/http.js';
import { runAlerts } from '../../lib/alerts-runner.js';

export default api(async (req, res) => {
  allowMethods(req, res, ['GET']);
  const secret = String(process.env.CRON_SECRET || '');
  if (!secret) throw new HttpError(503, 'CRON_SECRET non configuré.', 'feature_disabled');
  const got = Buffer.from(String(req.headers?.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw new HttpError(401, 'Non autorisé.', 'unauthorized');
  const summary = await runAlerts();
  return sendJson(res, 200, { ok: true, ...summary });
});
