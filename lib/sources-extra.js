/**
 * Sources d'offres supplémentaires — PRÊTES À BRANCHER, NON ACTIVÉES (sprint 9).
 * Aucune n'est appelée par searchJobs() tant que ses variables d'environnement n'existent pas ET
 * qu'elle n'est pas ajoutée à la liste des sources dans lib/jobs.js. Voir docs/SOURCES.md.
 *
 *  - La Bonne Alternance (gouv, gratuit) : LBA_API_KEY      — alternance, ~350 000 offres/an
 *  - Careerjet (partenaire, gratuit, rémunéré au clic) : CAREERJET_API_KEY — exige l'IP et le user-agent
 *    de l'internaute + le Referer de la page (à transmettre depuis api/jobs.js)
 *  - Jooble (gratuit limité : 500 requêtes AU TOTAL par clé) : JOOBLE_API_KEY — à réserver à un test
 *  - API Engagement (gouv, gratuit, Service civique / bénévolat) : API_ENGAGEMENT_KEY — clé délivrée par un chargé
 *    de déploiement ; suivi des vues obligatoire (pixel/lien de tracking fourni par l'API)
 *  - Sites carrières d'employeurs (SmartRecruiters, Taleez…) : EMPLOYER_FEEDS — UNIQUEMENT pour les employeurs qui
 *    ont donné leur accord écrit (l'API publique SmartRecruiters est destinée au site carrière du client, pas à
 *    l'agrégation par des tiers). Format : "smartrecruiters:Accor,smartrecruiters:Kiabi,taleez:<token>"
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
  engagement: { env: ['API_ENGAGEMENT_KEY'], label: 'Service civique (API Engagement)' },
  employers: { env: ['EMPLOYER_FEEDS'], label: 'Sites carrières employeurs (avec accord)' },
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

// ── API Engagement (Service civique, bénévolat) : https://doc.api-engagement.beta.gouv.fr ──
export function mapEngagement(m) {
  const a = (m.addresses || [])[0] || {};
  return { ...base, id: 'emp_eng_' + String(m._id || m.id || '').replace(/[^\w-]/g, ''), source: 'Service civique', sourceSite: m.publisherName || 'API Engagement',
    title: clean(m.title) || 'Mission', company: clean(m.organizationName), city: clean(a.city) || 'France', dept: String(a.department || ''),
    contract: m.type === 'volontariat_service_civique' ? 'Service civique' : 'Bénévolat', salary: '', desc: clean(m.description).slice(0, 1200),
    url: m.applicationUrl || 'https://www.service-civique.gouv.fr', posted: m.postedAt || m.createdAt || '', cat: 'Engagement' };
}
export async function fetchEngagement(ctx) {
  const key = env('API_ENGAGEMENT_KEY');
  if (!key) return { resultats: [], total: 0, disabled: true };
  const p = new URLSearchParams({ limit: '20', skip: String(((ctx.page || 1) - 1) * 20), type: 'volontariat_service_civique' });
  if (ctx.keyword) p.set('keywords', ctx.keyword);
  if (ctx.loc?.type === 'commune') p.set('city', ctx.loc.label);
  if (ctx.loc?.type === 'departement') p.set('departmentName', ctx.loc.label);
  const d = await getJson('https://api.api-engagement.beta.gouv.fr/v0/mission?' + p, { headers: { 'x-api-key': key } });
  return { resultats: (d.data || []).map(mapEngagement), total: d.total || 0 };
}

// ── Sites carrières employeurs, sur accord écrit de l'employeur ──
export function parseEmployerFeeds(v = env('EMPLOYER_FEEDS')) {
  return String(v || '').split(',').map(x => x.trim()).filter(Boolean).map(x => { const [kind, id] = x.split(':'); return { kind, id }; })
    .filter(f => ['smartrecruiters'].includes(f.kind) && /^[\w.-]{2,60}$/.test(f.id || ''));
}
export function mapSmartRecruiters(p, company) {
  const l = p.location || {};
  return { ...base, id: 'emp_sr_' + String(p.id || '').replace(/[^\w-]/g, ''), source: 'Site carrière', sourceSite: p.company?.name || company,
    title: clean(p.name) || 'Poste', company: clean(p.company?.name || company), city: clean(l.city) || 'France',
    contract: /permanent|full/i.test(p.typeOfEmployment?.label || '') ? 'CDI' : clean(p.typeOfEmployment?.label), salary: '', desc: '',
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(p.id)}`, posted: p.releasedDate || '', cat: clean(p.function?.label) };
}
export async function fetchEmployerFeeds(ctx) {
  const feeds = parseEmployerFeeds();
  if (!feeds.length) return { resultats: [], total: 0, disabled: true };
  const batches = await Promise.all(feeds.map(async f => {
    const p = new URLSearchParams({ country: 'fr', limit: '10', offset: String(((ctx.page || 1) - 1) * 10) });
    if (ctx.keyword) p.set('q', ctx.keyword);
    if (ctx.loc?.type === 'commune') p.set('city', ctx.loc.label);
    const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(f.id)}/postings?${p}`).catch(() => ({ content: [], totalFound: 0 }));
    return { list: (d.content || []).map(x => mapSmartRecruiters(x, f.id)), total: d.totalFound || 0 };
  }));
  return { resultats: batches.flatMap(b => b.list), total: batches.reduce((a, b) => a + b.total, 0) };
}
