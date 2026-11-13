/**
 * GET /offres/:metier[/:lieu], pages statiques (CGU, contact, connexion…) et /sitemap*.xml
 * (via les rewrites de vercel.json). HTML rendu côté serveur, mis en cache sur le CDN.
 */
import { renderLanding, renderOffer, renderStaticPage, sitemap } from '../lib/seo.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end(); }
  const q = req.query || {};
  if (q.sitemap) {
    const xml = sitemap(String(q.sitemap));
    if (!xml) return res.status(404).end();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).end(req.method === 'HEAD' ? '' : xml);
  }
  // Paramètres de suivi conservés lors d'une redirection de normalisation (?utm_…)
  const search = (() => { const u = String(req.url || ''); const i = u.indexOf('?'); if (i < 0) return ''; const p = new URLSearchParams(u.slice(i)); p.delete('kw'); p.delete('lieu'); p.delete('from'); p.delete('page'); const s = p.toString(); return s ? '?' + s : ''; })();
  try {
    const r = q.page ? renderStaticPage(q.page) : q.offre ? await renderOffer(q.offre) : await renderLanding({ kw: q.kw, lieu: q.lieu, search, from: q.from });
    if (!r) return res.status(404).end();
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
    return res.status(r.status).end(req.method === 'HEAD' ? '' : r.body);
  } catch (e) {
    console.error('[seo]', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).end('Erreur interne');
  }
}
