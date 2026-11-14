// Pages d'atterrissage SEO (api/seo.js + lib/seo.js) : France Travail simulé, geo.api.gouv.fr coupé (repli local).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/seo.js';
import { _clearCache, activeOfferEntries, landingTitle, landingDescription, displaySearchLabel, elisionDe, shellJobsHeading, shellPlaceName } from '../lib/seo.js';
import { _test as jobsApi } from '../lib/jobs.js';
import { JOBS, PLACES, isCurated, curatedPaths, slugify, nearbyPlaces, relatedJobs } from '../lib/seo-data.js';
import '../public/assets/geo-fr.js';

process.env.FT_CLIENT_ID = 'x'; process.env.FT_CLIENT_SECRET = 'y'; process.env.ADZUNA_APP_ID = 'a'; process.env.ADZUNA_APP_KEY = 'b';
const calls = [];
let mode = 'ok';
const offer = (i, extra = {}) => ({ id: 'S' + i, intitule: `Serveur H/F ${i}`, entreprise: { nom: i % 3 ? 'Brasserie Bellecour' : 'Hôtel du Parc' }, lieuTravail: { libelle: '69 - LYON 0' + (1 + i % 8) }, typeContrat: i % 4 ? 'CDI' : 'CDD', salaire: i % 2 ? { libelle: `Mensuel de ${1800 + i * 10}.0 Euros sur 12.0 mois` } : {}, experienceLibelle: 'Débutant accepté', dateCreation: new Date(Date.now() - i * 86400000).toISOString(), origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/x' }, description: 'Service en salle <script>alert(1)</script>', ...extra });
global.fetch = async (url) => {
  url = String(url);
  calls.push(url);
  if (url.includes('geo.api.gouv.fr')) throw new Error('offline');
  const json = (obj, headers = {}, status = 200) => new Response(status === 204 ? null : JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (/\/offres\/[^/?]+$/.test(url.split('?')[0]) && !url.includes('/search')) {
    if (mode === 'down') return new Response('boom', { status: 500 });
    if (mode === 'found') return json({ id: 'OK1', intitule: 'Serveur H/F', entreprise: { nom: 'Brasserie' }, lieuTravail: { libelle: '69 - LYON' }, typeContrat: 'CDI', dateCreation: new Date().toISOString(), origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/x' } });
    if (mode === 'jobposting') return json({
      id: 'JP1', intitule: 'Serveur H/F', description: 'Service en salle.\n\nAccueil des clients. </script><script>alert(1)</script>',
      entreprise: { nom: 'Brasserie Bellecour', logo: 'https://entreprise.francetravail.fr/static/logo.png', url: 'https://brasserie-bellecour.example' },
      lieuTravail: { libelle: '69 - LYON 03', codePostal: '69003' }, typeContrat: 'CDI',
      dureeTravailLibelleConverti: 'Temps partiel', salaire: { libelle: 'Mensuel de 1800.0 Euros sur 12.0 mois' },
      dateCreation: '2026-11-01T08:00:00.000Z', origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/JP1' },
    });
    if (mode === 'anon') return json({
      id: 'AN1', intitule: 'Serveur H/F', description: 'Service en salle, entreprise non citée.',
      entreprise: { nom: 'Confidentiel' }, lieuTravail: { libelle: '69 - LYON' }, typeContrat: 'CDI',
      dateCreation: '2026-11-01T08:00:00.000Z', origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/x' },
    });
    return json({ message: 'absent' }, {}, 404);
  }
  if (url.includes('offres/search')) {
    if (mode === 'empty') return json(null, {}, 204);
    if (mode === 'down') return new Response('boom', { status: 500 });
    return json({ resultats: Array.from({ length: 12 }, (_, i) => offer(i)) }, { 'Content-Range': 'offres 0-29/152' });
  }
  if (url.includes('api.adzuna.com')) throw new Error('Adzuna ne doit pas être appelé pour le rendu serveur');
  throw new Error('unexpected ' + url);
};

function call(query, url = '/api/seo') {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { resolve({ status: this.statusCode, body: String(b ?? ''), headers: this.headers }); } };
    handler({ method: 'GET', query, url }, res);
  });
}
test.beforeEach(() => _clearCache());
const meta = (html, re) => (html.match(re) || [])[1];

test('page curée : title/meta/canonical uniques, H1, 1re page en HTML, fil d’Ariane JSON-LD, cache CDN, pas de JobPosting', async () => {
  mode = 'ok'; calls.length = 0;
  const r = await call({ kw: 'developpeur', lieu: 'ile-de-france' });
  assert.equal(r.status, 200);
  const h = r.body;
  assert.equal(meta(h, /<title>([^<]*)<\/title>/), 'Développeur en Île-de-France : 152 offres France Travail | TalentPulse');
  assert.match(meta(h, /<meta name="description" content="([^"]*)"/), /^152 offres de développeur \/ développeuse dans toute la région/);
  assert.match(meta(h, /<meta name="description" content="([^"]*)"/), /Publiées sur France Travail/);
  assert.equal(meta(h, /<link rel="canonical" href="([^"]*)"/), 'https://talentpulse-topaz.vercel.app/offres/developpeur/ile-de-france');
  assert.equal(meta(h, /<meta name="robots" content="([^"]*)"/), 'index,follow');
  assert.equal(meta(h, /<meta property="og:url" content="([^"]*)"/), 'https://talentpulse-topaz.vercel.app/offres/developpeur/ile-de-france');
  assert.equal(meta(h, /<h1 id="jobsHeader">([^<]*)<\/h1>/), 'Offres d’emploi de développeur / développeuse en Île-de-France');
  assert.match(h, /<section class="page active" id="page-jobs"/);
  assert.match(h, /<section class="page" id="page-home"/);
  assert.equal((h.match(/<article class="job"/g) || []).length, 12, '12 offres rendues côté serveur');
  assert.ok(!h.includes('<script>alert(1)</script>'), 'description échappée dans le JSON d’hydratation');
  assert.match(r.headers['cache-control'], /s-maxage=3600/);
  assert.match(r.headers['cache-control'], /stale-while-revalidate/);
  assert.ok(!/JobPosting/.test(h), 'aucune donnée structurée JobPosting');
  const ld = JSON.parse(meta(h, /<script type="application\/ld\+json">([^<]*)<\/script>/));
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.deepEqual(ld.itemListElement.map(i => i.name), ['Accueil', 'Offres d’emploi', 'Développeur', 'Île-de-France']);
  assert.equal(ld.itemListElement[3].item, 'https://talentpulse-topaz.vercel.app/offres/developpeur/ile-de-france');
  assert.match(h, /<nav class="crumbs" aria-label="Fil d’Ariane"><ol>.*aria-current="page">Île-de-France</s);
  const ssr = JSON.parse(meta(h, /<script type="application\/json" id="ssrData">([^<]*)<\/script>/));
  assert.equal(ssr.path, '/offres/developpeur/ile-de-france'); assert.equal(ssr.kw, 'développeur'); assert.equal(ssr.city, 'Île-de-France'); assert.equal(ssr.resultats.length, 12);
  const ft = calls.find(u => u.includes('offres/search'));
  assert.ok(ft.includes('region=11') && /motsCles=d%C3%A9veloppeur/.test(ft), 'FT : région 11 + mot-clé : ' + ft.split('?')[1]);
  assert.ok(!calls.some(u => u.includes('adzuna')), 'pas d’appel Adzuna côté serveur (quota)');
});

test('introduction et encart marché calculés sur les offres réelles, maillage interne vers des pages curées', async () => {
  mode = 'ok';
  const r = await call({ kw: 'serveur', lieu: 'rhone' });
  const h = r.body;
  assert.match(h, /<strong>152 offres de serveur \/ serveuse<\/strong> publiées sur France Travail dans tout le département \(69\)/);
  assert.match(h, /total toutes sources/);
  assert.match(h, /9 CDI, 3 CDD parmi les 12 premières offres/);
  assert.match(h, /6 offres sur 12 indiquent un salaire, médiane d’environ 1\u202f850\u00a0€ brut par mois/);
  assert.match(h, /Employeurs qui recrutent<\/strong>\u00a0: Brasserie Bellecour, Hôtel du Parc/);
  assert.match(h, /La restauration recrute toute l’année/);
  const allowed = new Set(curatedPaths());
  const links = [...h.matchAll(/<section class="seo-more"[\s\S]*?<\/section>/g)].join('').match(/href="(\/offres\/[^"]+)"/g).map(x => x.slice(6, -1));
  assert.ok(links.length >= 15, 'liens internes : ' + links.length);
  for (const l of links) assert.ok(allowed.has(l), 'lien vers une page curée : ' + l);
  assert.ok(links.includes('/offres/serveur/lyon') && links.includes('/offres/serveur/auvergne-rhone-alpes') && links.includes('/offres/cuisinier/rhone'), 'villes du département, région, métiers proches');
});

test('noindex : résultats vides, recherche libre ou combinaison non curée ; panne amont : pas de cache', async () => {
  mode = 'empty';
  let r = await call({ kw: 'cariste', lieu: 'nice' });
  assert.equal(r.status, 200);
  assert.equal(meta(r.body, /<meta name="robots" content="([^"]*)"/), 'noindex,follow');
  assert.equal(r.headers['x-robots-tag'], 'noindex, follow');
  assert.match(r.body, /Aucune offre de cariste n’est publiée/);
  mode = 'ok'; calls.length = 0;
  r = await call({ kw: 'react-native', lieu: 'cergy' });
  assert.equal(meta(r.body, /<meta name="robots" content="([^"]*)"/), 'noindex,follow');
  assert.equal(meta(r.body, /<link rel="canonical" href="([^"]*)"/), 'https://talentpulse-topaz.vercel.app/offres/react-native/cergy');
  assert.ok(!calls.some(u => u.includes('offres/search')), 'aucun appel amont pour une recherche libre');
  assert.match(r.body, /<section class="page active" id="page-jobs"/, 'recherche libre : vue offres dès le HTML SSR');
  assert.doesNotMatch(r.body, /<h1 class="hero-title" id="homeTitle">/);
  assert.match(r.body, /<h1 id="jobsHeader">Offres «\u00a0React native\u00a0» à Cergy<\/h1>/);
  assert.match(r.body, /Recherche en cours…/);
  r = await call({ kw: 'macon', lieu: 'le-havre' }); // métier de palier 2 hors grandes villes
  assert.equal(meta(r.body, /<meta name="robots" content="([^"]*)"/), 'noindex,follow');
  mode = 'down';
  r = await call({ kw: 'serveur', lieu: 'paris' });
  assert.equal(r.status, 200); assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(meta(r.body, /<meta name="robots" content="([^"]*)"/), 'index,follow');
});

test('URL canoniques : redirection 301 vers le slug (majuscules, accents), /offres → /offres/emploi, paramètres conservés', async () => {
  let r = await call({ kw: 'Serveur', lieu: 'Lyon' });
  assert.equal(r.status, 301); assert.equal(r.headers.location, '/offres/serveur/lyon');
  r = await call({ kw: 'développeur', lieu: 'Île-de-France' }, '/api/seo?kw=d&lieu=x&utm_source=news');
  assert.equal(r.status, 301); assert.equal(r.headers.location, '/offres/developpeur/ile-de-france?utm_source=news');
  r = await call({ kw: 'emploi', from: 'offres' });
  assert.equal(r.status, 301); assert.equal(r.headers.location, '/offres/emploi');
});

test('sitemaps : index → pages + offres, uniquement les combinaisons curées', async () => {
  let r = await call({ sitemap: 'index' });
  assert.equal(r.status, 200); assert.match(r.headers['content-type'], /xml/);
  assert.match(r.body, /<sitemapindex[\s\S]*sitemap-pages\.xml[\s\S]*sitemap-offres\.xml/);
  r = await call({ sitemap: 'offres' });
  const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace('https://talentpulse-topaz.vercel.app', ''));
  const lastmods = [...r.body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'pas de doublon');
  assert.ok(locs.length > 1000 && locs.length < 50000, locs.length + ' URL');
  assert.equal(lastmods.length, locs.length);
  for (const block of lastmods) assert.match(block, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  for (const p of ['/offres/serveur/lyon', '/offres/developpeur/ile-de-france', '/offres/emploi', '/offres/emploi/val-d-oise', '/offres/macon/paris']) assert.ok(locs.includes(p), p);
  assert.ok(!locs.includes('/offres/macon/le-havre'), 'palier 2 hors grandes villes exclu');
  const fiches = activeOfferEntries();
  assert.ok(fiches.included > 0, 'fiches Service Public actives');
  assert.ok(locs.includes(fiches.entries[0].loc), fiches.entries[0].loc);
  assert.match(r.body, new RegExp('<loc>https://talentpulse-topaz\\.vercel\\.app' + fiches.entries[0].loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</loc><lastmod>' + fiches.entries[0].lastmod + '</lastmod>'));
  r = await call({ sitemap: 'pages' });
  assert.match(r.body, /<loc>https:\/\/talentpulse-topaz\.vercel\.app\/<\/loc>/);
  for (const p of ['/a-propos', '/contact', '/cgu', '/mentions-legales', '/confidentialite']) assert.match(r.body, new RegExp('<loc>https://talentpulse-topaz\\.vercel\\.app' + p.replace('/', '\\/') + '</loc>'));
  assert.ok(!/mon-espace|connexion|nouveau-mot-de-passe/.test(r.body), 'pages privées exclues');
  assert.equal((await call({ sitemap: 'nope' })).status, 404);
});

test('offre inconnue ou expirée : 410, message, noindex, pas de liste nationale ni de JobPosting', async () => {
  mode = 'ok';
  const page = await call({ kw: 'serveur', lieu: 'lyon' });
  assert.equal((page.body.match(/<h1[\s>]/g) || []).length, 1, 'un seul h1 sur la page SEO');
  assert.match(page.body, /<h1 id="jobsHeader">/);
  assert.ok(!/<h1[\s>]/.test(page.body.replace(/<h1 id="jobsHeader">[\s\S]*?<\/h1>/, '')), 'les autres vues ne sont pas en h1');

  let r = await call({ offre: 'ft_INEXISTANT' });
  assert.equal(r.status, 410);
  assert.match(r.headers['x-robots-tag'], /noindex/);
  assert.match(r.body, /Cette offre n’est plus disponible/);
  assert.match(r.body, /noindex,nofollow/);
  assert.equal((r.body.match(/<article class="job"/g) || []).length, 0);
  assert.ok(!/JobPosting/.test(r.body));
  assert.match(r.body, /"unavailable":true/);
  assert.equal((r.body.match(/<h1[\s>]/g) || []).length, 1);

  mode = 'found';
  r = await call({ offre: 'ft_OK1' });
  assert.equal(r.status, 200);
  assert.match(r.headers['x-robots-tag'], /noindex/);
  assert.ok(!/JobPosting/.test(r.body), 'sans description : pas de JSON-LD');

  mode = 'anon';
  r = await call({ offre: 'ft_AN1' });
  assert.equal(r.status, 200);
  assert.match(r.headers['x-robots-tag'], /noindex/);
  assert.ok(!/JobPosting/.test(r.body), 'entreprise anonyme : pas de JSON-LD');
  assert.match(r.body, /Service en salle/);

  mode = 'jobposting';
  r = await call({ offre: 'ft_JP1' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-robots-tag'], 'index, follow');
  assert.match(r.body, /<h1 id="jobsHeader">Serveur \(H\/F\)<\/h1>/);
  assert.match(r.body, /<div class="offer-desc">[\s\S]*Service en salle/);
  assert.ok(!r.body.includes('<script>alert(1)</script>'));
  const rawLd = (r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  assert.ok(rawLd && !rawLd.includes('<'), 'JSON-LD sans chevron brut');
  const ld = JSON.parse(rawLd);
  assert.equal(ld['@type'], 'JobPosting');
  assert.equal(ld.directApply, false);
  assert.equal(ld.hiringOrganization.name, 'Brasserie Bellecour');
  assert.equal(ld.hiringOrganization.logo, 'https://entreprise.francetravail.fr/static/logo.png');
  assert.equal(ld.hiringOrganization.sameAs, 'https://brasserie-bellecour.example/');
  assert.equal(ld.jobLocation.address.addressLocality, 'Lyon 3e');
  assert.equal(ld.jobLocation.address.addressRegion, 'Rhône');
  assert.equal(ld.jobLocation.address.postalCode, '69003');
  assert.equal(ld.jobLocation.address.addressCountry, 'FR');
  assert.deepEqual(ld.employmentType, ['FULL_TIME', 'PART_TIME']);
  assert.equal(ld.baseSalary.currency, 'EUR');
  assert.equal(ld.baseSalary.value.unitText, 'MONTH');
  assert.equal(ld.baseSalary.value.value, 1800);
  assert.equal(ld.identifier.value, 'ft_JP1');
  assert.equal(ld.url, 'https://talentpulse-topaz.vercel.app/offre/ft_JP1');
  assert.ok(!ld.jobLocationType, 'temps partiel n’est pas du télétravail');
  assert.match(ld.description, /Service en salle/);
  assert.doesNotMatch(ld.description, /script|alert/i);
  assert.equal((r.body.match(/<h1[\s>]/g) || []).length, 1);
});

test('fiche Adzuna : JSON-LD si la fiche est complète, 410 propre sans mémoire', async () => {
  jobsApi._resetJobMemo();
  let r = await call({ offre: 'adz_5414123798' });
  assert.equal(r.status, 410);
  assert.match(r.headers['x-robots-tag'], /noindex/);
  assert.ok(!/JobPosting/.test(r.body));
  assert.match(r.body, /Cette offre n’est plus disponible/);
  assert.match(r.body, /https:\/\/www\.adzuna\.fr\/details\/5414123798/);
  assert.match(r.body, /<title>Offre indisponible — TalentPulse<\/title>/);
  assert.ok(!/Offre d[’']emploi/.test(r.body.replace(/Toutes les offres d[’']emploi en France/, '')));

  jobsApi.memoJobs([jobsApi.mapAdzuna({
    id: 5414123798, title: 'Serveur en terrasse', company: { display_name: 'Café du Port' },
    location: { display_name: 'Lyon, Rhône' }, redirect_url: 'https://www.adzuna.fr/land/ad/5414123798',
    description: 'Service en salle le soir.', created: '2026-11-02T10:00:00Z',
    contract_type: 'contract', contract_time: 'full_time', salary_min: 2000, salary_max: 2200, salary_is_predicted: '0',
  })]);
  r = await call({ offre: 'adz_5414123798' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-robots-tag'], 'index, follow');
  const ld = JSON.parse((r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
  assert.equal(ld.hiringOrganization.name, 'Café du Port');
  assert.equal(ld.jobLocation.address.addressLocality, 'Lyon');
  assert.equal(ld.jobLocation.address.addressRegion, 'Rhône');
  assert.equal(ld.jobLocation.address.postalCode, undefined);
  assert.equal(ld.employmentType, 'TEMPORARY');
  assert.equal(ld.baseSalary.value.unitText, 'MONTH');
  assert.equal(ld.baseSalary.value.minValue, 2000);
  assert.equal(ld.baseSalary.value.maxValue, 2200);
  assert.equal(ld.directApply, false);
  assert.equal(ld.hiringOrganization.sameAs, undefined);
  jobsApi._resetJobMemo();

  r = await call({ offre: 'adz_nope' });
  assert.equal(r.status, 410);
  assert.ok(!/JobPosting/.test(r.body));
});

test('fiche Service Public réelle : JSON-LD dans le HTML, offre expirée en 410 sans balisage', async () => {
  const { readFileSync } = await import('node:fs');
  const entry = activeOfferEntries().entries[0];
  const id = decodeURIComponent(entry.loc.replace(/^\/offre\//, ''));
  let r = await call({ offre: id });
  assert.equal(r.status, 200, id);
  assert.equal(r.headers['x-robots-tag'], 'index, follow');
  const ld = JSON.parse((r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
  assert.equal(ld['@type'], 'JobPosting');
  assert.equal(ld.directApply, false);
  assert.equal(ld.jobLocation.address.addressCountry, 'FR');
  assert.ok(/^\d{4}-\d{2}-\d{2}/.test(ld.validThrough));
  assert.ok(/^\d{4}-\d{2}-\d{2}/.test(ld.datePosted));
  assert.equal(ld.baseSalary, undefined);
  assert.match(r.body, new RegExp('data-id="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));

  const raw = JSON.parse(readFileSync(new URL('../lib/data/csp-offres.json', import.meta.url), 'utf8'));
  const endAt = raw.fields.indexOf('end');
  const refAt = raw.fields.indexOf('ref');
  const today = new Date().toISOString().slice(0, 10);
  const expired = raw.rows.find(row => row[endAt] < today);
  assert.ok(expired, 'le fichier contient une offre échue');
  const expiredId = 'csp_' + String(expired[refAt]).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 70);
  r = await call({ offre: expiredId });
  assert.equal(r.status, 410, expiredId);
  assert.ok(!/JobPosting/.test(r.body));

  mode = 'down';
  r = await call({ offre: 'ft_OK1' });
  assert.equal(r.status, 200, 'une panne amont ne déclare pas l’offre expirée');

  r = await call({ offre: 'pas-une-offre' });
  assert.equal(r.status, 410);
  r = await call({ offre: 'csp_introuvable' });
  assert.equal(r.status, 410);
});

test('pages statiques : title, description et canonical propres ; connexion et mon espace en noindex', async () => {
  const homeTitle = 'TalentPulse — Toutes les offres d’emploi en une seule recherche';
  const homeDesc = 'Toutes les offres d’emploi France Travail, Adzuna et Choisir le Service Public, alternance comprise, en une seule recherche. Filtrez par ville, contrat et salaire. Gratuit, sans inscription.';
  const pages = {
    cgu: ['Conditions générales d’utilisation — TalentPulse', 'Conditions d’utilisation du service gratuit TalentPulse : offres tierces, candidatures, compte, données et droit applicable.', '/cgu', 'index,follow', null],
    contact: ['Contact — TalentPulse', 'Contacter l’éditeur de TalentPulse pour une question, une suggestion ou un problème technique.', '/contact', 'index,follow', null],
    'a-propos': ['À propos — TalentPulse', 'TalentPulse, agrégateur gratuit d’offres d’emploi France Travail, Adzuna et Choisir le Service Public.', '/a-propos', 'index,follow', null],
    'mentions-legales': ['Mentions légales — TalentPulse', 'Mentions légales du site TalentPulse : éditeur, hébergeur et contact.', '/mentions-legales', 'index,follow', null],
    confidentialite: ['Politique de confidentialité — TalentPulse', 'Comment TalentPulse traite vos données : stockage local, compte optionnel, sous-traitants, durées de conservation et droits.', '/confidentialite', 'index,follow', null],
    connexion: ['Connexion — TalentPulse', 'Connectez-vous ou créez un compte gratuit pour synchroniser favoris, suivi et alertes.', '/connexion', 'noindex, nofollow', 'page-login'],
    'mon-espace': ['Mon espace — TalentPulse', 'Vos favoris, votre suivi de candidatures et vos alertes, sur cet appareil ou synchronisés avec votre compte.', '/mon-espace', 'noindex, nofollow', 'page-profile'],
    lettre: ['Lettre de motivation — TalentPulse', 'Générez une trame de lettre de motivation à personnaliser.', '/lettre', 'index,follow', 'page-lettre'],
    conseils: ['Conseils carrière — TalentPulse', 'Conseils pour réussir votre recherche d’emploi.', '/conseils', 'index,follow', 'page-conseils'],
  };
  for (const [page, [title, description, path, robots, section]] of Object.entries(pages)) {
    const r = await call({ page });
    assert.equal(r.status, 200, page);
    assert.equal(meta(r.body, /<title>([^<]*)<\/title>/), title, page);
    assert.notEqual(meta(r.body, /<title>([^<]*)<\/title>/), homeTitle, page);
    assert.equal(meta(r.body, /<meta name="description" content="([^"]*)"/), description, page);
    assert.notEqual(description, homeDesc);
    assert.equal(meta(r.body, /<link rel="canonical" href="([^"]*)"/), 'https://talentpulse-topaz.vercel.app' + path, page);
    assert.equal(meta(r.body, /<meta name="robots" content="([^"]*)"/), robots, page);
    assert.equal(meta(r.body, /<meta property="og:url" content="([^"]*)"/), 'https://talentpulse-topaz.vercel.app' + path, page);
    if (section) {
      assert.match(r.body, new RegExp(`<section class="page active" id="${section}"`), page);
      assert.match(r.body, /<section class="page" id="page-home"/, page);
    } else {
      assert.match(r.body, /<section class="page active" id="page-legal"/, page);
      assert.match(r.body, /<section class="page" id="page-home"/, page);
    }
    assert.doesNotMatch(r.body, /<h1 class="hero-title" id="homeTitle">/, page);
    assert.equal((r.body.match(/<h1[\s>]/g) || []).length, 1, 'un seul h1 sur ' + page);
    if (page === 'connexion') assert.match(r.body, /<h1 class="auth-title" id="authTitle">Connexion<\/h1>/);
    else if (page === 'mon-espace') assert.match(r.body, /<h1 class="profile-name" id="profName">Mon espace<\/h1>/);
    else if (page === 'lettre') assert.match(r.body, /<h1[^>]*\bid="lettreTitle"[^>]*>Lettre de motivation<\/h1>/);
    else if (page === 'conseils') assert.match(r.body, /<h1[^>]*\bid="conseilsTitle"[^>]*>Conseils carrière<\/h1>/);
    else assert.match(r.body, /<h1 id="legalPageTitle">/, page);
    assert.equal(r.headers['x-robots-tag'], robots.replace(/,\s*/g, ', '), page);
  }
  const priv = await call({ page: 'connexion' });
  assert.equal(priv.headers['cache-control'], 'no-store');
  assert.match(priv.body, /<meta name="robots" content="noindex, nofollow">/);
  const pub = await call({ page: 'cgu' });
  assert.match(pub.headers['cache-control'], /s-maxage=/);
  assert.equal((await call({ page: 'inconnue' })).status, 404);

  const mentions = await call({ page: 'mentions-legales' });
  assert.match(mentions.body, /SIREN/);
  assert.match(mentions.body, /Vercel Inc\./);
  assert.match(mentions.body, /\[À COMPLÉTER : adresse email de contact vérifiée\]/);
  const article = mentions.body.split('id="legalPage"')[1] || '';
  assert.ok(article.length > 500, 'le corps légal est dans le HTML SSR');
  assert.match((await call({ page: 'cgu' })).body, /\[À COMPLÉTER : tribunal compétent\]/);
});

test('titre d’atterrissage : 1 offre au singulier, total attribué à France Travail', () => {
  const job = JOBS.find(j => j.slug === 'developpeur');
  const place = PLACES.find(p => p.slug === 'nimes');
  assert.equal(landingTitle(job, place, 1), 'Développeur à Nîmes : 1 offre France Travail | TalentPulse');
  assert.equal(landingTitle(job, place, 2), 'Développeur à Nîmes : 2 offres France Travail | TalentPulse');
  const emploi = JOBS.find(j => j.slug === 'emploi');
  assert.match(landingTitle(emploi, place, 1), /1 annonce France Travail/);
  const one = landingDescription(job, place, 1, { contracts: [['CDI', 1]] });
  assert.match(one, /1 offre de développeur/);
  assert.doesNotMatch(one, /1 offres/);
  assert.match(one, /Publiée sur France Travail/);
  assert.match(one, /Adzuna et Choisir le Service Public peuvent s’y ajouter/);
  const many = landingDescription(job, place, 152, { contracts: [['CDI', 80], ['CDD', 40]] });
  assert.match(many, /Publiées sur France Travail/);
  assert.equal(displaySearchLabel('etudiant'), 'Étudiant');
  assert.equal(displaySearchLabel('teletravail'), 'Télétravail');
  assert.equal(elisionDe('informatique'), 'd’informatique');
  assert.equal(elisionDe('serveur'), 'de serveur');
});

test('page libre : typographie des intitulés noindex (accents, élision, trait d’union)', async () => {
  const r = await call({ kw: 'informatique', lieu: 'rueil-malmaison' });
  assert.equal(r.status, 200);
  assert.equal(meta(r.body, /<title>([^<]*)<\/title>/), 'Informatique à Rueil-Malmaison — TalentPulse');
  assert.match(meta(r.body, /<meta name="description" content="([^"]*)"/), /Offres d’informatique à Rueil-Malmaison/);
  assert.equal(meta(r.body, /<h1 id="jobsHeader">([^<]*)<\/h1>/), 'Offres « Informatique » à Rueil-Malmaison');
  assert.doesNotMatch(r.body, /<h1 class="hero-title" id="homeTitle">/);
  assert.match(r.body, /<section class="page active" id="page-jobs"/);
  const e = await call({ kw: 'etudiant' });
  assert.equal(meta(e.body, /<title>([^<]*)<\/title>/), 'Étudiant — TalentPulse');
  assert.equal(meta(e.body, /<h1 id="jobsHeader">([^<]*)<\/h1>/), 'Offres « Étudiant »');
  const ville = await call({ kw: 'emploi', lieu: 'rueil-malmaison' });
  assert.equal(meta(ville.body, /<title>([^<]*)<\/title>/), 'Offres d’emploi à Rueil-Malmaison — TalentPulse');
  assert.equal(meta(ville.body, /<h1 id="jobsHeader">([^<]*)<\/h1>/), 'Offres à Rueil-Malmaison');
  assert.equal(shellPlaceName('rueil-malmaison', 'rueil-malmaison'), 'Rueil-Malmaison');
  assert.equal(shellJobsHeading('Étudiant', ''), 'Offres « Étudiant »');
});

test('données curées cohérentes avec la recherche du site (slugs, lieux reconnus, textes)', () => {
  const G = globalThis.TP_GEO;
  assert.equal(new Set(PLACES.map(p => p.slug)).size, PLACES.length);
  assert.equal(new Set(JOBS.map(j => j.slug)).size, JOBS.length);
  for (const p of PLACES) {
    assert.equal(p.slug, slugify(p.name), p.name);
    if (p.type !== 'commune') { const e = G.exactPlace(p.name); assert.ok(e && e.type === p.type && e.code === p.code, 'lieu reconnu par la recherche : ' + p.name); }
    assert.match(p.in, /^(à|au|en|dans) /);
  }
  for (const j of JOBS) { assert.equal(j.slug, slugify(j.slug)); if (j.slug !== 'emploi') assert.ok(j.blurb.length > 80, 'texte métier ' + j.slug); }
  for (const p of PLACES) assert.ok(nearbyPlaces(p, JOBS[1]).length >= 2, 'voisins pour ' + p.slug);
  assert.ok(relatedJobs(JOBS.find(j => j.slug === 'serveur'), PLACES[0]).slice(0, 2).every(j => j.family === 'restauration'));
  assert.ok(isCurated(JOBS.find(j => j.slug === 'macon'), PLACES.find(p => p.slug === 'bretagne')));
});
