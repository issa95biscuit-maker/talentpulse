/**
 * GET /api/suggest?type=metier&q=<texte>
 * Suggestions d'intitulés de métiers : référentiel des appellations ROME de France Travail
 * (API Offres d'emploi v2, mêmes identifiants que la recherche), avec repli sur une liste locale.
 * Réponse : { items: [{ label, code? }], source: 'france-travail' | 'local' }
 */
import { suggestMetiers } from '../lib/suggest.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Méthode non autorisée.' }); }
  const q = String(req.query?.q || '').trim().slice(0, 60);
  const type = String(req.query?.type || 'metier');
  if (type !== 'metier') return res.status(400).json({ error: 'type inconnu' });
  if (q.length < 2) { res.setHeader('Cache-Control', 'public, s-maxage=86400'); return res.status(200).json({ items: [], source: 'local' }); }
  const r = await suggestMetiers(q, 8);
  res.setHeader('Cache-Control', r.source === 'france-travail' ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=600');
  return res.status(200).json(r);
}
