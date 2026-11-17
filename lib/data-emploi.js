import '../public/assets/geo-fr.js';

/**
 * Indicateurs « Marché du travail » (Data Emploi), API France Travail.
 * Contrat : OpenAPI 3.0.1 du produit « Marché du travail »
 * (https://francetravail.io/produits-partages/catalogue/marche-travail,
 * fichier servi par /api-peio/v2/api/233/openapi).
 *
 *   OAuth client_credentials, royaume /partenaire
 *   scopes exigés : api_stats-offres-demandes-emploiv1 ET offresetdemandesemploi
 *   base : https://api.francetravail.io/partenaire/stats-offres-demandes-emploi
 *
 * Les chiffres affichés viennent uniquement des réponses. Sans jeton, sans droit
 * (invalid_scope, 401, 403) ou si l’API ne répond pas, tout renvoie null : l’encart
 * n’est pas rendu. Les réponses réussies sont mises en cache 24 h (données trimestrielles).
 */
export const DATA_EMPLOI_SCOPE = 'api_stats-offres-demandes-emploiv1 offresetdemandesemploi';
export const DATA_EMPLOI_BASE = 'https://api.francetravail.io/partenaire/stats-offres-demandes-emploi';
const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
export const DATA_EMPLOI_SOURCE_URL = 'https://francetravail.io/produits-partages/catalogue/marche-travail';
export const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 2500;
const DENIED_MS = 60 * 60 * 1000;
const FAIL_MS = 2 * 60 * 1000;
const MISS_MS = 10 * 60 * 1000;

/** Exemple officiel du corps DE_1 (catalogue + schéma CritereIndicateurAvecNomenclature). */
const EXAMPLE_NOMENCLATURE = 'CATCAND';
const EXAMPLE_PERIOD = 'TRIMESTRE';
/** Codes de type de territoire donnés en exemple dans l’OpenAPI (DEP, REG). */
const EXAMPLE_TERRITORY = { departement: 'DEP', region: 'REG' };

const INDICATORS = [
  { id: 'DE_1', path: '/v1/indicateur/stat-demandeurs', title: 'Demandeurs d’emploi' },
  { id: 'OFF_1', path: '/v1/indicateur/stat-offres', title: 'Offres enregistrées' },
  { id: 'EMB_1', path: '/v1/indicateur/stat-embauches', title: 'Embauches' },
  { id: 'PERSP_2', path: '/v1/indicateur/stat-perspective-employeur', title: 'Tension au recrutement' },
];

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const cache = new Map();
let tokenState = null;
let accessState = null;

export function _resetDataEmploi() {
  cache.clear();
  tokenState = null;
  accessState = null;
}

const nowOf = opts => (opts && Number.isFinite(opts.now) ? opts.now : Date.now());
const configured = () => Boolean(String(process.env.FT_CLIENT_ID || '').trim() && String(process.env.FT_CLIENT_SECRET || '').trim());

async function fetchTimeout(url, opts, ms, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await (fetchImpl || globalThis.fetch)(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function fromCache(key, now) {
  const hit = cache.get(key);
  if (!hit || hit.until <= now) {
    if (hit) cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function toCache(key, value, ttl, now) {
  cache.set(key, { until: now + ttl, value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const KIND_RE = {
  commune: /commune/,
  departement: /depart/,
  region: /region/,
  france: /france|pays|national/,
};

/** Code de type de territoire, d’après le référentiel ou, à défaut de liste, l’exemple OpenAPI. */
export function matchTerritoryType(types, kind) {
  const re = KIND_RE[kind];
  const exact = EXAMPLE_TERRITORY[kind];
  const hit = (types || []).find(t => {
    const code = String(t.codeTypeTerritoire || '');
    if (exact && code.toUpperCase() === exact) return true;
    return re ? re.test(norm(`${code} ${t.libelleTypeTerritoire || ''}`)) : false;
  });
  if (hit?.codeTypeTerritoire) return hit.codeTypeTerritoire;
  if ((!types || !types.length) && exact) return exact;
  return null;
}

export function resolveTerritory(place, types) {
  if (!place) return null;
  const kind = place.type;
  const codeTypeTerritoire = matchTerritoryType(types, kind);
  const codeTerritoire = kind === 'commune' ? place.insee : kind === 'departement' ? (place.dep || place.code) : (place.reg || place.code);
  if (!codeTypeTerritoire || !codeTerritoire) return null;
  return { codeTypeTerritoire, codeTerritoire: String(codeTerritoire) };
}

/** Territoire « France » : libellé exact, sinon France métropolitaine, sinon un libellé France unique. */
export function pickFrance(rows) {
  const scored = (rows || []).map(t => {
    const l = norm(t.libelleTerritoire);
    const s = l === 'france' ? 3 : (l === 'france metropolitaine' ? 2 : (l.includes('france') ? 1 : 0));
    return { t, s };
  }).filter(x => x.s).sort((a, b) => b.s - a.s || String(a.t.codeTerritoire).localeCompare(String(b.t.codeTerritoire)));
  if (!scored.length) return null;
  if (scored[0].s >= 2 && (scored.length === 1 || scored[0].s > scored[1].s)) return scored[0].t;
  if (scored.length === 1) return scored[0].t;
  return null;
}

function scoreLib(lib, q) {
  const L = norm(lib);
  const Q = norm(q);
  if (!L || !Q) return 0;
  if (L === Q) return 100;
  if (L.startsWith(Q + ' ') || L.startsWith(Q + '/') || L.startsWith(Q + '-')) return 80;
  const words = Q.split(/\s+/).filter(w => w.length > 2);
  if (words.length && words.every(w => L.includes(w))) return 60;
  return 0;
}

/** Une activité ROME seulement si le libellé correspond sans ambiguïté à la recherche. */
export function pickActivite(rows, query) {
  const scored = (rows || []).map(a => ({ a, s: scoreLib(a.libelleActivite, query) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s || String(x.a.codeActivite).localeCompare(String(y.a.codeActivite), 'fr'));
  if (!scored.length) return null;
  if (scored[0].s >= 80 && (scored.length === 1 || scored[0].s > scored[1].s)) return scored[0].a;
  if (scored[0].s >= 60 && scored.length === 1) return scored[0].a;
  return null;
}

export function formatFrInt(n) {
  return Math.round(n).toLocaleString('fr-FR').replace(/[\s\u00a0\u202f]/g, '\u202f');
}
export function formatFrDecimal(n) {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).replace(/[\s\u00a0\u202f]/g, '\u202f');
}
export function formatEuro(n) {
  return `${formatFrInt(n)}\u00a0€`;
}

export function formatPeriode(code, lib) {
  const l = String(lib || '').trim();
  const yearLib = l.match(/^ann[ée]e\s+(\d{4})$/i);
  if (yearLib) return { label: `année ${yearLib[1]}`, kind: 'year', year: yearLib[1] };
  if (/trimestre/i.test(l) && /\d{4}/.test(l)) return { label: l, kind: 'quarter' };
  const c = String(code || '').trim();
  let m = c.match(/^(\d{4})T([1-4])$/);
  if (m) {
    const ord = m[2] === '1' ? '1er' : `${m[2]}e`;
    return { label: `${ord} trimestre ${m[1]}`, kind: 'quarter' };
  }
  m = c.match(/^(\d{4})M(0[1-9]|1[0-2])$/);
  if (m) return { label: `${MONTHS[Number(m[2]) - 1]} ${m[1]}`, kind: 'month' };
  m = c.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if (m) return { label: `${MONTHS[Number(m[2]) - 1]} ${m[1]}`, kind: 'month' };
  if (/^\d{4}$/.test(c)) return { label: `année ${c}`, kind: 'year', year: c };
  if (l) return { label: l, kind: 'libelle' };
  return null;
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

export function formatPrincipal(row) {
  if (!row || typeof row !== 'object') return null;
  if (isNum(row.valeurPrincipaleNombre)) return { text: formatFrInt(row.valeurPrincipaleNombre), kind: 'count' };
  if (isNum(row.valeurPrincipaleMontant)) return { text: formatEuro(row.valeurPrincipaleMontant), kind: 'money' };
  if (isNum(row.valeurPrincipaleTaux)) return { text: formatFrDecimal(row.valeurPrincipaleTaux), kind: 'rate' };
  if (isNum(row.valeurPrincipaleDecimale)) return { text: formatFrDecimal(row.valeurPrincipaleDecimale), kind: 'decimal' };
  if (isNum(row.valeurPrincipaleRang)) return { text: formatFrInt(row.valeurPrincipaleRang), kind: 'rank' };
  const nom = String(row.valeurPrincipaleNom || '').trim();
  if (nom) return { text: nom, kind: 'text' };
  return null;
}

function periodKey(code) {
  const c = String(code || '');
  const t = c.match(/^(\d{4})T([1-4])$/);
  if (t) return Number(t[1]) * 10 + Number(t[2]);
  const mo = c.match(/^(\d{4})M(0[1-9]|1[0-2])$/);
  if (mo) return Number(mo[1]) * 100 + Number(mo[2]);
  if (/^\d{4}$/.test(c)) return Number(c) * 10;
  return 0;
}

/** Ligne agrégée documentée par la nomenclature, pas un cumul sur 12 mois ni une catégorie partielle. */
const HEADLINE = new Set(['abc', 'toff', 'tout-toute', 'perspective', 'sal3']);
function isTwelveMonth(row) {
  const code = norm(row.codeNomenclature);
  const lib = norm(row.libNomenclature);
  return code.includes('cumul12') || lib.includes('12 dernier');
}

function isTotalRow(row) {
  const code = norm(row.codeNomenclature);
  const lib = norm(row.libNomenclature);
  return code === 'abc' || code === 'total' || code === 'ensemble' || /^(ensemble|total|toutes)\b/.test(lib);
}

/** Dernière période, hors cumul 12 mois s’il existe une valeur de la période, puis la ligne agrégée de la nomenclature. */
export function pickLatestRow(rows) {
  const list = Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object') : (rows && typeof rows === 'object' ? [rows] : []);
  if (!list.length) return null;
  const best = Math.max(...list.map(r => periodKey(r.codePeriode)));
  let same = best > 0 ? list.filter(r => periodKey(r.codePeriode) === best) : list;
  const current = same.filter(r => !isTwelveMonth(r));
  if (current.length) same = current;
  if (same.length === 1) return same[0];
  const headlines = same.filter(r => HEADLINE.has(norm(r.codeNomenclature)));
  if (headlines.length === 1) return headlines[0];
  const totals = same.filter(isTotalRow);
  if (totals.length === 1) return totals[0];
  return null;
}

function rowsOf(payload) {
  const raw = payload.listeValeursParPeriode || payload.valeursParPeriode || [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const nested = row.salaireValeurMontant;
    if (Array.isArray(nested) && nested.length) {
      for (const item of nested) {
        if (item && typeof item === 'object') out.push({ ...row, ...item });
      }
    } else out.push(row);
  }
  return out;
}

export function readIndicateur(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = pickLatestRow(rowsOf(payload));
  if (!row) return null;
  const value = formatPrincipal(row);
  if (!value) return null;
  return {
    libIndicateur: String(payload.libIndicateur || ''),
    libActivite: String(row.libActivite || ''),
    libTerritoire: String(row.libTerritoire || payload.libTerritoire || ''),
    libNomenclature: String(row.libNomenclature || ''),
    codeNomenclature: String(row.codeNomenclature || ''),
    libCaracteristique: String(row.libCaracteristique || row.libelleCaracteristique || '').trim(),
    periode: formatPeriode(row.codePeriode, row.libPeriode),
    datMaj: String(row.datMaj || payload.datMaj || ''),
    value,
  };
}

export function sourceSentence(figures) {
  const labels = (figures || []).map(f => f.periode?.label).filter(Boolean);
  const unique = [...new Set(labels)];
  if (unique.length === 1) {
    const p = figures.find(f => f.periode?.label === unique[0]).periode;
    const data = p.kind === 'month' ? `données de ${p.label}` : p.kind === 'quarter' ? `données du ${p.label}` : p.kind === 'year' ? `données de l’année ${p.year}` : `données ${p.label}`;
    return `Source\u00a0: France Travail, ${typoFr(data)}.`;
  }
  return 'Source\u00a0: France Travail.';
}

/**
 * Typographie française des libellés de l’API, à l’affichage seulement (la donnée reste intacte) :
 * apostrophe courbe, « 2e trimestre » (pas « 2ème »), « d’emploi » en minuscule, « A, B ou C », tiret demi-cadratin.
 */
export function typoFr(value) {
  return String(value ?? '')
    .replace(/'/g, '’')
    .replace(/\b(\d+)(?:ème|eme)(?=\s+trimestre)/gi, '$1e')
    .replace(/\b([dD])’Emploi\b/g, '$1’emploi')
    .replace(/\b([A-Z]),(?=[A-Z]\b)/g, '$1, ')
    .replace(/ - /g, ' – ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
/** « RHONE » → « Rhône » (référentiel des départements et régions) ; sinon, le libellé tel quel. */
export function territoryName(label) {
  const s = String(label || '').trim();
  if (!s || /\p{Ll}/u.test(s)) return s;
  const hit = globalThis.TP_GEO?.exactPlace?.(s);
  if (hit?.label) return hit.label;
  if (/^france$/i.test(s)) return 'France';
  return s;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function figureCards(figures) {
  const labels = figures.map(f => f.periode?.label).filter(Boolean);
  const shared = labels.length && labels.every(l => l === labels[0]) ? labels[0] : '';
  return figures.map(f => {
    const bits = [];
    if (f.value.kind === 'rank') bits.push('Rang');
    if (f.libNomenclature) bits.push(f.libNomenclature);
    if (f.periode?.label && f.periode.label !== shared) bits.push(f.periode.label);
    const meta = typoFr(bits.join(' · '));
    return `<div class="market-card"><dt>${esc(f.title)}</dt><dd><span class="market-value">${esc(f.value.text)}</span>${meta ? `<span class="market-meta">${esc(meta)}</span>` : ''}</dd></div>`;
  }).join('');
}

function sourceHtml(figures) {
  return `<p class="market-source">${esc(sourceSentence(figures))} <a href="${DATA_EMPLOI_SOURCE_URL}" target="_blank" rel="noopener">API Marché du travail</a> (Data Emploi).</p>`;
}

export function marketFiguresHtml(model) {
  const figures = model?.figures?.filter(f => f?.value?.text);
  if (!figures?.length) return '';
  const context = contextHtml(model);
  return `<div class="market-figures" role="region" aria-labelledby="marketFiguresTitle"><h2 id="marketFiguresTitle">Le marché en chiffres</h2>${context}<dl class="market-grid">${figureCards(figures)}</dl>${sourceHtml(figures)}</div>`;
}

function contextHtml(model) {
  const ctx = [model.activityLabel, territoryName(model.territoryLabel)].filter(Boolean).map(typoFr);
  return `${ctx.length ? `<p class="market-context">${esc(ctx.join(' · '))}</p>` : ''}${model.coverageNote ? `<p class="market-context market-coverage">${esc(model.coverageNote)}</p>` : ''}`;
}

const DEPT_RE = /^(\d{2,3}|2A|2B)$/;
const ROME_RE = /^[A-Z]\d{4}$/;

export function normalizeDept(value) {
  const d = String(value || '').trim().toUpperCase();
  return DEPT_RE.test(d) ? d : '';
}
export function normalizeRome(value) {
  const c = String(value || '').trim().toUpperCase();
  return ROME_RE.test(c) ? c : '';
}

/** Salaire publié par l’offre (un montant), pas une estimation ni une grille sans chiffre. */
export function offerSalaryKnown(job) {
  const label = String(job?.salary || '').trim();
  if (!label || /estimation/i.test(label)) return false;
  return /\d/.test(label);
}

/**
 * Texte envoyé au référentiel ROME pour une offre sans code (Adzuna, Service Public).
 * On retire le bruit de contrat et la ville ; le choix reste ensuite sans ambiguïté (pickActivite).
 */
export function romeSearchText(title, city = '') {
  let s = String(title || '');
  s = s.replace(/\((?:[^)]{0,40})\)/g, (m) => (
    /^\(\s*(h\s*\/\s*f|f\s*\/\s*h|h\/f\/x|cdi|cdd|cddi|stage|alternance|apprentissage|intérim|interim)\s*\)$/i.test(m) ? ' ' : m
  ));
  s = s.replace(/\b(h\s*\/\s*f|f\s*\/\s*h)\b/gi, ' ');
  s = s.replace(/^\s*(?:stage|alternance|apprentissage|intérim|interim)\b\s*[-–—:|]?\s*/i, '');
  s = s.replace(/\s*[-–—|]\s*(?:cdi|cdd|cddi|stage|alternance|intérim|interim)\s*$/i, ' ');
  s = s.replace(/\b(?:cdi|cdd|cddi)\b/gi, ' ');
  const cityName = String(city || '').replace(/\s+\d+\s*(?:er|e|ème|eme)?$/i, '').trim();
  if (cityName.length > 2) s = s.replace(new RegExp(cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  s = s.replace(/[–—|•]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 80) return '';
  return s;
}

/** Tranche d’âge citée par la ligne, sinon l’agrégat publié sans filtre d’âge. */
function agePhrase(figure) {
  const explicit = String(figure?.libCaracteristique || '').trim();
  const n = norm(`${explicit} ${figure?.libNomenclature || ''}`);
  if (/tout\s*age|tous\s*ages/.test(n)) return 'tout âge';
  if (explicit && /ans|age|jeunes|senior/.test(norm(explicit))) return explicit;
  return 'tout âge';
}

/** Ligne neutre : le salaire en poste du métier, avec sa base, sans situer l’offre. */
export function compareParts(figure) {
  if (!figure || figure.value?.kind !== 'money' || !figure.value.text) return null;
  const nom = String(figure.libNomenclature || '').trim();
  const age = agePhrase(figure);
  const period = figure.periode?.kind === 'year' && figure.periode.year
    ? `année ${figure.periode.year}`
    : String(figure.periode?.label || '').trim();
  const bits = [];
  if (nom) bits.push(nom);
  if (age && !norm(nom).includes(norm(age))) bits.push(age);
  if (period && !bits.some(b => norm(b) === norm(period))) bits.push(period);
  return {
    lead: `Salaire en poste du métier\u00a0: ${figure.value.text}.`,
    base: bits.length ? `Base\u00a0: ${typoFr(bits.join(', '))}.` : '',
  };
}

/** Encart court pour une fiche d’offre. Vide si aucun chiffre. */
export function marketCompactHtml(model, { salaryKnown = false } = {}) {
  const figures = model?.figures?.filter(f => f?.value?.text);
  if (!figures?.length) return '';
  const context = contextHtml(model);
  const salary = figures.find(f => f.id === 'SAL_3');
  const parts = salaryKnown ? compareParts(salary) : null;
  const compare = parts
    ? `<p class="market-compare">${esc(parts.lead)}${parts.base ? `<span class="market-base">${esc(parts.base)}</span>` : ''}</p>`
    : '';
  // La ligne « Salaire en poste du métier » reprend déjà le montant : pas de carte en double.
  const cards = parts ? figures.filter(f => f !== salary) : figures;
  return `<section class="market-figures market-compact" aria-labelledby="detailMarketTitle"><h2 id="detailMarketTitle">Le marché en chiffres</h2>${context}<dl class="market-grid">${figureCards(cards)}</dl>${compare}${sourceHtml(figures)}</section>`;
}

function remember(ok, now, ttl) {
  accessState = { ok, until: now + ttl };
}

async function fetchToken(opts) {
  const now = nowOf(opts);
  if (!configured()) return null;
  if (tokenState && tokenState.exp > now + 30000) {
    remember(true, now, 6 * 60 * 60 * 1000);
    return tokenState.value;
  }
  if (accessState && !accessState.ok && accessState.until > now) return null;
  let r;
  try {
    r = await fetchTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: String(process.env.FT_CLIENT_ID || '').trim(),
        client_secret: String(process.env.FT_CLIENT_SECRET || '').trim(),
        scope: DATA_EMPLOI_SCOPE,
      }),
    }, TIMEOUT_MS, opts.fetchImpl);
  } catch {
    remember(false, now, FAIL_MS);
    return null;
  }
  if (!r.ok) {
    remember(false, now, (r.status === 400 || r.status === 401 || r.status === 403) ? DENIED_MS : FAIL_MS);
    tokenState = null;
    return null;
  }
  let data;
  try { data = await r.json(); } catch {
    remember(false, now, FAIL_MS);
    return null;
  }
  if (!data?.access_token) {
    remember(false, now, FAIL_MS);
    return null;
  }
  const exp = now + (Number(data.expires_in) || 600) * 1000;
  tokenState = { value: data.access_token, exp };
  remember(true, now, 6 * 60 * 60 * 1000);
  return data.access_token;
}

/** true seulement si un jeton avec les scopes Marché du travail a été obtenu. */
export async function dataEmploiEnabled(opts = {}) {
  if (!configured()) return false;
  const now = nowOf(opts);
  if (accessState && accessState.until > now) return accessState.ok;
  return Boolean(await fetchToken(opts));
}

async function callApi(opts, path, spec = {}, retried = false) {
  const { method = 'GET', body } = spec;
  const now = nowOf(opts);
  const key = method + ' ' + path + (body ? ' ' + JSON.stringify(body) : '');
  const hit = fromCache(key, now);
  if (hit !== undefined) return hit;
  const token = await fetchToken(opts);
  if (!token) return null;
  let r;
  try {
    r = await fetchTimeout(DATA_EMPLOI_BASE + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, TIMEOUT_MS, opts.fetchImpl);
  } catch {
    toCache(key, null, MISS_MS, now);
    return null;
  }
  if (r.status === 429 && !retried) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return callApi(opts, path, spec, true);
  }
  if (!r.ok) {
    toCache(key, null, MISS_MS, now);
    return null;
  }
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  toCache(key, data, data ? CACHE_MS : MISS_MS, now);
  return data;
}

function asArray(payload, key) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const v = payload[key];
  return Array.isArray(v) ? v : [];
}

async function territoryFor(place, opts) {
  const typesPayload = await callApi(opts, '/v1/referentiel/type-territoires');
  const types = asArray(typesPayload, 'typeTerritoires');
  if (!place) {
    const codeType = matchTerritoryType(types, 'france');
    if (!codeType) return null;
    const listed = await callApi(opts, `/v1/referentiel/territoires/${encodeURIComponent(codeType)}`);
    const row = pickFrance(asArray(listed, 'territoires'));
    if (!row?.codeTerritoire) return null;
    return { codeTypeTerritoire: row.codeTypeTerritoire || codeType, codeTerritoire: String(row.codeTerritoire) };
  }
  return resolveTerritory(place, types);
}

async function romeTypeCode(opts) {
  const typesPayload = await callApi(opts, '/v1/referentiel/type-activites');
  const types = asArray(typesPayload, 'typeActivites');
  const found = types.find(t => /rome/.test(norm(`${t.codeTypeActivite || ''} ${t.libelleTypeActivite || ''}`)));
  return found?.codeTypeActivite || (!types.length ? 'ROME' : null);
}

async function activityFor(query, opts) {
  const q = String(query || '').trim();
  if (!q) {
    const listed = await callApi(opts, '/v1/referentiel/activites/CUMUL');
    const rows = asArray(listed, 'activites');
    const hit = rows.length === 1 ? rows[0] : null;
    if (!hit?.codeActivite) return null;
    return { codeTypeActivite: hit.codeTypeActivite || 'CUMUL', codeActivite: String(hit.codeActivite), libelleActivite: String(hit.libelleActivite || '') };
  }
  const codeType = await romeTypeCode(opts);
  if (!codeType) return null;
  const listed = await callApi(opts, `/v1/referentiel/activites/${encodeURIComponent(codeType)}?filtreActivite=${encodeURIComponent(q)}`);
  const hit = pickActivite(asArray(listed, 'activites'), q);
  if (!hit?.codeActivite) return null;
  return { codeTypeActivite: hit.codeTypeActivite || codeType, codeActivite: String(hit.codeActivite), libelleActivite: String(hit.libelleActivite || '') };
}

function detailOf(list, id) {
  return (list || []).find(d => d && d.codeIndicateur === id) || null;
}
function periodCode(detail) {
  const list = detail?.listeTypesPeriodesIndicateur || [];
  const tri = list.find(t => t.codeTypePeriode === EXAMPLE_PERIOD);
  return (tri || list[0])?.codeTypePeriode || EXAMPLE_PERIOD;
}
function nomenclatureCode(detail) {
  const list = detail?.listeTypesNomenclaturesIndicateur || [];
  return list[0]?.codeTypeNomenclature || EXAMPLE_NOMENCLATURE;
}

async function salaryLabels(opts) {
  const payload = await callApi(opts, '/v1/referentiel/nomenclatures/TYPESALAIRE');
  const map = {};
  for (const row of asArray(payload, 'nomenclatures')) {
    const code = row?.codeNomenclature || row?.valeurNomenclature;
    if (code && row.libelleNomenclature) map[String(code)] = String(row.libelleNomenclature);
  }
  return map;
}

async function collectFigures(opts, territory, activity) {
  const detailPayloads = await Promise.all(INDICATORS.map(ind => callApi(opts, `/v1/referentiel/details-indicateurs?codeIndicateur=${encodeURIComponent(ind.id)}`)));
  const details = detailPayloads.flatMap(p => asArray(p, 'listeIndicateurs'));
  const byId = {};
  const tasks = [];
  if (activity) {
    for (const ind of INDICATORS) {
      const detail = detailOf(details, ind.id);
      if (detail && detail.disponibiliteIndicateur === 0) continue;
      const allowedTerr = detail?.listeTypesTerritoiresIndicateur;
      if (Array.isArray(allowedTerr) && allowedTerr.length && !allowedTerr.some(t => t.codeTypeTerritoire === territory.codeTypeTerritoire)) continue;
      const body = {
        codeTypeTerritoire: territory.codeTypeTerritoire,
        codeTerritoire: territory.codeTerritoire,
        codeTypeActivite: activity.codeTypeActivite,
        codeActivite: activity.codeActivite,
        codeTypePeriode: periodCode(detail),
        codeTypeNomenclature: nomenclatureCode(detail),
        dernierePeriode: true,
        sansCaracteristiques: true,
      };
      tasks.push(callApi(opts, ind.path, { method: 'POST', body }).then(payload => {
        const read = readIndicateur(payload);
        if (read) byId[ind.id] = { id: ind.id, title: ind.title, ...read };
      }));
    }
  }
  if (activity?.codeTypeActivite === 'ROME') {
    const salaryPath = `/v1/indicateur/salaire-rome-fap/${encodeURIComponent(territory.codeTypeTerritoire)}/${encodeURIComponent(territory.codeTerritoire)}?codeRome=${encodeURIComponent(activity.codeActivite)}`;
    tasks.push(Promise.all([callApi(opts, salaryPath), salaryLabels(opts)]).then(([payload, labels]) => {
      const read = readIndicateur(payload);
      if (!read) return;
      if (!read.libNomenclature && labels[read.codeNomenclature]) read.libNomenclature = labels[read.codeNomenclature];
      byId.SAL_3 = { id: 'SAL_3', title: 'Salaires en poste', ...read };
    }));
  }
  await Promise.all(tasks);
  const order = [...INDICATORS.map(i => i.id), 'SAL_3'];
  return order.map(id => byId[id]).filter(Boolean);
}

function snapshotFrom(figures, activity, coverageNote) {
  if (!figures.length) return null;
  return {
    activityLabel: activity?.libelleActivite || figures.find(f => f.libActivite)?.libActivite || '',
    territoryLabel: figures.find(f => f.libTerritoire)?.libTerritoire || '',
    coverageNote: coverageNote || '',
    figures,
  };
}

/** Chiffres d’une page métier et/ou d’un lieu. null si rien d’affichable. */
export async function loadMarketSnapshot(job, place, opts = {}) {
  try {
    if (!(await dataEmploiEnabled(opts))) return null;
    const territory = await territoryFor(place || null, opts);
    if (!territory) return null;
    const query = job?.slug === 'emploi' ? '' : (job?.q || '');
    const activity = await activityFor(query, opts);
    if (!activity) return null;
    let figures = await collectFigures(opts, territory, activity);
    let coverageNote = '';
    if (!figures.length && place?.type === 'commune' && place.dep && territory.codeTypeTerritoire !== 'DEP') {
      const types = asArray(await callApi(opts, '/v1/referentiel/type-territoires'), 'typeTerritoires');
      const dep = resolveTerritory({ type: 'departement', dep: place.dep, code: place.dep }, types);
      if (dep) {
        figures = await collectFigures(opts, dep, activity);
        if (figures.length) coverageNote = 'La commune n’est pas couverte par l’API : chiffres du territoire indiqué.';
      }
    }
    return snapshotFrom(figures, activity, coverageNote);
  } catch {
    return null;
  }
}

async function departmentTerritory(dept, opts) {
  const types = asArray(await callApi(opts, '/v1/referentiel/type-territoires'), 'typeTerritoires');
  return resolveTerritory({ type: 'departement', dep: dept, code: dept }, types);
}

/**
 * Chiffres du métier (code ROME) sur le département de l’offre.
 * France Travail : le code romeCode est utilisé tel quel.
 * Adzuna et Service Public : seulement si le libellé correspond à un seul ROME.
 * null si le département, le métier ou l’API manquent — l’encart reste masqué.
 */
export async function loadOfferMarket(job, opts = {}) {
  try {
    const dept = normalizeDept(job?.dept);
    if (!dept) return null;
    if (!(await dataEmploiEnabled(opts))) return null;
    const rome = normalizeRome(job?.rome);
    const query = rome ? '' : romeSearchText(job?.title, job?.city);
    if (!rome && !query) return null;
    const [territory, activity] = await Promise.all([
      departmentTerritory(dept, opts),
      rome
        ? romeTypeCode(opts).then(codeType => (codeType ? { codeTypeActivite: codeType, codeActivite: rome, libelleActivite: '' } : null))
        : activityFor(query, opts),
    ]);
    if (!territory || !activity?.codeActivite) return null;
    if (!rome && activity.codeTypeActivite !== 'ROME' && !/rome/i.test(activity.codeTypeActivite || '')) return null;
    const figures = await collectFigures(opts, territory, activity);
    const snap = snapshotFrom(figures, activity, '');
    const named = globalThis.TP_GEO?.depByCode?.(dept);
    if (snap && named?.label) snap.territoryLabel = named.label;
    // Mention de repli, comme sur les pages ville : la fiche affiche les chiffres du département, pas de la commune.
    if (snap) snap.coverageNote = 'Chiffres de l’ensemble du département.';
    if (snap && !snap.activityLabel) {
      const hint = String(job?.romeLabel || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (hint) snap.activityLabel = hint;
    }
    return snap;
  } catch {
    return null;
  }
}
