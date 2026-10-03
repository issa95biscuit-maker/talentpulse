/**
 * TalentPulse — Moteur de recherche multi-sources (France Travail + Adzuna)
 *
 * GET /api/jobs
 *   motsCles     mots-clés (texte libre)
 *   lieu         ville / code postal / département / région en texte libre
 *                (ex. "Lyon", "69003", "69", "Rhône", "Île-de-France")
 *   commune      code INSEE (ex. 69123) — rétro-compatible, accepte aussi un nom
 *   departement  code département (ex. 69) — rétro-compatible
 *   region       code région INSEE (ex. 11 = Île-de-France)
 *   contrat      CDI | CDD | Interim | Alternance | Stage
 *   publie       1 | 3 | 7 | 14 | 31 (jours)
 *   experience   debutant | 1 | 2 | 3   (FT : 1 = < 1 an, 2 = 1 à 3 ans, 3 = > 3 ans)
 *   niveau       NV5 | NV4 | NV3 | NV2 | NV1  (FT uniquement)
 *   temps        plein | partiel
 *   salaireMin   salaire annuel brut minimum (€)
 *   tri          pertinence | date
 *   page         1, 2, 3… (pagination serveur)
 *   source       all | ft | adzuna (liste séparée par des virgules)
 *   count=1      ne renvoie que les totaux (compteur de la page d'accueil)
 *   light=1      12 offres, champs minimaux (bandeau de l'accueil)
 *   id=ft_XXX    détail d'une offre France Travail
 *
 * Variables d'environnement : FT_CLIENT_ID, FT_CLIENT_SECRET, ADZUNA_APP_ID, ADZUNA_APP_KEY
 * (optionnelle : LBA_API_KEY — La Bonne Alternance, non branchée tant qu'elle n'existe pas)
 */

import '../public/assets/geo-fr.js';
const GEO = globalThis.TP_GEO;

const FT_PAGE_SIZE = 30;      // offres France Travail par page
const ADZ_PAGE_SIZE = 20;     // offres Adzuna par page
const FT_MAX_START = 3000;    // limite de l'API France Travail (range max 3000-3149)
const FETCH_TIMEOUT = 9000;

// ───────────────────────── Utilitaires ─────────────────────────
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
}

/** « responsable point de vente (h/f) (H/F) » -> « Responsable point de vente (H/F) » ; titres en MAJUSCULES -> casse normale */
const ACRONYMS = new Set(['CDI', 'CDD', 'BTP', 'RH', 'IT', 'SAV', 'VTC', 'ASH', 'AES', 'AESH', 'ATSEM', 'DRH', 'CAP', 'BEP', 'BTS', 'BAC', 'SNCF', 'RATP', 'PL', 'SPL', 'VL', 'CACES', 'SSIAP', 'ADV', 'QHSE', 'HSE', 'IDE', 'AS', 'DAF', 'PME', 'TPE', 'B2B', 'B2C', 'SEO', 'UX', 'UI', 'QA', 'SAP', 'ERP', 'CRM', 'IA', 'BIM', 'CVC', 'GMS', 'ETAM', 'EHPAD', 'SMS', 'CHU']);
function cleanTitle(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  const marker = /\s*[(\[]?\s*\b(?:h\s*\/\s*f\s*\/\s*x|f\s*\/\s*h\s*\/\s*x|h\s*\/\s*f|f\s*\/\s*h|h\s*-\s*f|f\s*-\s*h)\b\s*[)\]]?/gi;
  const had = marker.test(s);
  s = s.replace(marker, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s*[-–,/]\s*$/, '').trim();
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length > 6 && letters === letters.toUpperCase()) {
    s = s.toLowerCase().replace(/[a-zà-ÿ0-9]+/g, w => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
  }
  s = s.replace(/(\p{L})\s+\((e|ne|se|euse|ère|rice|trice)\)/gu, '$1($2)'); // « Employé (e) » -> « Employé(e) »
  if (had) s += ' (H/F)';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** « LA MIE CALINE » -> « La Mie Caline », « CONCESSIONS GARES FRANCE SAS » -> « Concessions Gares France SAS » */
const LEGAL = new Set(['SA', 'SAS', 'SASU', 'SARL', 'EURL', 'SNC', 'SCI', 'SCOP', 'GIE', 'SEM', 'SCM', 'SELARL', 'EI', 'EIRL', 'CHU', 'CHR', 'EHPAD', 'BTP', 'RH', 'IT', 'SNCF', 'RATP', 'EDF', 'GRDF', 'LCL', 'BNP', 'CIC', 'SFR', 'MSA', 'CPAM', 'CAF', 'UGAP', 'ADMR', 'ESAT', 'IME', 'GMS']);
function companyCase(c) {
  const s = String(c || '').replace(/\s+/g, ' ').trim();
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length <= 4 || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().replace(/[a-zà-ÿ0-9]+/g, (w, i, str) => {
    if (LEGAL.has(w.toUpperCase())) return w.toUpperCase();
    if (i > 0 && ['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'aux', 'au', 'd', 'l'].includes(w)) return w;
    if (i > 0 && w.length === 1 && /['’]/.test(str[i - 1])) return w; // GIRL'S -> Girl's
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+\n/g, '\n').trim();
}

function fmtNumber(n) {
  // 35000 -> "35 000" ; 11.88 -> "11,88"
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, ' ');
}

const PERIOD = { an: '€/an', mois: '€/mois', h: '€/h' };
const ANNUAL_FACTOR = { an: 1, mois: 12, h: 1607 }; // 1607 h = durée légale annuelle

function formatSalaryRange(min, max, period) {
  if (!min && !max) return '';
  const lo = min || max, hi = max || min;
  const unit = PERIOD[period] || '€';
  if (Math.round(lo) === Math.round(hi)) return `${fmtNumber(lo)} ${unit}`;
  return `${fmtNumber(lo)} – ${fmtNumber(hi)} ${unit}`;
}

/** "Annuel de 35000.0 Euros à 55000.0 Euros sur 12 mois" -> { label: "35 000 – 55 000 €/an", annualMin, annualMax } */
function parseFTSalary(libelle) {
  const raw = String(libelle || '').trim();
  if (!raw) return { label: '', annualMin: null, annualMax: null, extra: '' };
  const low = raw.toLowerCase();
  const period = low.startsWith('annuel') ? 'an' : low.startsWith('mensuel') ? 'mois' : low.startsWith('horaire') ? 'h' : null;
  const head = raw.split(' - ')[0];
  const nums = (head.match(/\d+(?:[.,]\d+)?/g) || []).map(n => parseFloat(n.replace(',', '.')));
  const amounts = nums.filter(n => !(/sur\s+\d+/i.test(head) && n <= 14 && nums.indexOf(n) === nums.length - 1));
  const extra = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : '';
  const months = (head.match(/sur\s+(\d+(?:[.,]\d+)?)\s+mois/i) || [])[1];
  if (!period || !amounts.length) return { label: raw, annualMin: null, annualMax: null, extra: '' };
  const min = amounts[0], max = amounts[1] || amounts[0];
  let label = formatSalaryRange(min, max, period);
  if (months && period === 'mois' && parseFloat(months) !== 12) label += ` sur ${months.replace('.', ',')} mois`;
  const f = ANNUAL_FACTOR[period];
  const m = period === 'mois' && months ? parseFloat(months.replace(',', '.')) : null;
  return {
    label,
    annualMin: Math.round(min * (m || f)),
    annualMax: Math.round(max * (m || f)),
    extra,
  };
}

/** Adzuna renvoie des montants annuels, mais certains annonceurs saisissent du mensuel ou de l'horaire. */
function formatAdzunaSalary(min, max, predicted) {
  const lo = Number(min) || 0, hi = Number(max) || 0;
  if (!lo && !hi) return { label: '', annualMin: null, annualMax: null };
  const ref = Math.max(lo, hi);
  const period = ref < 100 ? 'h' : ref < 8000 ? 'mois' : 'an';
  const label = formatSalaryRange(lo, hi, period) + (String(predicted) === '1' ? ' (estimation Adzuna)' : '');
  const f = ANNUAL_FACTOR[period];
  return { label, annualMin: Math.round((lo || hi) * f), annualMax: Math.round((hi || lo) * f) };
}

function parseYears(libelle) {
  const s = String(libelle || '').toLowerCase();
  if (!s || /d[ée]butant/.test(s)) return 0;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(an|mois)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return m[2] === 'mois' ? v / 12 : v;
}

export async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────── Géolocalisation (geo.api.gouv.fr) ─────────────────────────
const geoCache = new Map();
async function geoGet(path) {
  if (geoCache.has(path)) return geoCache.get(path);
  const r = await fetchWithTimeout('https://geo.api.gouv.fr' + path, { headers: { Accept: 'application/json' } }, 5000);
  if (!r.ok) throw new Error('geo ' + r.status);
  const data = await r.json();
  if (geoCache.size > 500) geoCache.clear();
  geoCache.set(path, data);
  return data;
}

/** « St-Étienne », « Ste Maxime » -> « Saint-Étienne », « Sainte Maxime » (geo.api ne connaît pas les abréviations) */
const expandSaint = t => String(t).replace(/\b(ste|st)\b\.?/gi, m => (/^ste/i.test(m) ? 'Sainte' : 'Saint'));

/**
 * Transforme une saisie libre (ou des codes) en critères exploitables :
 *   { type: 'commune'|'departement'|'region'|'none'|'unknown', insee, departement, region, distance,
 *     label, display, adzunaWhere }
 * Formats acceptés : « Argenteuil », « Saint-Denis (93) », « saint denis 974 », « 95100 », « 95 »,
 * « Val-d'Oise », « Île-de-France » / « ile de france » / « IDF », « Paris 15 » / « 75015 » / « Lyon 3e ».
 */
async function resolveLocation({ lieu, commune, departement, region }) {
  const none = { type: 'none', label: '', display: '', adzunaWhere: '' };
  let text = String(lieu || '').trim().slice(0, 100);
  const com = String(commune || '').trim(), dep = String(departement || '').trim(), reg = String(region || '').trim();

  const fromCommune = (c, extra = {}) => ({
    type: 'commune', insee: c.code, label: c.nom, departement: c.codeDepartement || '', distance: 10,
    display: c.nom, adzunaWhere: c.nom, ...extra,
  });
  const fromPlace = p => p.type === 'region'
    ? { type: 'region', region: p.code, label: p.label, display: p.label, adzunaWhere: p.label }
    : { type: 'departement', departement: p.code, label: p.label, display: p.label, adzunaWhere: p.label };
  const fromArr = a => ({ type: 'commune', insee: a.insee, label: a.label, display: a.display, departement: a.dep, distance: 3, adzunaWhere: a.city, arrondissement: true });

  try {
    // 1) Codes explicites (rétro-compatibilité et liens directs)
    if (!text) {
      if (/^\d[\dAB]\d{3}$/i.test(com)) {
        const code = com.toUpperCase();
        const plm = Object.values(GEO.PLM).find(c => Number(code) > c.insee0 && Number(code) <= c.insee0 + c.max);
        if (plm) return fromArr(GEO.parseArrondissement(plm.nom + ' ' + (Number(code) - plm.insee0)));
        const c = await geoGet(`/communes/${encodeURIComponent(code)}?fields=nom,code,codeDepartement`).catch(() => null);
        return fromCommune(c || { code, nom: code, codeDepartement: '' });
      }
      if (com) text = com;
      else if (dep) { const p = GEO.depByCode(dep); return p ? fromPlace(p) : none; }
      else if (reg) { const p = GEO.regByCode(reg); return p ? fromPlace(p) : none; }
      else return none;
    }

    // 2) Arrondissements de Paris, Lyon, Marseille (« Paris 15 », « 75015 », « Lyon 3e »)
    const arr = GEO.parseArrondissement(text) || (/^\d{5}$/.test(text) ? GEO.arrondissementByCp(text) : null);
    if (arr) return fromArr(arr);

    // 3) Code postal
    if (/^\d{5}$/.test(text)) {
      const list = await geoGet(`/communes?codePostal=${text}&fields=nom,code,codeDepartement,population`);
      if (Array.isArray(list) && list.length) {
        const best = list.slice().sort((a, b) => (b.population || 0) - (a.population || 0))[0];
        return fromCommune(best, { display: `${best.nom} (${text})` });
      }
      const p = GEO.depByCode(text.startsWith('97') ? text.slice(0, 3) : text.slice(0, 2));
      return p ? fromPlace(p) : { type: 'unknown', label: text, display: text, adzunaWhere: '' };
    }

    // 4) Département (code ou nom), région (nom ou alias : IDF, PACA…)
    const place = GEO.exactPlace(text);
    if (place && place.type === 'departement' && /^(\d{2,3}|2a|2b)$/i.test(text)) return fromPlace(place);

    // 5) « Commune (département) » : lève les homonymies (Saint-Denis 93 / 974)
    const nd = !place && GEO.parseNameDep(text);
    if (nd) {
      const list = await geoGet(`/communes?nom=${encodeURIComponent(expandSaint(nd.name))}&codeDepartement=${nd.dep}&fields=nom,code,codeDepartement,population&boost=population&limit=5`).catch(() => []);
      const c = (list || []).find(x => GEO.norm(x.nom) === GEO.norm(nd.name)) || (list || [])[0];
      if (c) return fromCommune(c, { display: `${c.nom} (${c.codeDepartement})` });
      return fromPlace(GEO.depByCode(nd.dep));
    }

    // 6) Nom de commune (geo.api.gouv.fr, toutes les communes de France)
    const n = GEO.norm(text);
    const q = expandSaint(text);
    const communes = await geoGet(`/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codeDepartement,population&boost=population&limit=8`).catch(() => []);
    const exacts = (communes || []).filter(c => GEO.norm(c.nom) === n).sort((a, b) => (b.population || 0) - (a.population || 0));
    const exact = exacts[0];
    // Une grande ville l'emporte sur un département homonyme (Paris), sinon le département / la région
    if (place && !(exact && place.type === 'departement' && (exact.population || 0) >= 20000)) return fromPlace(place);
    if (exact) return fromCommune(exact, exacts.length > 1 ? { display: `${exact.nom} (${exact.codeDepartement})` } : {});

    // 7) Approximation prudente (début de nom identique)
    const approx = (communes || []).find(c => GEO.norm(c.nom).startsWith(n) || n.startsWith(GEO.norm(c.nom)));
    if (approx) return fromCommune(approx, { approx: true });
    const sugg = GEO.suggestPlaces(text, 1)[0];
    if (sugg && sugg.type !== 'arrondissement') return { ...fromPlace(sugg), approx: true };
    return { type: 'unknown', label: text, display: text, adzunaWhere: text };
  } catch (e) {
    // geo.api.gouv.fr indisponible : référentiel local (départements, régions) ou texte brut
    const p = GEO.exactPlace(text || dep) || GEO.regByCode(reg);
    if (p) return fromPlace(p);
    return { type: 'unknown', label: text, display: text, adzunaWhere: text };
  }
}

// ───────────────────────── France Travail ─────────────────────────
let ftToken = null; // { value, exp }
export async function getFTToken() {
  if (ftToken && ftToken.exp > Date.now() + 30000) return ftToken.value;
  const clientId = (process.env.FT_CLIENT_ID || '').trim();
  const clientSecret = (process.env.FT_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  const r = await fetchWithTimeout('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api_offresdemploiv2 o2dsoffre' }),
  });
  if (!r.ok) throw new Error('FT token ' + r.status);
  const data = await r.json();
  ftToken = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 600) * 1000 };
  return ftToken.value;
}

const FT_CONTRACT = { CDI: 'CDI', CDD: 'CDD', MIS: 'Intérim', SAI: 'Saisonnier', LIB: 'Indépendant', FRA: 'Franchise', REP: 'Reprise d\'entreprise', CCE: 'Contrat chantier', TTI: 'Intérim', DDI: 'CDD', DIN: 'CDI intérimaire' };

function ftSourceSite(j) {
  const url = j.origineOffre?.urlOrigine || '';
  if (!url || /francetravail\.fr|pole-emploi\.fr/.test(url)) return 'France Travail';
  const p = (j.origineOffre?.partenaires || [])[0];
  if (p?.nom) return p.nom;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'France Travail'; }
}

// « Lyon 6e Arrondissement » → « Lyon 6e », « St Priest » → « Saint-Priest »
function cleanCity(c) {
  return String(c || '')
    .replace(/\b(\d{1,2})\s*(e|er|ème|eme)\s+arrondissement\b/i, (_, n, s) => n + (n === '1' ? 'er' : 'e'))
    .replace(/^(St|Ste)\s+(?=\p{L})/u, (_, s) => (s === 'St' ? 'Saint-' : 'Sainte-'))
    .replace(/^(Paris|Lyon|Marseille)\s+0?(\d{1,2})$/i, (_, v, n) => `${v} ${n}${n === '1' ? 'er' : 'e'}`)
    .trim();
}

// « 2 An(s) », « Expérience exigée de 6 Mois » → « 2 ans d’expérience », « 6 mois d’expérience »
function cleanExp(libelle) {
  const s = String(libelle || '').trim();
  if (!s) return '';
  if (/d[ée]butant/i.test(s)) return 'Débutant accepté';
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(an|mois)/i);
  if (!m) return s.charAt(0).toUpperCase() + s.slice(1);
  const n = m[1].replace('.', ',');
  const unit = /mois/i.test(m[2]) ? 'mois' : (parseFloat(m[1].replace(',', '.')) >= 2 ? 'ans' : 'an');
  return `${n} ${unit} d’expérience`;
}

function parseFTCity(libelle) {
  const m = String(libelle || '').match(/^\s*(\d{2,3}|2A|2B)\s*-\s*(.+)$/i);
  if (m) return { city: cleanCity(titleCase(m[2])), dept: m[1].toUpperCase() };
  return { city: cleanCity(titleCase(libelle || '')), dept: '' };
}

function mapFT(j) {
  const sal = parseFTSalary(j.salaire?.libelle);
  const { city, dept } = parseFTCity(j.lieuTravail?.libelle);
  const contract = j.alternance ? 'Alternance' : (FT_CONTRACT[j.typeContrat] || j.typeContratLibelle || j.typeContrat || '');
  const tempsLib = j.dureeTravailLibelleConverti || '';
  const avantages = [j.salaire?.complement1, j.salaire?.complement2, sal.extra, j.salaire?.commentaire].filter(Boolean).join(' · ');
  const posted = j.dateCreation ? new Date(j.dateCreation).toISOString() : '';
  return {
    id: 'ft_' + j.id,
    source: 'France Travail',
    sourceSite: ftSourceSite(j),
    title: cleanTitle(j.intitule) || 'Poste non précisé',
    company: companyCase(j.entreprise?.nom || ''),
    city: city || (dept ? '' : 'France'),
    dept,
    contract,
    contractDetail: j.typeContratLibelle || '',
    salary: sal.label,
    salaryMin: sal.annualMin,
    salaryMax: sal.annualMax,
    exp: cleanExp(j.experienceLibelle),
    expYears: j.experienceExige === 'D' ? 0 : parseYears(j.experienceLibelle),
    desc: j.description || '',
    descIsExcerpt: false,
    url: j.origineOffre?.urlOrigine || (j.origineOffre?.partenaires || [])[0]?.url || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
    posted,
    updated: j.dateActualisation ? new Date(j.dateActualisation).toISOString() : posted,
    // Logo de l'entreprise fourni par l'API (la licence France Travail impose de l'afficher avec l'offre)
    logo: /^https:\/\/entreprise\.francetravail\.fr\//.test(j.entreprise?.logo || '') ? j.entreprise.logo : '',
    cat: j.secteurActiviteLibelle || '',
    horaires: [j.dureeTravailLibelle, j.complementExercice].filter(Boolean).join(' · '),
    tempsPlein: /partiel/i.test(tempsLib) ? 'Temps partiel' : /plein/i.test(tempsLib) ? 'Temps plein' : '',
    permis: (j.permis || []).map(p => p.libelle + (p.exigence === 'E' ? ' (exigé)' : p.exigence === 'S' ? ' (souhaité)' : '')).join(', '),
    langues: (j.langues || []).map(l => l.libelle).join(', '),
    niveauEtudes: (j.formations || []).map(f => [f.niveauLibelle, f.domaineLibelle].filter(Boolean).join(' — ')).join(', '),
    competences: (j.competences || []).map(c => c.libelle).join(', '),
    qualites: (j.qualitesProfessionnelles || []).map(q => q.libelle).join(', '),
    avantages,
    structured: true,
  };
}

async function fetchFT(ctx) {
  const token = await getFTToken();
  if (!token) return { resultats: [], total: 0, disabled: true };
  const p = new URLSearchParams();
  // France Travail refuse certains caractères (/, (, ), : …) dans motsCles : on les neutralise
  const kw = [ctx.keyword, ctx.contrat === 'Stage' ? 'stage' : ''].filter(Boolean).join(' ')
    .replace(/[^\p{L}\p{N}\s,'’.+#-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (kw) p.append('motsCles', kw);
  const start = (ctx.page - 1) * FT_PAGE_SIZE;
  if (start > FT_MAX_START) return { resultats: [], total: null };
  p.append('range', `${start}-${start + FT_PAGE_SIZE - 1}`);
  const loc = ctx.loc;
  if (loc.type === 'commune' && loc.insee) { p.append('commune', loc.insee); p.append('distance', String(loc.distance ?? 10)); }
  else if (loc.type === 'departement' && loc.departement) p.append('departement', loc.departement);
  else if (loc.type === 'region' && loc.region) p.append('region', loc.region);
  if (ctx.contrat === 'CDI') p.append('typeContrat', 'CDI');
  if (ctx.contrat === 'CDD') p.append('typeContrat', 'CDD');
  if (ctx.contrat === 'Interim') p.append('typeContrat', 'MIS');
  if (ctx.contrat === 'Alternance') p.append('natureContrat', 'E2,FS');
  if (ctx.publie) p.append('publieeDepuis', ctx.publie);
  if (ctx.experience === 'debutant') p.append('experienceExigence', 'D');
  else if (['1', '2', '3'].includes(ctx.experience)) p.append('experience', ctx.experience);
  if (ctx.niveau) p.append('niveauFormation', ctx.niveau);
  if (ctx.temps === 'plein') p.append('tempsPlein', 'true');
  if (ctx.temps === 'partiel') p.append('tempsPlein', 'false');
  if (ctx.salaireMin) { p.append('salaireMin', String(ctx.salaireMin)); p.append('periodeSalaire', 'A'); }
  if (ctx.tri === 'date') p.append('sort', '1');

  const r = await fetchWithTimeout(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${p}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (r.status === 204) return { resultats: [], total: 0 };
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`FT search ${r.status}: ${body.slice(0, 160)}`);
  }
  const cr = (r.headers.get('Content-Range') || '').match(/\/(\d+)$/);
  const data = await r.json();
  return { resultats: (data.resultats || []).map(mapFT), total: cr ? parseInt(cr[1], 10) : (data.resultats || []).length };
}

async function fetchFTById(id) {
  const token = await getFTToken();
  if (!token) return null;
  const r = await fetchWithTimeout(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (r.status === 204 || r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error('FT offre ' + r.status);
  return mapFT(await r.json());
}

// ───────────────────────── Adzuna ─────────────────────────
function mapAdzuna(j) {
  const sal = formatAdzunaSalary(j.salary_min, j.salary_max, j.salary_is_predicted);
  const contract = j.contract_type === 'permanent' ? 'CDI' : j.contract_type === 'contract' ? 'CDD' : '';
  const tempsPlein = j.contract_time === 'full_time' ? 'Temps plein' : j.contract_time === 'part_time' ? 'Temps partiel' : '';
  return {
    id: 'adz_' + j.id,
    source: 'Adzuna',
    sourceSite: 'Adzuna',
    title: cleanTitle(stripHtml(j.title)) || 'Poste',
    company: companyCase(stripHtml(j.company?.display_name || '')),
    city: cleanCity(String(j.location?.display_name || '').split(',')[0].trim()) || 'France',
    dept: '',
    contract,
    contractDetail: '',
    salary: sal.label,
    salaryMin: sal.annualMin,
    salaryMax: sal.annualMax,
    exp: '',
    expYears: null,
    desc: stripHtml(j.description || ''),
    descIsExcerpt: true,
    url: j.redirect_url || 'https://www.adzuna.fr',
    posted: j.created ? new Date(j.created).toISOString() : '',
    cat: j.category?.label || '',
    horaires: '', tempsPlein, permis: '', langues: '', niveauEtudes: '', competences: '', qualites: '', avantages: '',
    structured: false,
  };
}

async function fetchAdzuna(ctx) {
  const appId = (process.env.ADZUNA_APP_ID || '').trim();
  const appKey = (process.env.ADZUNA_APP_KEY || '').trim();
  if (!appId || !appKey) return { resultats: [], total: 0, disabled: true };
  // Filtres que seule France Travail sait appliquer : on n'affiche pas d'offres Adzuna non filtrées.
  if (ctx.experience || ctx.niveau) return { resultats: [], total: 0, skipped: 'filtres France Travail uniquement' };
  const extra = ctx.contrat === 'Interim' ? 'intérim' : ctx.contrat === 'Alternance' ? 'alternance' : ctx.contrat === 'Stage' ? 'stage' : '';
  const p = new URLSearchParams({ results_per_page: String(ctx.count ? 1 : ADZ_PAGE_SIZE) });
  const what = [ctx.keyword, extra].filter(Boolean).join(' ').trim();
  if (what) p.set('what', what);
  if (ctx.loc.adzunaWhere) { p.set('where', ctx.loc.adzunaWhere); if (ctx.loc.type === 'commune' && !ctx.loc.arrondissement) p.set('distance', '10'); }
  if (ctx.contrat === 'CDI') p.set('permanent', '1');
  if (ctx.contrat === 'CDD') p.set('contract', '1');
  if (ctx.temps === 'plein') p.set('full_time', '1');
  if (ctx.temps === 'partiel') p.set('part_time', '1');
  if (ctx.publie) p.set('max_days_old', String(ctx.publie));
  if (ctx.salaireMin) p.set('salary_min', String(ctx.salaireMin));
  if (ctx.tri === 'date') p.set('sort_by', 'date');
  const r = await fetchWithTimeout(`https://api.adzuna.com/v1/api/jobs/fr/search/${ctx.page}?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&${p}`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('Adzuna ' + r.status);
  const data = await r.json();
  return { resultats: (data.results || []).map(mapAdzuna), total: Number(data.count) || 0 };
}

// ───────────────────────── Déduplication ─────────────────────────
function cityKey(c) { return norm(String(c || '').split(',')[0]).replace(/\b\d+(e|er)?\b/g, '').trim(); }

function dedupe(jobs) {
  const seen = new Set();
  const byAd = new Map(); // même annonce publiée dans N villes (fréquent sur Adzuna)
  const out = [];
  for (const j of jobs) {
    const key = norm(j.title) + '|' + norm(j.company) + '|' + cityKey(j.city);
    if (seen.has(key)) continue;
    seen.add(key);
    const adKey = norm(j.title) + '|' + norm(j.company) + '|' + norm(j.desc).slice(0, 140);
    if (j.company && byAd.has(adKey)) { byAd.get(adKey).otherLocations++; continue; }
    const copy = { ...j, otherLocations: 0 };
    if (j.company) byAd.set(adKey, copy);
    out.push(copy);
  }
  return out;
}

function interleave(batches) {
  const out = [];
  const max = Math.max(0, ...batches.map(b => b.length));
  for (let i = 0; i < max; i++) for (const b of batches) if (b[i]) out.push(b[i]);
  return out;
}

// ───────────────────────── Recherche ─────────────────────────
/** Exécute une recherche. q = paramètres de requête (voir en-tête). Retourne { status, body, cache }. */
export async function searchJobs(q = {}) {
  try {
    // Détail d'une offre
    if (q.id) {
      const id = String(q.id);
      if (!id.startsWith('ft_')) return { status: 404, body: { error: 'Offre introuvable.' } };
      const offre = await fetchFTById(id.slice(3));
      if (!offre) return { status: 404, body: { error: 'Offre introuvable ou expirée.' } };
      return { status: 200, cache: 'public, s-maxage=600, stale-while-revalidate=3600', body: { offre } };
    }

    const keyword = String(q.motsCles || q.q || '').trim().slice(0, 120);
    const page = Math.max(1, Math.min(100, parseInt(q.page || '1', 10) || 1));
    const allowed = { contrat: ['CDI', 'CDD', 'Interim', 'Alternance', 'Stage'], publie: ['1', '3', '7', '14', '31'], experience: ['debutant', '1', '2', '3'], niveau: ['NV5', 'NV4', 'NV3', 'NV2', 'NV1'], temps: ['plein', 'partiel'], tri: ['pertinence', 'date'] };
    const pick = (k) => (allowed[k].includes(String(q[k] || '')) ? String(q[k]) : '');
    const ctx = {
      keyword, page,
      contrat: pick('contrat'), publie: pick('publie'), experience: pick('experience'), niveau: pick('niveau'),
      temps: pick('temps'), tri: pick('tri'),
      salaireMin: Math.max(0, Math.min(300000, parseInt(q.salaireMin || '0', 10) || 0)),
      count: q.count === '1',
    };
    // Rétro-compatibilité : ancien paramètre range=0-49
    if (!q.page && q.range) {
      const start = parseInt(String(q.range).split('-')[0], 10) || 0;
      ctx.page = Math.floor(start / FT_PAGE_SIZE) + 1;
    }
    ctx.loc = await resolveLocation({ lieu: q.lieu, commune: q.commune, departement: q.departement, region: q.region });

    const requested = (!q.source || q.source === 'all') ? ['ft', 'adzuna'] : String(q.source).split(',').map(s => s.trim());
    const errors = {};
    const meta = {};
    const run = async (name, fn) => {
      try { const r = await fn(ctx); if (r.disabled) meta[name] = 'non configurée'; if (r.skipped) meta[name] = r.skipped; return r; }
      catch (e) { errors[name] = 'Source temporairement indisponible'; console.error('[jobs]', name, e.message); return { resultats: [], total: 0 }; }
    };
    const sources = { ft: fetchFT, adzuna: fetchAdzuna };
    const names = requested.filter(s => sources[s]);
    const results = await Promise.all(names.map(n => run(n, sources[n])));
    const totals = {};
    names.forEach((n, i) => { totals[n] = results[i].total || 0; });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);

    const cache = 'public, s-maxage=300, stale-while-revalidate=900';
    if (ctx.count) {
      return { status: 200, cache: 'public, s-maxage=3600, stale-while-revalidate=86400', body: { total, totals, errors: Object.keys(errors).length ? errors : undefined } };
    }

    let merged = dedupe(interleave(results.map(r => r.resultats || [])));
    // light=1 : champs minimaux (bandeau « dernières offres » de l'accueil)
    if (q.light === '1') merged = merged.slice(0, 12).map(({ id, title, company, city, contract, posted, source }) => ({ id, title, company, city, contract, posted, source }));
    const hasMore = (names.includes('ft') && page * FT_PAGE_SIZE < Math.min(totals.ft || 0, FT_MAX_START + FT_PAGE_SIZE))
      || (names.includes('adzuna') && page * ADZ_PAGE_SIZE < (totals.adzuna || 0));

    return { status: 200, cache: Object.keys(errors).length ? 'no-store' : cache, body: {
      resultats: merged,
      total,
      totals,
      page,
      hasMore,
      location: ctx.loc.type === 'none' ? null : { type: ctx.loc.arrondissement ? 'arrondissement' : ctx.loc.type, label: ctx.loc.label, display: ctx.loc.display || ctx.loc.label, code: ctx.loc.insee || ctx.loc.departement || ctx.loc.region || '', approx: !!ctx.loc.approx },
      sources: names,
      notes: Object.keys(meta).length ? meta : undefined,
      errors: Object.keys(errors).length ? errors : undefined,
    } };
  } catch (e) {
    console.error('[jobs] fatal', e);
    return { status: 500, cache: 'no-store', body: { error: 'Le service de recherche est temporairement indisponible.' } };
  }
}


export const _test = { cleanCity, cleanExp, cleanTitle, companyCase, parseFTSalary, formatAdzunaSalary, resolveLocation, dedupe, mapFT, mapAdzuna, parseFTCity, stripHtml, parseYears };
