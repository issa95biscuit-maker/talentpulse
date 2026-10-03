/**
 * GET /api/jobs — proxy multi-sources France Travail + Adzuna.
 * Toute la logique est dans lib/jobs.js (réutilisée par le cron des alertes).
 */
import { searchJobs } from '../lib/jobs.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  const q = req.query || {};

  // Diagnostic : présence des variables (jamais leur valeur)
  if (q.debug === '1') {
    res.setHeader('Cache-Control', 'no-store');
    const has = k => !!(process.env[k] || '').trim();
    return res.status(200).json({
      env: {
        FT_CLIENT_ID: has('FT_CLIENT_ID'), FT_CLIENT_SECRET: has('FT_CLIENT_SECRET'),
        ADZUNA_APP_ID: has('ADZUNA_APP_ID'), ADZUNA_APP_KEY: has('ADZUNA_APP_KEY'),
        LBA_API_KEY: has('LBA_API_KEY'),
      },
    });
  }
  const r = await searchJobs(q);
  if (r.cache) res.setHeader('Cache-Control', r.cache);
  return res.status(r.status).json(r.body);
}
