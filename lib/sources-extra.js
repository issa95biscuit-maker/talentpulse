/**
 * Sources d'offres supplémentaires — PRÊTES À BRANCHER, NON ACTIVÉES (sprint 9).
 * Aucune n'est appelée par searchJobs() tant que ses variables d'environnement n'existent pas ET
 * qu'elle n'est pas ajoutée à la liste des sources dans lib/jobs.js. Voir docs/SOURCES.md.
 *
 *  - La Bonne Alternance (gouv, gratuit) : LBA_API_KEY      — alternance, ~350 000 offres/an
 *  - Careerjet (partenaire, gratuit, rémunéré au clic) : CAREERJET_API_KEY — exige l'IP et le user-agent
 *    de l'internaute + le Referer de la page (à transmettre depuis api/jobs.js)
 *  - Jooble (gratuit limité : 500 requêtes AU TOTAL par clé) : JOOBLE_API_KEY — à réserver à un test
 */
const TIMEOUT = 6000;
async function getJson(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error(`${new URL(url).hostname} HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
const env = k => (process.env[k] || '').trim();
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const base = { exp: '', expYears: null, dept: '', contractDetail: '', salaryMin: null, salaryMax: null, horaires: '', tempsPlein: '', permis: '', langues: '', niveauEtudes: '', competences: '', qualites: '', avantages: '', structured: false, descIsExcerpt: true };

export const EXTRA_SOURCES = {
  lba: { env: ['LBA_API_KEY'], label: 'La Bonne Alternance' },
  careerjet: { env: ['CAREERJET_API_KEY'], label: 'Careerjet' },
  jooble: { env: ['JOOBLE_API_KEY'], label: 'Jooble' },
};
export function extraSourceStatus() {
  return Object.fromEntries(Object.entries(EXTRA_SOURCES).map(([k, v]) => [k, v.env.every(e => !!env(e))]));
}

// ── Careerjet v4 : https://www.careerjet.com/partners/api ──
export function mapCareerjet(j) {
  return { ...base, id: 'cj_' + String(j.url || j.title).slice(-60).replace(/[^\w-]/g, ''), source: 'Careerjet', sourceSite: j.site || 'Careerjet',
    title: clean(j.title) || 'Poste', company: clean(j.company), city: clean(j.locations).split(',')[0] || 'France',
    contract: '', salary: clean(j.salary), desc: clean(j.description), url: j.url || 'https://www.careerjet.fr', posted: j.date ? new Date(j.date).toISOString() : '', cat: '' };
}
export async function fetchCareerjet(ctx, { userIp, userAgent, referer }) {
  const key = env('CAREERJET_API_KEY');
  if (!key) return { resultats: [], total: 0, disabled: true };
  const p = new URLSearchParams({ locale_code: 'fr_FR', keywords: ctx.keyword || '', location: ctx.loc?.label || '', page: String(ctx.page || 1), page_size: '20', user_ip: userIp || '', user_agent: userAgent || '' });
  if (ctx.contrat === 'CDI') p.set('contract_type', 'p');
  if (ctx.contrat === 'Interim') p.set('contract_type', 't');
  const d = await getJson('https://search.api.careerjet.net/v4/query?' + p, { headers: { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'), Referer: referer || 'https://talentpulse-topaz.vercel.app/offres' } });
  return { resultats: (d.jobs || []).map(mapCareerjet), total: d.hits || 0 };
}

// ── Jooble : https://fr.jooble.org/api/about ──
export function mapJooble(j) {
  return { ...base, id: 'jb_' + String(j.id || '').replace(/[^\w-]/g, ''), source: 'Jooble', sourceSite: j.source || 'Jooble',
    title: clean(j.title) || 'Poste', company: clean(j.company), city: clean(j.location) || 'France', contract: clean(j.type),
    salary: clean(j.salary), desc: clean(j.snippet), url: j.link || 'https://fr.jooble.org', posted: j.updated ? new Date(j.updated).toISOString() : '', cat: '' };
}
export async function fetchJooble(ctx) {
  const key = env('JOOBLE_API_KEY');
  if (!key) return { resultats: [], total: 0, disabled: true };
  const d = await getJson('https://fr.jooble.org/api/' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: ctx.keyword || '', location: ctx.loc?.label || 'France', page: String(ctx.page || 1) }) });
  return { resultats: (d.jobs || []).map(mapJooble), total: d.totalCount || 0 };
}

// ── La Bonne Alternance : https://api.apprentissage.beta.gouv.fr/fr/explorer/recherche-offre ──
export function mapLBA(o) {
  const w = o.workplace || {}; const off = o.offer || {}; const app = o.apply || {};
  return { ...base, id: 'lba_' + String(o.identifier?.id || '').replace(/[^\w-]/g, ''), source: 'La Bonne Alternance', sourceSite: o.identifier?.partner_label || 'La Bonne Alternance',
    title: clean(off.title) || 'Alternance', company: clean(w.name || w.brand || w.legal_name), city: clean(w.location?.address).split(/\d{5}/).pop()?.trim() || 'France',
    contract: 'Alternance', salary: '', desc: clean(off.description), url: app.url || 'https://labonnealternance.apprentissage.beta.gouv.fr', posted: off.publication?.creation || '', cat: '' };
}
export async function fetchLBA(ctx) {
  const key = env('LBA_API_KEY');
  if (!key) return { resultats: [], total: 0, disabled: true };
  const p = new URLSearchParams();
  if (ctx.loc?.lat && ctx.loc?.lon) { p.set('latitude', String(ctx.loc.lat)); p.set('longitude', String(ctx.loc.lon)); p.set('radius', '30'); }
  if (ctx.romes) p.set('romes', ctx.romes);
  const d = await getJson('https://api.apprentissage.beta.gouv.fr/api/job/v1/search?' + p, { headers: { Authorization: 'Bearer ' + key } });
  const list = d.jobs || [];
  return { resultats: list.map(mapLBA), total: list.length };
}
