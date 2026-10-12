/**
 * Source « Choisir le Service Public » (fonction publique d'État, territoriale, hospitalière).
 * Données ouvertes DGAFP publiées sur data.gouv.fr sous Licence Ouverte 2.0 (réutilisation libre, y compris
 * commerciale, avec mention de la source et de la date). Index compact construit par scripts/build-csp.mjs,
 * à rafraîchir chaque semaine (workflow prêt : docs/ci/csp-refresh.yml). Recherche en mémoire, aucun appel réseau.
 * Chaque offre renvoie vers sa fiche officielle sur choisirleservicepublic.gouv.fr (candidature là-bas).
 */
import '../public/assets/geo-fr.js';
const GEO = globalThis.TP_GEO;

export const CSP_PAGE_SIZE = 10;
let DATA = null;
async function load() {
  if (DATA) return DATA;
  const mod = await import('./data/csp-offres.json', { with: { type: 'json' } });
  const raw = mod.default;
  const idx = Object.fromEntries(raw.fields.map((f, i) => [f, i]));
  const rows = raw.rows.map(r => {
    const o = Object.fromEntries(Object.entries(idx).map(([f, i]) => [f, r[i]]));
    o.region = (GEO.depByCode(o.dep) || {}).region || '';
    o._hay = GEO.norm([o.title, o.metier, o.employer].join(' '));
    o._city = GEO.norm(o.city);
    return o;
  });
  DATA = { snapshot: raw.snapshot, builtAt: raw.builtAt, rows };
  return DATA;
}
export function _reset(data) { DATA = data; }

const VERSANT = { FPT: 'territoriale', FPE: 'de l’État', FPH: 'hospitalière' };
const slug = s => GEO.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'offre';
const capWords = s => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'(-])\p{L}/gu, m => m.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|Et|D'|L')\b/g, m => m.toLowerCase()) : s);
const titleFix = s => (s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

export function cspUrl(o) {
  return `https://choisirleservicepublic.gouv.fr/offre-emploi/${slug(o.title)}-reference-${encodeURIComponent(o.ref)}/`;
}

export function mapCSP(o) {
  const versant = VERSANT[o.versant] ? `Fonction publique ${VERSANT[o.versant]}` : 'Fonction publique';
  const dep = GEO.depByCode(o.dep);
  return {
    id: 'csp_' + String(o.ref).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 70),
    source: 'Choisir le Service Public', sourceSite: 'Choisir le Service Public',
    title: titleFix(o.title) || 'Poste', company: capWords(o.employer || ''),
    city: o.city || (dep ? dep.label : 'France'), dept: o.dep || '',
    contract: o.contrat, contractDetail: [versant, o.categorie ? 'catégorie ' + o.categorie : ''].filter(Boolean).join(', '),
    salary: '', salaryMin: null, salaryMax: null, exp: '', expYears: null,
    desc: [`Métier : ${o.metier}.`, `${versant}${o.categorie ? ', catégorie ' + o.categorie : ''}.`, o.teletravail ? 'Télétravail possible.' : '', `Publication jusqu’au ${o.end.split('-').reverse().join('/')}.`].filter(Boolean).join(' '),
    descIsExcerpt: true, url: cspUrl(o), posted: o.first ? new Date(o.first + 'T08:00:00Z').toISOString() : '',
    cat: 'Fonction publique', horaires: '', tempsPlein: o.tempsPlein ? 'Temps plein' : 'Temps partiel', permis: '', langues: '', niveauEtudes: '',
    competences: '', qualites: '', avantages: '', structured: false, publicSector: true, categoriePublique: o.categorie || '',
  };
}

/** ctx : { keyword, loc, contrat, publie, experience, niveau, salaireMin, temps, tri, page, count } */
export async function fetchCSP(ctx, now = new Date()) {
  if (process.env.CSP_DISABLED === '1') return { resultats: [], total: 0, disabled: true };
  // Filtres que cette source ne sait pas appliquer honnêtement : on s'abstient plutôt que d'afficher hors filtre
  if (ctx.experience || ctx.niveau || ctx.salaireMin) return { resultats: [], total: 0, skipped: 'filtre non disponible' };
  if (ctx.contrat && !['CDD', 'CDI'].includes(ctx.contrat)) return { resultats: [], total: 0, skipped: 'contrat non concerné' };
  const data = await load();
  const today = now.toISOString().slice(0, 10);
  const minFirst = ctx.publie ? new Date(now - Number(ctx.publie) * 864e5).toISOString().slice(0, 10) : '';
  const tokens = GEO.norm(ctx.keyword || '').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !['h', 'f', 'de', 'du', 'la', 'le', 'les', 'des', 'et', 'en'].includes(w));
  const loc = ctx.loc || { type: 'none' };
  const locCity = loc.type === 'commune' ? GEO.norm(String(loc.label || '').replace(/\s+\d+(er|e)?$/i, '')) : '';
  const out = [];
  for (const o of data.rows) {
    if (o.end < today) continue;
    if (minFirst && o.first < minFirst) continue;
    if (ctx.contrat === 'CDI' && !/CDI/.test(o.contrat)) continue;
    if (ctx.contrat === 'CDD' && !/CDD|contractuel/i.test(o.contrat)) continue;
    if (ctx.temps === 'plein' && !o.tempsPlein) continue;
    if (ctx.temps === 'partiel' && o.tempsPlein) continue;
    if (loc.type === 'commune' && !(o._city === locCity || (o._city.startsWith(locCity + ' ') && locCity.length > 3))) continue;
    if (loc.type === 'departement' && o.dep !== loc.departement) continue;
    if (loc.type === 'region' && o.region !== loc.region) continue;
    if (loc.type === 'unknown') continue;
    if (tokens.length && !tokens.every(w => o._hay.includes(w))) continue;
    out.push(o);
  }
  if (tokens.length && ctx.tri !== 'date') {
    const titleScore = o => tokens.filter(w => GEO.norm(o.title).includes(w)).length;
    out.sort((a, b) => titleScore(b) - titleScore(a) || b.first.localeCompare(a.first));
  } else out.sort((a, b) => b.first.localeCompare(a.first));
  const start = (ctx.page - 1) * CSP_PAGE_SIZE;
  return { resultats: out.slice(start, start + CSP_PAGE_SIZE).map(mapCSP), total: out.length, snapshot: data.snapshot };
}

export async function fetchCSPById(id) {
  const data = await load();
  const o = data.rows.find(r => 'csp_' + String(r.ref).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 70) === id);
  return o ? mapCSP(o) : null;
}
