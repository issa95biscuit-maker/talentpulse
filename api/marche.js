/**
 * GET /api/marche — encart compact « Le marché en chiffres » pour une fiche d’offre.
 * Un seul appel, au moment où la fiche s’ouvre (jamais depuis une carte de la liste).
 * Réponse vide si le département, le ROME ou l’API manquent : le client n’affiche rien.
 */
import { allowMethods, api, sendJson } from '../lib/http.js';
import { loadOfferMarket, marketCompactHtml, normalizeDept, normalizeRome } from '../lib/data-emploi.js';

const one = v => (Array.isArray(v) ? v[0] : v);

export default api(async (req, res) => {
  allowMethods(req, res, ['GET', 'HEAD']);
  const q = req.query || {};
  const dept = normalizeDept(one(q.dept));
  const rome = normalizeRome(one(q.rome));
  const title = String(one(q.q) || '').trim().slice(0, 120);
  const city = String(one(q.city) || '').trim().slice(0, 80);
  const salaryKnown = one(q.salary) === '1';
  const empty = (cache) => sendJson(res, 200, { html: '' }, { cache });
  if (!dept || (!rome && !title)) {
    return empty('public, max-age=300, s-maxage=3600');
  }
  const snapshot = await loadOfferMarket({
    dept,
    rome,
    title: rome ? '' : title,
    city,
    romeLabel: '',
  });
  const html = marketCompactHtml(snapshot, { salaryKnown });
  const cache = html
    ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
    : 'public, max-age=120, s-maxage=600';
  return sendJson(res, 200, { html }, { cache });
});
