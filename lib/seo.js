/**
 * Pages d'atterrissage SEO rendues côté serveur (fonction Vercel + cache CDN).
 * /offres/:metier[/:lieu] → index.html enrichi : title/meta/canonical/robots uniques, H1, introduction
 * calculée sur les offres réelles, 1re page d'offres en HTML, fil d'Ariane (BreadcrumbList JSON-LD),
 * maillage interne. Pas de données structurées JobPosting : TalentPulse agrège des offres de tiers
 * et renvoie vers l'annonce d'origine.
 */
import { readFileSync } from 'node:fs';
import { searchJobs } from './jobs.js';
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
    ? `<p><strong>${plural(total, what.replace(/^offres/, 'offre'), what)}</strong> ${total > 1 ? 'publiées' : 'publiée'} sur France Travail ${scope(place)}, complétées par les annonces partenaires d’Adzuna. Chaque offre renvoie vers l’annonce d’origine pour postuler.</p>`
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
  return typo(`<h2>${esc(title)}</h2>${job.blurb ? `<p>${esc(job.blurb)}</p>` : ''}${items.length ? `<ul>${items.join('')}</ul>` : ''}<p class="seo-note">Chiffres calculés sur les offres France Travail affichées ci-dessus (${nb(total)} au total), mis à jour toutes les heures.</p>`);
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
export function relativeDate(iso, now = Date.now()) {
  const d = new Date(iso); if (!iso || isNaN(d)) return '';
  const days = Math.floor((now - d.getTime()) / 86400000);
  if (days <= 0) return 'Aujourd\'hui'; if (days === 1) return 'Il y a 1 jour'; if (days < 30) return `Il y a ${days} jours`;
  const m = Math.floor(days / 30); if (m === 1) return 'Il y a 1 mois'; if (m < 12) return `Il y a ${m} mois`;
  const y = Math.floor(m / 12); return y === 1 ? 'Il y a 1 an' : `Il y a ${y} ans`;
}
export function cardHtml(j) {
  const name = j.company || j.title || '?';
  const loc = j.city ? `${j.city}${j.dept && !String(j.city).includes(j.dept) ? ' (' + j.dept + ')' : ''}` : '';
  const when = relativeDate(j.posted);
  const fresh = when === 'Aujourd\'hui' || when === 'Il y a 1 jour';
  const avatar = j.logo ? `<div class="co-avatar co-logo" aria-hidden="true"><img src="${esc(j.logo)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>` : `<div class="co-avatar" style="${avatarStyle(name)}" aria-hidden="true">${esc(name[0].toUpperCase())}</div>`;
  return `<article class="job" data-id="${esc(j.id)}">
    ${avatar}
    <div class="job-main">
      <h2 class="job-title"><a class="job-link" href="/offre/${encodeURIComponent(j.id)}" data-id="${esc(j.id)}">${esc(j.title)}</a></h2>
      <div class="job-co"><span>${j.company ? esc(j.company) : '<span class="muted">Entreprise non communiquée</span>'}</span>${loc ? `<span class="sep" aria-hidden="true">•</span><span class="job-loc">${svg('map-pin')}${esc(loc)}</span>` : ''}</div>
    </div>
    <div class="job-actions">
      <button class="share-btn" type="button" data-share="${esc(j.id)}" aria-label="Partager l’offre ${esc(j.title)}">${svg('share')}</button>
      <button class="save-btn" type="button" data-id="${esc(j.id)}" aria-pressed="false" aria-label="Ajouter aux favoris : ${esc(j.title)}">${svg('bookmark')}</button>
    </div>
    <div class="job-meta">
      ${j.contract ? `<span class="tag tag-brand">${esc(j.contract)}</span>` : ''}
      ${j.salary ? `<span class="tag job-sal">${svg('euro')}${esc(j.salary)}</span>` : ''}
      ${j.exp ? `<span class="tag">${esc(j.exp)}</span>` : ''}
      ${j.otherLocations ? `<span class="tag">+${j.otherLocations} autre${j.otherLocations > 1 ? 's' : ''} lieu${j.otherLocations > 1 ? 'x' : ''}</span>` : ''}
    </div>
    <div class="job-foot">
      <div class="job-foot-left">
        <span class="src src-ft">${svg('landmark')}France Travail</span>
        ${when ? `<span class="job-time"${fresh ? ' style="color:var(--ok);font-weight:600"' : ''}>${fresh ? 'Nouveau · ' : ''}${esc(when)}</span>` : ''}
      </div>
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

function activateJobsPage(html, { h1, count, kw, city }) {
  const r = (a, b) => { if (!html.includes(a)) throw new Error('seo: motif introuvable ' + a.slice(0, 60)); html = html.replace(a, b); };
  r('<section class="page active" id="page-home"', '<section class="page" id="page-home"');
  r('<section class="page" id="page-jobs"', '<section class="page active" id="page-jobs"');
  r('<h1 id="jobsHeader">Offres d’emploi</h1>', `<h1 id="jobsHeader">${esc(h1)}</h1>`);
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
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, 'X-Robots-Tag': robots.replace(',', ', ') }, body: setMeta(html0, { title, description: `Offres ${label ? 'de ' + label : 'd’emploi'}${where ? ' ' + where : ''} issues de France Travail et Adzuna, réunies sur TalentPulse.`, canonical, robots }) };
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
    ? `Offres d’emploi ${placeIn(place)} : ${nb(total)} annonces | TalentPulse`
    : `${short} ${placeIn(place)} : ${nb(total)} offres d’emploi | TalentPulse`;
  const description = typo(total
    ? `${plural(total, job.slug === 'emploi' ? 'offre d’emploi' : 'offre ' + jobOf(job), job.slug === 'emploi' ? 'offres d’emploi' : 'offres ' + jobOf(job))} ${scope(place)}${top ? ` (${top})` : ''}. Offres France Travail et Adzuna mises à jour en continu, candidature sur le site d’origine.`
    : `Aucune offre ${jobOf(job)} ${placeIn(place)} pour le moment. Élargissez la zone ou créez une alerte sur TalentPulse.`);
  const list = crumbs(job, place);
  const kwText = job.q, cityText = place ? place.name : '';

  let html = setMeta(html0, { title, description, canonical, robots });
  const count = !jobs.length ? '0 offre' : total > jobs.length ? `${nb(total)} offres · ${nb(jobs.length)} affichées` : plural(jobs.length, 'offre', 'offres');
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
  const ssr = { path: clean, kw: kwText, city: cityText, h1, total, hasMore: !!r.body.hasMore, location: r.body.location || null, resultats: jobs };
  html = html.replace('</head>', `${jsonScript('', 'application/ld+json', crumbsJsonLd(list))}\n</head>`);
  html = html.replace('</body>', `${jsonScript('ssrData', 'application/json', ssr)}\n</body>`);
  return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE_OK, 'X-Robots-Tag': robots.replace(',', ', ') }, body: html };
}

// ── Sitemaps ──
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const today = () => new Date().toISOString().slice(0, 10);
export const STATIC_PAGES = ['/', '/lettre', '/conseils', '/mentions-legales', '/confidentialite'];
export function sitemap(kind) {
  const d = today();
  if (kind === 'index') return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/sitemap-pages.xml', '/sitemap-offres.xml'].map(p => `  <sitemap><loc>${SITE}${p}</loc><lastmod>${d}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  const paths = kind === 'pages' ? STATIC_PAGES : kind === 'offres' ? curatedPaths() : null;
  if (!paths) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${xmlEsc(SITE + p)}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}
export { JOBS, PLACES };
