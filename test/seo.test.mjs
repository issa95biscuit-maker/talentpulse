// Pages d'atterrissage SEO (api/seo.js + lib/seo.js) : France Travail simulé, geo.api.gouv.fr coupé (repli local).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/seo.js';
import { _clearCache } from '../lib/seo.js';
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
  assert.match(r.body, /<section class="page active" id="page-home"/, 'page applicative inchangée (le navigateur charge la recherche)');
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
  assert.equal(new Set(locs).size, locs.length, 'pas de doublon');
  assert.ok(locs.length > 1000 && locs.length < 50000, locs.length + ' URL');
  for (const p of ['/offres/serveur/lyon', '/offres/developpeur/ile-de-france', '/offres/emploi', '/offres/emploi/val-d-oise', '/offres/macon/paris']) assert.ok(locs.includes(p), p);
  assert.ok(!locs.includes('/offres/macon/le-havre'), 'palier 2 hors grandes villes exclu');
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
      assert.match(r.body, /<section class="page active" id="page-home"/, page);
    }
    assert.equal(r.headers['x-robots-tag'], robots.replace(/,\s*/g, ', '), page);
  }
  const priv = await call({ page: 'connexion' });
  assert.equal(priv.headers['cache-control'], 'no-store');
  assert.match(priv.body, /<meta name="robots" content="noindex, nofollow">/);
  const pub = await call({ page: 'cgu' });
  assert.match(pub.headers['cache-control'], /s-maxage=/);
  assert.equal((await call({ page: 'inconnue' })).status, 404);
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
