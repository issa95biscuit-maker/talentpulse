/**
 * Pages d'atterrissage SEO rendues côté serveur (fonction Vercel + cache CDN).
 * /offres/:metier[/:lieu] → index.html enrichi : title/meta/canonical/robots uniques, H1, introduction
 * calculée sur les offres réelles, 1re page d'offres en HTML, fil d'Ariane (BreadcrumbList JSON-LD),
 * maillage interne. Les listes n'embarquent pas de JobPosting : le balisage est réservé
 * à la fiche /offre/:id, et seulement quand l'annonce source a les champs obligatoires.
 */
import { readFileSync } from 'node:fs';
import '../public/assets/display-text.js';
import { searchJobs } from './jobs.js';
import { adzunaDetailsUrl } from './job-store.js';
import { formatJobsCount } from './jobs-count.js';
import { mapCSP } from './sources-csp.js';
import { jobDescriptionHtml, jobDescriptionText, jobPostingLd, jobPostingScript, missingRequired } from './jobposting.js';
import { JOBS, PLACES, JOB_BY_SLUG, PLACE_BY_SLUG, isCurated, nearbyPlaces, relatedJobs, curatedPaths, slugify } from './seo-data.js';

export const SITE = 'https://talentpulse-topaz.vercel.app';
export const CACHE_OK = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_SHELL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

let shell = null;
const loadShell = () => (shell ||= readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = n => Number(n || 0).toLocaleString('fr-FR').replace(/[\s\u00a0\u202f]/g, '\u202f');
const typo = t => String(t).replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
const plural = (n, one, many) => `${nb(n)} ${n > 1 ? many : one}`;
const shownTitle = j => globalThis.TP_DISPLAY.displayTitle(j?.title || '');
const shownCompany = j => globalThis.TP_DISPLAY.displayCompany(j?.company || '');

/** « Serveur / Serveuse » → « Serveur » ; « Technicien / Technicienne de maintenance » → « Technicien de maintenance » */
export function shortLabel(job) {
  if (job.short) return job.short;
  const [a, b] = job.label.split(' / ');
  if (!b) return a;
  const wa = a.split(' '), wb = b.split(' ');
  return wb.length > wa.length ? [...wa, ...wb.slice(wa.length)].join(' ') : a;
}
/** Complément « offres d'emploi … » : « de serveur / serveuse », « d’infirmier / infirmière », « dans le BTP » */
export function jobOf(job) {
  if (job.of) return job.of;
  const l = job.label.toLowerCase();
  return (/^[aeiouyhéèêâî]/i.test(l) ? 'd’' : 'de ') + l;
}
const SECTORS = { logistique: 'en logistique', btp: 'dans le BTP', marketing: 'en marketing' };
for (const [slug, of] of Object.entries(SECTORS)) JOB_BY_SLUG.get(slug).of = of;
JOB_BY_SLUG.get('assistant-administratif').short = 'Assistant administratif';
JOB_BY_SLUG.get('agent-d-entretien').short = 'Agent d’entretien';
JOB_BY_SLUG.get('agent-de-securite').short = 'Agent de sécurité';
JOB_BY_SLUG.get('aide-soignant').short = 'Aide-soignant';

export const pathOf = (job, place) => `/offres/${job ? job.slug : 'emploi'}${place ? '/' + place.slug : ''}`;
const placeIn = place => place ? place.in : 'en France';
const scope = place => !place ? 'dans toute la France' : place.type === 'commune' ? `${place.in} et dans un rayon de 10\u00a0km` : place.type === 'departement' ? `dans tout le département (${place.code})` : 'dans toute la région';

export function headings(job, place) {
  const isAll = job.slug === 'emploi';
  const h1 = isAll ? `Offres d’emploi ${placeIn(place)}` : `Offres d’emploi ${jobOf(job)} ${placeIn(place)}`;
  return { h1, short: isAll ? 'Offres d’emploi' : shortLabel(job) };
}

// ── Statistiques calculées sur les offres de la 1re page ──
const CONTRACT_ORDER = ['CDI', 'CDD', 'Intérim', 'Alternance', 'Saisonnier', 'CDI intérimaire', 'Indépendant'];
const CONTRACT_WORD = { 'Intérim': 'en intérim', 'Alternance': 'en alternance', 'Saisonnier': 'saisonniers', 'Indépendant': 'en indépendant', 'CDI intérimaire': 'en CDI intérimaire' };
export function stats(jobs) {
  const counts = {};
  for (const j of jobs) if (j.contract) counts[j.contract] = (counts[j.contract] || 0) + 1;
  const contracts = Object.entries(counts).sort((a, b) => b[1] - a[1] || CONTRACT_ORDER.indexOf(a[0]) - CONTRACT_ORDER.indexOf(b[0]));
  const sal = jobs.filter(j => j.salaryMin || j.salaryMax).map(j => ((j.salaryMin || j.salaryMax) + (j.salaryMax || j.salaryMin)) / 2 / 12).filter(m => m >= 300 && m <= 20000).sort((a, b) => a - b);
  const median = sal.length >= 3 ? Math.round((sal.length % 2 ? sal[(sal.length - 1) / 2] : (sal[sal.length / 2 - 1] + sal[sal.length / 2]) / 2) / 50) * 50 : null;
  const q = p => Math.round(sal[Math.min(sal.length - 1, Math.floor(p * (sal.length - 1)))] / 50) * 50;
  const companies = {};
  for (const j of jobs) if (j.company && !/confidenti/i.test(j.company)) companies[j.company] = (companies[j.company] || 0) + 1;
  const topCompanies = Object.entries(companies).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  const week = jobs.filter(j => j.posted && Date.now() - new Date(j.posted).getTime() < 7 * 86400000).length;
  const beginners = jobs.filter(j => /débutant/i.test(j.exp || '')).length;
  return { n: jobs.length, contracts, withSalary: sal.length, median, low: sal.length >= 5 ? q(0.25) : null, high: sal.length >= 5 ? q(0.75) : null, topCompanies, week, beginners };
}
const contractPhrase = (c, n) => `${nb(n)} ${CONTRACT_WORD[c] || c}`;

export function introHtml(job, place, total, st) {
  const isAll = job.slug === 'emploi';
  const what = isAll ? 'offres d’emploi' : `offres ${jobOf(job)}`;
  const first = total
    ? `<p><strong>${plural(total, what.replace(/^offres/, 'offre'), what)}</strong> ${total > 1 ? 'publiées' : 'publiée'} sur France Travail ${scope(place)}, complétées ensuite par Adzuna et Choisir le Service Public (le total toutes sources s’affiche au-dessus de la liste). Chaque offre renvoie vers l’annonce d’origine pour postuler.</p>`
    : `<p>Aucune ${what.replace(/^offres/, 'offre')} n’est publiée sur France Travail ${scope(place)} en ce moment. Élargissez la zone avec les liens ci-dessous ou enregistrez la recherche pour être prévenu.</p>`;
  return typo(first);
}

export function marketHtml(job, place, total, st) {
  const { short } = headings(job, place);
  const items = [];
  if (st.contracts.length) items.push(`<li><strong>Contrats</strong> : ${st.contracts.slice(0, 4).map(([c, n]) => contractPhrase(c, n)).join(', ')} parmi les ${nb(st.n)} premières offres.</li>`);
  if (st.median) items.push(`<li><strong>Salaires affichés</strong> : ${nb(st.withSalary)} offres sur ${nb(st.n)} indiquent un salaire, médiane d’environ ${nb(st.median)}\u00a0€ brut par mois${st.low && st.high && st.low !== st.high ? ` (la moitié entre ${nb(st.low)} et ${nb(st.high)}\u00a0€)` : ''}, en équivalent temps plein.</li>`);
  else if (st.n) items.push(`<li><strong>Salaires</strong> : ${st.withSalary ? `seules ${nb(st.withSalary)} offres sur ${nb(st.n)} affichent un salaire` : 'peu d’offres affichent un salaire'} ; pensez au filtre « Salaire annuel minimum » pour cibler celles qui le précisent.</li>`);
  if (st.week) items.push(`<li><strong>Fraîcheur</strong> : ${plural(st.week, 'offre publiée', 'offres publiées')} ces 7 derniers jours.</li>`);
  if (st.beginners) items.push(`<li><strong>Débutants</strong> : ${plural(st.beginners, 'offre accepte', 'offres acceptent')} les candidats sans expérience.</li>`);
  if (st.topCompanies.length >= 2) items.push(`<li><strong>Employeurs qui recrutent</strong> : ${st.topCompanies.map(esc).join(', ')}.</li>`);
  const title = job.slug === 'emploi' ? `L’emploi ${placeIn(place)} en bref` : `${short} ${placeIn(place)} : le marché en bref`;
  return typo(`<h2>${esc(title)}</h2>${job.blurb ? `<p>${esc(job.blurb)}</p>` : ''}${items.length ? `<ul>${items.join('')}</ul>` : ''}<p class="seo-note">Chiffres calculés sur la 1<sup>re</sup> page France Travail ci-dessus (${nb(st.n)} offres affichées, ${nb(total)} au total France Travail), mis à jour toutes les heures.</p>`);
}

export function linksHtml(job, place) {
  const groups = [];
  const link = (j, p, text) => `<li><a href="${pathOf(j, p)}">${esc(text)}</a></li>`;
  const isAll = job.slug === 'emploi';
  const rel = relatedJobs(job, place);
  if (rel.length) groups.push([isAll ? `Métiers qui recrutent ${placeIn(place)}` : `Autres métiers ${placeIn(place)}`, rel.slice(0, 8).map(j => link(j, place, shortLabel(j)))]);
  const near = nearbyPlaces(place, job);
  if (near.length) groups.push([place ? `${headings(job, place).short} à proximité` : `${headings(job, place).short} par région`, near.map(p => link(job, p, `${headings(job, p).short} ${p.in}`))]);
  if (place) {
    const others = [];
    if (!isAll) others.push(link(job, null, `${shortLabel(job)} en France`), link(JOB_BY_SLUG.get('emploi'), place, `Toutes les offres ${place.in}`));
    const cities = PLACES.filter(p => p.type === 'commune' && p.top && p !== place && isCurated(job, p) && !near.includes(p)).slice(0, 6);
    others.push(...cities.map(p => link(job, p, `${headings(job, p).short} ${p.in}`)));
    if (others.length) groups.push(['Autres recherches', others]);
  } else {
    groups.push(['Grandes villes', PLACES.filter(p => p.type === 'commune' && p.top).map(p => link(job, p, `${headings(job, p).short} ${p.in}`))]);
  }
  return `<h2>Recherches associées</h2><div class="seo-links">${groups.map(([t, items]) => `<div><h3>${esc(t)}</h3><ul>${items.join('')}</ul></div>`).join('')}</div>`;
}

export function crumbs(job, place) {
  const list = [['Accueil', '/'], ['Offres d’emploi', '/offres/emploi']];
  if (job.slug !== 'emploi') list.push([shortLabel(job), pathOf(job, null)]);
  if (place) list.push([place.name, pathOf(job, place)]);
  return list;
}
export function crumbsHtml(list) {
  return `<ol>${list.map(([name, href], i) => i === list.length - 1 ? `<li><span aria-current="page">${esc(name)}</span></li>` : `<li><a href="${href}">${esc(name)}</a></li>`).join('')}</ol>`;
}
export function crumbsJsonLd(list) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + (href === '/' ? '/' : href) })) });
}

// ── Carte d'offre : même balisage que jobCard() dans public/assets/app.js ──
const AVATAR_COLORS = [['#FFEDD5', '#9A3412'], ['#E0F2FE', '#075985'], ['#EDE9FE', '#5B21B6'], ['#D1FAE5', '#065F46'], ['#FEE2E2', '#991B1B'], ['#FEF3C7', '#92400E'], ['#FCE7F3', '#9D174D'], ['#CFFAFE', '#155E75']];
function avatarStyle(name) { let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length]; return `--av-bg:${bg};--av-fg:${fg}`; }
const svg = id => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
export function ageDays(iso, now = Date.now()) {
  const d = new Date(iso); if (!iso || isNaN(d)) return null;
  return Math.floor((now - d.getTime()) / 86400000);
}
export function relativeDate(iso, now = Date.now()) {
  const days = ageDays(iso, now);
  if (days === null) return '';
  if (days <= 0) return 'Aujourd\'hui'; if (days === 1) return 'Il y a 1 jour';
  if (days < 90) return `Il y a ${days} jours`;
  const m = Math.floor(days / 30); if (m === 1) return 'Il y a 1 mois'; if (m < 12) return `Il y a ${m} mois`;
  const y = Math.floor(m / 12); return y === 1 ? 'Il y a 1 an' : `Il y a ${y} ans`;
}
export function cardHtml(j) {
  const title = shownTitle(j) || j.title || '';
  const company = shownCompany(j);
  const name = company || title || '?';
  const loc = j.city ? `${j.city}${j.dept && !/\((?:dép\.|région)\)$/.test(j.city) && !String(j.city).includes(j.dept) ? ' (' + j.dept + ')' : ''}` : '';
  const when = relativeDate(j.posted || j.updated);
  const days = ageDays(j.posted || j.updated);
  const fresh = when === 'Aujourd\'hui' || when === 'Il y a 1 jour';
  const stale = days !== null && days > 30;
  const contractLabel = j.contract || 'Contrat non communiqué';
  const salaryLabel = j.salary || (j.publicSector ? 'Grille de la fonction publique' : 'Salaire non communiqué');
  const avatar = j.logo ? `<div class="co-avatar co-logo" aria-hidden="true"><img src="${esc(j.logo)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>` : `<div class="co-avatar" style="${avatarStyle(name)}" aria-hidden="true">${esc(name[0].toUpperCase())}</div>`;
  return `<article class="job" data-id="${esc(j.id)}">
    ${avatar}
    <div class="job-main">
      <h2 class="job-title"><a class="job-link" href="/offre/${encodeURIComponent(j.id)}" data-id="${esc(j.id)}">${esc(title)}</a></h2>
      <div class="job-co"><span>${company ? esc(company) : '<span class="muted">Entreprise non communiquée</span>'}</span>${loc ? `<span class="sep" aria-hidden="true">•</span><span class="job-loc">${svg('map-pin')}${esc(loc)}</span>` : ''}</div>
    </div>
    <div class="job-actions">
      <button class="share-btn" type="button" data-share="${esc(j.id)}" aria-label="Partager l’offre ${esc(title)}">${svg('share')}</button>
      <button class="save-btn" type="button" data-id="${esc(j.id)}" aria-pressed="false" aria-label="Ajouter aux favoris : ${esc(title)}">${svg('bookmark')}</button>
    </div>
    <div class="job-meta">
      <span class="tag tag-brand${j.contract ? '' : ' is-unknown'}">${esc(contractLabel)}</span>
      <span class="tag job-sal">${j.salary ? svg('euro') : ''}${esc(salaryLabel)}</span>
      ${j.exp ? `<span class="tag">${esc(j.exp)}</span>` : ''}
      ${j.otherLocations ? `<span class="tag">+${j.otherLocations} autre${j.otherLocations > 1 ? 's' : ''} lieu${j.otherLocations > 1 ? 'x' : ''}</span>` : ''}
    </div>
    <div class="job-foot">
      <div class="job-foot-left">
        <span class="src src-ft">${svg('landmark')}France Travail</span>
        ${when ? `<span class="job-time${fresh ? ' fresh' : ''}${stale ? ' stale' : ''}">${fresh ? '<span class="fresh-dot" aria-hidden="true"></span>Nouveau · ' : ''}${esc(when)}</span>` : ''}
      </div>
      <div class="job-foot-right"><a class="btn btn-primary btn-sm job-apply" href="/offre/${encodeURIComponent(j.id)}" aria-label="Postuler : ${esc(title)}">${svg('send')}Postuler</a></div>
    </div>
  </article>`;
}

// Cache mémoire (instance chaude) en plus du cache CDN : 10 min, 300 entrées max
const memo = new Map();
async function cachedSearch(job, place) {
  const key = job.slug + '/' + (place ? place.slug : '');
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < 600000) return hit.r;
  const r = await searchJobs({ motsCles: job.q, lieu: place ? place.name : '', source: 'ft' });
  if (r.status === 200 && !r.body.errors) { memo.set(key, { t: Date.now(), r }); if (memo.size > 300) memo.delete(memo.keys().next().value); }
  return r;
}
export const _clearCache = () => memo.clear();

// ── Remplacements dans index.html ──
function setMeta(html, { title, description, canonical, robots }) {
  const r = (re, val) => { if (!re.test(html)) throw new Error('seo: motif introuvable ' + re); html = html.replace(re, val); };
  r(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  r(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  r(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`);
  r(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  r(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  r(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  r(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
  r(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(title)}">`);
  r(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(description)}">`);
  return html;
}
const jsonScript = (id, type, obj) => `<script type="${type}"${id ? ` id="${id}"` : ''}>${(typeof obj === 'string' ? obj : JSON.stringify(obj)).replace(/</g, '\\u003c')}</script>`;

/** Un seul h1 : celui de la vue active. Les titres des autres vues (accueil, lettre, compte…) passent en h2. */
function keepOneH1(html, keepId) {
  let keep = false;
  return html.replace(/<(\/?)h1(\s[^>]*)?>/gi, (tag, slash, attrs = '') => {
    if (!slash) {
      keep = new RegExp(`\\bid="${keepId}"`).test(attrs);
      return keep ? tag : `<h2${attrs}>`;
    }
    const out = keep ? tag : '</h2>';
    keep = false;
    return out;
  });
}

function activateJobsPage(html, { h1, count, kw, city }) {
  const r = (a, b) => { if (!html.includes(a)) throw new Error('seo: motif introuvable ' + a.slice(0, 60)); html = html.replace(a, b); };
  r('<section class="page active" id="page-home"', '<section class="page" id="page-home"');
  r('<section class="page" id="page-jobs"', '<section class="page active" id="page-jobs"');
  r('<h2 id="jobsHeader">Offres d’emploi</h2>', `<h1 id="jobsHeader">${esc(h1)}</h1>`);
  r('<span class="jobs-count" id="jobsCount" aria-live="polite"></span>', `<span class="jobs-count" id="jobsCount" aria-live="polite">${esc(count)}</span>`);
  r('<button class="save-search-btn" id="saveSearchBtn" type="button" style="display:none">', '<button class="save-search-btn" id="saveSearchBtn" type="button" style="display:inline-flex">');
  r('<input type="text" id="rsKw"', `<input type="text" id="rsKw" value="${esc(kw)}"`);
  r('<input type="text" id="rsCity"', `<input type="text" id="rsCity" value="${esc(city)}"`);
  return html;
}

/** Réponse pour /offres/:kw[/:lieu]. Retourne { status, headers, body } ou une redirection. */
export async function renderLanding({ kw = 'emploi', lieu = '', search = '', from = '' } = {}) {
  if (from === 'offres') return { status: 301, headers: { Location: '/offres/emploi' + (search || ''), 'Cache-Control': CACHE_SHELL }, body: '' };
  let rawKw, rawLieu;
  try { rawKw = decodeURIComponent(String(kw || 'emploi')); rawLieu = decodeURIComponent(String(lieu || '')); } catch { rawKw = String(kw); rawLieu = String(lieu); }
  const kwSlug = slugify(rawKw) || 'emploi', lieuSlug = slugify(rawLieu);
  const clean = `/offres/${kwSlug}${lieuSlug ? '/' + lieuSlug : ''}`;
  // URL non canonique (majuscules, accents, espaces…) : redirection permanente vers le slug
  if (kwSlug !== rawKw || lieuSlug !== rawLieu) return { status: 301, headers: { Location: clean + (search || ''), 'Cache-Control': CACHE_SHELL }, body: '' };

  const job = JOB_BY_SLUG.get(kwSlug);
  const place = lieuSlug ? PLACE_BY_SLUG.get(lieuSlug) : null;
  const canonical = SITE + clean;
  const html0 = loadShell();
  const shellOnly = (robots, cache) => {
    const label = kwSlug === 'emploi' ? '' : (job ? shortLabel(job) : rawKw.replace(/-/g, ' '));
    const where = place ? place.in : lieuSlug ? 'à ' + rawLieu.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
    const title = `${label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Offres d’emploi'}${where ? ' ' + where : ''} — TalentPulse`;
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, 'X-Robots-Tag': robots.replace(',', ', ') }, body: setMeta(html0, { title, description: `Offres ${label ? 'de ' + label : 'd’emploi'}${where ? ' ' + where : ''} issues de France Travail, Adzuna et Choisir le Service Public, réunies sur TalentPulse.`, canonical, robots }) };
  };
  // Recherche libre (métier ou lieu hors liste, ou combinaison peu fournie) : page applicative, non indexée
  if (!job || (lieuSlug && !place) || !isCurated(job, place)) return shellOnly('noindex,follow', CACHE_SHELL);

  const r = await cachedSearch(job, place);
  if (r.status !== 200 || r.body.errors) return shellOnly('index,follow', 'no-store'); // panne amont : le navigateur chargera la liste
  const jobs = r.body.resultats || [];
  const total = r.body.total || 0;
  const { h1, short } = headings(job, place);
  const st = stats(jobs);
  const robots = total > 0 ? 'index,follow' : 'noindex,follow';
  const top = st.contracts.slice(0, 3).map(([c]) => c).join(', ');
  const title = job.slug === 'emploi'
    ? `Offres d’emploi ${placeIn(place)} : ${nb(total)} annonces France Travail | TalentPulse`
    : `${short} ${placeIn(place)} : ${nb(total)} offres France Travail | TalentPulse`;
  const description = typo(total
    ? `${plural(total, job.slug === 'emploi' ? 'offre d’emploi' : 'offre ' + jobOf(job), job.slug === 'emploi' ? 'offres d’emploi' : 'offres ' + jobOf(job))} ${scope(place)}${top ? ` (${top})` : ''}. Offres France Travail, Adzuna et Choisir le Service Public, candidature sur le site d’origine.`
    : `Aucune offre ${jobOf(job)} ${placeIn(place)} pour le moment. Élargissez la zone ou créez une alerte sur TalentPulse.`);
  const list = crumbs(job, place);
  const kwText = job.q, cityText = place ? place.name : '';

  let html = setMeta(html0, { title, description, canonical, robots });
  const count = formatJobsCount({ shown: jobs.length, hasMore: !!r.body.hasMore, location: r.body.location, city: cityText, distance: r.body.location?.distance });
  html = activateJobsPage(html, { h1, count, kw: kwText, city: cityText });
  // Même encart de localisation que le navigateur (renderJobsNotice) : rien ne bouge à l'hydratation
  const loc = r.body.location;
  const note = !place || !loc ? '' : loc.type === 'commune' ? `Offres à <strong>${esc(loc.display || loc.label)}</strong> et dans un rayon de 10\u00a0km.` : loc.type === 'departement' ? `Offres dans tout le département <strong>${esc(loc.label)}</strong>${loc.code ? ` (${esc(loc.code)})` : ''}.` : loc.type === 'region' ? `Offres dans toute la région <strong>${esc(loc.label)}</strong>.` : '';
  if (note) html = html.replace('<div id="jobsNotice"></div>', `<div id="jobsNotice"><div class="jobs-notice">${svg('info')}<span>${note}</span></div></div>`);
  const fill = (id, inner) => { const a = `<div id="${id}" hidden></div>`; if (!html.includes(a)) throw new Error('seo: emplacement ' + id); html = html.replace(a, `<div id="${id}">${inner}</div>`); };
  fill('seoCrumbs', `<nav class="crumbs" aria-label="Fil d’Ariane">${crumbsHtml(list)}</nav>`);
  fill('seoIntro', `<div class="seo-intro">${introHtml(job, place, total, st)}</div>`);
  fill('seoMore', `<section class="seo-more" aria-label="Le marché et les recherches associées">${total ? marketHtml(job, place, total, st) : ''}${linksHtml(job, place)}</section>`);
  if (jobs.length) html = html.replace('<div class="jobs-list" id="jobsList" aria-busy="false"></div>', `<div class="jobs-list" id="jobsList" aria-busy="false">${jobs.map(cardHtml).join('')}</div>`);
  const ssr = { path: clean, kw: kwText, city: cityText, h1, total, totalFt: total, totals: { ft: total }, hasMore: !!r.body.hasMore, location: r.body.location || null, resultats: jobs };
  html = html.replace('</head>', `${jsonScript('', 'application/ld+json', crumbsJsonLd(list))}\n</head>`);
  html = html.replace('</body>', `${jsonScript('ssrData', 'application/json', ssr)}\n</body>`);
  html = keepOneH1(html, 'jobsHeader');
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE_OK, 'X-Robots-Tag': robots.replace(',', ', ') }, body: html };
}

const OFFER_ID = /^(ft|csp|adz|lba|cj|jb|emp)_[A-Za-z0-9._-]{1,70}$/;
const OFFER_WITH_SOURCE = /^(ft|csp|adz)_[A-Za-z0-9._-]{1,70}$/;

function offerHeaders(cache, robots = 'noindex, nofollow') {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cache,
    'X-Robots-Tag': robots.replace(/,\s*/g, ', '),
  };
}

function isPlaceholderOffer(job) {
  if (!job) return true;
  return !job.company && !job.posted && /^Offre d[’']emploi$/.test(String(job.title || ''));
}

function offerArticle(job) {
  const desc = jobDescriptionHtml(job.desc);
  const bits = [shownCompany(job), job.city].filter(Boolean).map(esc);
  const meta = [job.contract, job.salary].filter(Boolean).map(esc);
  const href = /^https?:\/\//i.test(job.url || '') ? job.url : '';
  return `<article class="offer-ssr" data-id="${esc(job.id)}">
    ${bits.length ? `<p class="offer-co">${bits.join(' · ')}</p>` : ''}
    ${meta.length ? `<p class="offer-meta">${meta.join(' · ')}</p>` : ''}
    ${desc ? `<div class="offer-desc">${desc}</div>` : ''}
    ${href ? `<p><a href="${esc(href)}">Voir l’offre d’origine</a></p>` : ''}
  </article>`;
}

function renderKnownOffer(html, job, canonical) {
  const ld = jobPostingLd(job, { pageUrl: canonical });
  const plain = jobDescriptionText(jobDescriptionHtml(job.desc)).replace(/\s+/g, ' ');
  const visibleTitle = shownTitle(job) || job.title;
  const visibleCompany = shownCompany(job);
  const title = `${visibleTitle}${visibleCompany ? ' — ' + visibleCompany : ''} | TalentPulse`;
  const description = (plain || visibleTitle).slice(0, 180);
  const robots = ld ? 'index,follow' : 'noindex,nofollow';
  let out = setMeta(html, { title, description, canonical, robots });
  out = out.replace('<section class="page active" id="page-home"', '<section class="page" id="page-home"');
  out = out.replace('<section class="page" id="page-jobs"', '<section class="page active" id="page-jobs"');
  out = out.replace('<h2 id="jobsHeader">Offres d’emploi</h2>', `<h1 id="jobsHeader">${esc(visibleTitle)}</h1>`);
  out = keepOneH1(out, 'jobsHeader');
  out = out.replace('<div class="jobs-list" id="jobsList" aria-busy="false"></div>', `<div class="jobs-list" id="jobsList" aria-busy="false">${offerArticle(job)}</div>`);
  if (ld) out = out.replace('</head>', `${jobPostingScript(job, { pageUrl: canonical })}\n</head>`);
  const ssr = { path: '/offre/' + job.id, id: job.id, offre: job };
  out = out.replace('</body>', `${jsonScript('ssrData', 'application/json', ssr)}\n</body>`);
  return { html: out, ld, robots };
}

/**
 * /offre/:id — HTML servi par le serveur, avec JobPosting si les obligatoires sont connus.
 * 410 (sans JSON-LD) si l’offre France Travail, Adzuna ou Service Public est introuvable ou expirée.
 */
export async function renderOffer(rawId) {
  let id = String(rawId || '');
  try { id = decodeURIComponent(id); } catch { /* déjà décodé */ }
  id = id.slice(0, 80);
  const html0 = loadShell();
  const canonical = SITE + '/offre/' + encodeURIComponent(id);
  if (!OFFER_ID.test(id)) return { status: 410, headers: offerHeaders('public, max-age=0, s-maxage=600'), body: unavailableOfferHtml(html0, id, canonical) };
  if (!OFFER_WITH_SOURCE.test(id)) {
    return { status: 200, headers: offerHeaders('no-store'), body: setMeta(html0, { title: 'Offre — TalentPulse', description: 'Fiche d’offre sur TalentPulse.', canonical, robots: 'noindex,nofollow' }) };
  }
  const r = await searchJobs({ id });
  if (r.status === 404) return { status: 410, headers: offerHeaders('public, max-age=0, s-maxage=300'), body: unavailableOfferHtml(html0, id, canonical) };
  const job = r.status === 200 ? r.body?.offre : null;
  if (!job) return { status: 200, headers: offerHeaders('no-store'), body: setMeta(html0, { title: 'Offre — TalentPulse', description: 'Fiche d’offre sur TalentPulse.', canonical, robots: 'noindex,nofollow' }) };
  if (isPlaceholderOffer(job)) {
    const body = setMeta(html0, { title: 'Offre — TalentPulse', description: 'Fiche d’offre sur TalentPulse.', canonical, robots: 'noindex,nofollow' })
      .replace('</body>', `${jsonScript('ssrData', 'application/json', { path: '/offre/' + id, id, offre: job })}\n</body>`);
    return { status: 200, headers: offerHeaders('no-store'), body };
  }
  const page = renderKnownOffer(html0, job, canonical);
  const cache = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
  return { status: 200, headers: offerHeaders(cache, page.robots), body: page.html };
}

function activateSection(html, sectionId) {
  const home = '<section class="page active" id="page-home"';
  if (!html.includes(home)) throw new Error('seo: page-home');
  html = html.replace(home, '<section class="page" id="page-home"');
  const marker = `<section class="page" id="${sectionId}"`;
  if (!html.includes(marker)) throw new Error('seo: section ' + sectionId);
  return html.replace(marker, `<section class="page active" id="${sectionId}"`);
}

/**
 * Pages du shell (CGU, contact, connexion…) : title, description et canonical propres.
 * Textes alignés sur LEGAL_PAGES / STATIC_ROUTES dans public/assets/app.js.
 * Le HTML servi n’a plus le h1 de l’accueil : un h1 propre à la page (titre légal prérempli,
 * ou titre déjà présent pour Connexion / Mon espace). Le corps détaillé des pages légales
 * reste injecté par le navigateur.
 */
const PAGE_SHELLS = {
  cgu: {
    path: '/cgu',
    title: 'Conditions générales d’utilisation — TalentPulse',
    description: 'Conditions d’utilisation du service gratuit TalentPulse : offres tierces, candidatures, compte, données et droit applicable.',
    robots: 'index,follow',
    section: 'page-legal',
    heading: 'Conditions Générales d’Utilisation',
  },
  contact: {
    path: '/contact',
    title: 'Contact — TalentPulse',
    description: 'Contacter l’éditeur de TalentPulse pour une question, une suggestion ou un problème technique.',
    robots: 'index,follow',
    section: 'page-legal',
    heading: 'Contact',
  },
  'a-propos': {
    path: '/a-propos',
    title: 'À propos — TalentPulse',
    description: 'TalentPulse, agrégateur gratuit d’offres d’emploi France Travail, Adzuna et Choisir le Service Public.',
    robots: 'index,follow',
    section: 'page-legal',
    heading: 'À propos de TalentPulse',
  },
  'mentions-legales': {
    path: '/mentions-legales',
    title: 'Mentions légales — TalentPulse',
    description: 'Mentions légales du site TalentPulse : éditeur, hébergeur et contact.',
    robots: 'index,follow',
    section: 'page-legal',
    heading: 'Mentions légales',
  },
  confidentialite: {
    path: '/confidentialite',
    title: 'Politique de confidentialité — TalentPulse',
    description: 'Comment TalentPulse traite vos données : stockage local, compte optionnel, sous-traitants, durées de conservation et droits.',
    robots: 'index,follow',
    section: 'page-legal',
    heading: 'Politique de confidentialité',
  },
  connexion: {
    path: '/connexion',
    title: 'Connexion — TalentPulse',
    description: 'Connectez-vous ou créez un compte gratuit pour synchroniser favoris, suivi et alertes.',
    robots: 'noindex, nofollow',
    section: 'page-login',
    headingId: 'authTitle',
  },
  'mon-espace': {
    path: '/mon-espace',
    title: 'Mon espace — TalentPulse',
    description: 'Vos favoris, votre suivi de candidatures et vos alertes, sur cet appareil ou synchronisés avec votre compte.',
    robots: 'noindex, nofollow',
    section: 'page-profile',
    headingId: 'profName',
  },
};

function promoteHeading(html, id) {
  const re = new RegExp(`<h2([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)</h2>`, 'i');
  if (!re.test(html)) throw new Error('seo: heading ' + id);
  return html.replace(re, '<h1$1>$2</h1>');
}

export function renderStaticPage(page) {
  const spec = PAGE_SHELLS[String(page || '')];
  if (!spec) return null;
  let html = setMeta(loadShell(), {
    title: spec.title,
    description: spec.description,
    canonical: SITE + spec.path,
    robots: spec.robots,
  });
  if (spec.heading) {
    const marker = '<article class="legal-page" id="legalPage"></article>';
    if (!html.includes(marker)) throw new Error('seo: legalPage');
    html = html.replace(marker, `<article class="legal-page" id="legalPage"><h1 id="legalPageTitle">${esc(spec.heading)}</h1></article>`);
  }
  if (spec.section) html = activateSection(html, spec.section);
  if (spec.headingId) {
    html = promoteHeading(html, spec.headingId);
    html = keepOneH1(html, spec.headingId);
  } else if (spec.heading) {
    html = keepOneH1(html, 'legalPageTitle');
  }
  const privatePage = spec.robots.startsWith('noindex');
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': privatePage ? 'no-store' : CACHE_SHELL,
      'X-Robots-Tag': spec.robots.replace(/,\s*/g, ', '),
    },
    body: html,
  };
}

function unavailableOfferHtml(html, id, canonical) {
  let out = setMeta(html, {
    title: 'Offre indisponible — TalentPulse',
    description: 'Cette offre n’est plus disponible ou a expiré.',
    canonical,
    robots: 'noindex,nofollow',
  });
  out = out.replace('<section class="page active" id="page-home"', '<section class="page" id="page-home"');
  out = out.replace('<section class="page" id="page-jobs"', '<section class="page active" id="page-jobs"');
  out = out.replace('<h2 id="jobsHeader">Offres d’emploi</h2>', '<h1 id="jobsHeader">Offre indisponible</h1>');
  out = keepOneH1(out, 'jobsHeader');
  const adzUrl = adzunaDetailsUrl(id);
  const explain = adzUrl
    ? 'Le lien est incorrect, ou l’annonce n’est plus en mémoire sur TalentPulse. Vous pouvez encore ouvrir la fiche d’origine sur Adzuna, si elle est en ligne. La liste nationale n’est pas affichée à la place.'
    : 'Le lien est incorrect, ou l’annonce a expiré et a été retirée par sa source. La liste nationale n’est pas affichée à la place.';
  const adzBtn = adzUrl
    ? `<a class="btn btn-outline" href="${esc(adzUrl)}" target="_blank" rel="noopener noreferrer">Voir sur Adzuna<span class="sr-only"> (nouvel onglet)</span></a>`
    : '';
  const msg = `<div class="empty" role="status"><div class="empty-title">Cette offre n’est plus disponible</div><p>${explain}</p><div class="empty-actions"><a class="btn btn-primary" href="/offres/emploi">Voir les offres d’emploi</a>${adzBtn}</div></div>`;
  out = out.replace('<div class="jobs-list" id="jobsList" aria-busy="false"></div>', `<div class="jobs-list" id="jobsList" aria-busy="false">${msg}</div>`);
  const ssr = { path: '/offre/' + id, unavailable: true, id, adzunaUrl: adzUrl || undefined };
  out = out.replace('</body>', `${jsonScript('ssrData', 'application/json', ssr)}\n</body>`);
  return out;
}

// ── Sitemaps ──
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const today = () => new Date().toISOString().slice(0, 10);

let offerSitemapCache = null;
/**
 * Fiches /offre/:id que l'on peut énumérer sans inventer ni interroger une API :
 * offres Service Public encore publiées et complètes (JSON-LD possible).
 * lastmod = date de première publication fournie par la source.
 * France Travail et Adzuna ne sont pas stockés : leurs fiches ne sont pas listées ici.
 */
export function activeOfferEntries(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (offerSitemapCache?.day === day) return offerSitemapCache;
  const raw = JSON.parse(readFileSync(new URL('./data/csp-offres.json', import.meta.url), 'utf8'));
  const fields = raw.fields;
  const entries = [];
  const seen = new Set();
  const excluded = {};
  let active = 0;
  for (const row of raw.rows) {
    const o = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    if (!o.end || o.end < day) continue;
    active++;
    const job = mapCSP(o);
    const miss = missingRequired(job);
    if (miss.length) {
      const key = miss.slice().sort().join('+') || 'incomplet';
      excluded[key] = (excluded[key] || 0) + 1;
      continue;
    }
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(o.first || '') && o.first <= day ? o.first : day;
    const loc = '/offre/' + encodeURIComponent(job.id);
    if (seen.has(loc)) continue;
    seen.add(loc);
    entries.push({ loc, lastmod });
  }
  offerSitemapCache = { day, entries, active, excluded, included: entries.length };
  return offerSitemapCache;
}

export const STATIC_PAGES = ['/', '/lettre', '/conseils', '/mentions-legales', '/confidentialite', '/a-propos', '/contact', '/cgu'];
function urlset(items) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.map(it => `  <url><loc>${xmlEsc(SITE + it.loc)}</loc><lastmod>${it.lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}
export function sitemap(kind) {
  const d = today();
  if (kind === 'index') return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/sitemap-pages.xml', '/sitemap-offres.xml'].map(p => `  <sitemap><loc>${SITE}${p}</loc><lastmod>${d}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  if (kind === 'pages') return urlset(STATIC_PAGES.map(loc => ({ loc, lastmod: d })));
  if (kind === 'offres') {
    const landing = curatedPaths().map(loc => ({ loc, lastmod: d }));
    const fiches = activeOfferEntries().entries;
    return urlset([...landing, ...fiches]);
  }
  return null;
}
export { JOBS, PLACES };
