// Correctifs de l’audit du 17/11/2026 : filtre de contrat dans l’URL, sitemap des fiches France Travail,
// JSON-LD (employmentType, dates de Paris), mentions légales complètes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/seo.js';
import { _clearCache, _clearFtSitemap, contractFromQuery, contractSuffix, activateContractChip, ftOfferEntries, parisDay, clipText, FT_SITEMAP_MAX, SITEMAPS } from '../lib/seo.js';
import { _test as jobsApi, listRecentFT } from '../lib/jobs.js';
import { employmentTypes, jobPostingLd } from '../lib/jobposting.js';
import { legalInfo } from '../lib/env.js';
import { typoFr, territoryName, marketCompactHtml } from '../lib/data-emploi.js';
import '../public/assets/legal-pages.js';

process.env.FT_CLIENT_ID = 'x'; process.env.FT_CLIENT_SECRET = 'y';
for (const k of ['CONTACT_EMAIL', 'LEGAL_COURT']) delete process.env[k];

const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const calls = [];
let ftTotal = 400;
let failRange = '';
const ftOffer = (i, extra = {}) => ({
  id: 'A' + String(i).padStart(5, '0'), intitule: `Serveur H/F ${i}`, description: 'Service en salle et accueil des clients.',
  entreprise: { nom: 'Brasserie Bellecour' }, lieuTravail: { libelle: '69 - LYON 03', codePostal: '69003' }, typeContrat: 'CDI',
  dureeTravailLibelleConverti: 'Temps plein',
  // France Travail : heure de Paris suffixée « Z »
  dateCreation: '2026-11-17T00:30:00.000Z', dateActualisation: '2026-11-17T00:40:00.000Z',
  origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/x' }, ...extra,
});
global.fetch = async (url) => {
  url = String(url);
  calls.push(url);
  const json = (obj, headers = {}, status = 200) => new Response(status === 204 ? null : JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (url.includes('geo.api.gouv.fr')) throw new Error('offline');
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (url.includes('offres/search')) {
    const u = new URL(url);
    const range = u.searchParams.get('range');
    if (range && range === failRange) return new Response('quota', { status: 429 });
    if (u.searchParams.get('sort') === '1' && !u.searchParams.get('motsCles') && range) {
      const [a, b] = range.split('-').map(Number);
      if (a >= ftTotal) return json(null, {}, 204);
      const list = [];
      for (let i = a; i <= Math.min(b, ftTotal - 1); i++) {
        // une offre sur 10 est anonyme (pas de JSON-LD possible → pas dans le sitemap)
        list.push(ftOffer(i, i % 10 === 9 ? { entreprise: { nom: 'Confidentiel' } } : {}));
      }
      return json({ resultats: list }, { 'Content-Range': `offres ${a}-${a + list.length - 1}/${ftTotal}` });
    }
    // Recherche des pages d’atterrissage : la liste suit le contrat demandé
    const cdi = u.searchParams.get('typeContrat') === 'CDI';
    const list = Array.from({ length: 6 }, (_, i) => ftOffer(i, { typeContrat: cdi || i % 2 ? 'CDI' : 'MIS' }));
    return json({ resultats: list }, { 'Content-Range': `offres 0-29/${cdi ? 64 : 152}` });
  }
  throw new Error('unexpected ' + url);
};
function call(query, url = '/api/seo') {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { resolve({ status: this.statusCode, body: String(b ?? ''), headers: this.headers }); } };
    handler({ method: 'GET', query, url }, res);
  });
}
const meta = (html, re) => (html.match(re) || [])[1];

// ── 1. Filtre de contrat dans l’URL ──
test('contrat dans l’URL : valeurs de l’API, casse et accents tolérés, inconnu ignoré', () => {
  assert.equal(contractFromQuery('?contrat=CDI'), 'CDI');
  assert.equal(contractFromQuery('contrat=cdd&utm_source=x'), 'CDD');
  assert.equal(contractFromQuery('?contrat=Intérim'), 'Interim');
  assert.equal(contractFromQuery('?contrat=alternance'), 'Alternance');
  assert.equal(contractFromQuery('?contrat=Stage'), 'Stage');
  assert.equal(contractFromQuery('?contrat=freelance'), '');
  assert.equal(contractFromQuery(''), '');
  assert.equal(contractSuffix('Interim'), ' en intérim');
  assert.equal(contractSuffix(''), '');
});

test('pastille : « Tous les contrats » désactivée, la pastille du filtre active (HTML servi = état du navigateur)', () => {
  const html = activateContractChip(shell, 'CDI');
  assert.match(html, /<button class="chip" type="button" data-filter="all" aria-pressed="false">Tous les contrats<\/button>/);
  assert.match(html, /<button class="chip active" type="button" data-filter="CDI" aria-pressed="true">CDI<\/button>/);
  assert.equal((html.match(/class="chip active" type="button" data-filter=/g) || []).length, 1, 'une seule pastille active');
  assert.equal(activateContractChip(shell, ''), shell);
});

test('page ville ?contrat=CDI : liste filtrée côté serveur, h1, titre, pastille et données d’hydratation alignés, noindex', async () => {
  _clearCache(); calls.length = 0;
  const r = await call({ kw: 'emploi', lieu: 'lyon' }, '/api/seo?kw=emploi&lieu=lyon&contrat=CDI');
  assert.equal(r.status, 200);
  const search = calls.find(u => u.includes('offres/search'));
  assert.match(search, /typeContrat=CDI/, 'France Travail interrogé avec le contrat');
  assert.match(r.body, /<h1 id="jobsHeader">Offres d’emploi à Lyon en CDI<\/h1>/);
  assert.match(meta(r.body, /<title>([^<]*)<\/title>/), /^Offres d’emploi à Lyon en CDI : 64 annonces France Travail \| TalentPulse$/);
  assert.match(r.body, /<button class="chip active" type="button" data-filter="CDI" aria-pressed="true">/);
  assert.match(r.body, /<meta name="robots" content="noindex,follow">/);
  assert.equal(r.headers['x-robots-tag'], 'noindex, follow');
  assert.match(r.body, /<link rel="canonical" href="https:\/\/talentpulse-topaz\.vercel\.app\/offres\/emploi\/lyon">/);
  const ssr = JSON.parse(meta(r.body, /<script type="application\/json" id="ssrData">([^<]*)<\/script>/));
  assert.equal(ssr.contrat, 'CDI');
  assert.equal(ssr.h1, 'Offres d’emploi à Lyon en CDI');
  assert.equal(ssr.h1Base, 'Offres d’emploi à Lyon');
  assert.ok(ssr.resultats.every(j => j.contract === 'CDI'), 'liste servie = CDI uniquement');
  assert.match(r.body, /offres d’emploi en CDI<\/strong>/, 'introduction alignée sur le filtre');

  _clearCache(); calls.length = 0;
  const plain = await call({ kw: 'emploi', lieu: 'lyon' }, '/api/seo?kw=emploi&lieu=lyon');
  assert.ok(!calls.find(u => u.includes('offres/search')).includes('typeContrat'), 'sans filtre : pas de contrat');
  assert.match(plain.body, /<h1 id="jobsHeader">Offres d’emploi à Lyon<\/h1>/);
  assert.match(plain.body, /<button class="chip active" type="button" data-filter="all" aria-pressed="true">/);
  assert.match(plain.body, /<meta name="robots" content="index,follow">/);
  const ssr2 = JSON.parse(meta(plain.body, /<script type="application\/json" id="ssrData">([^<]*)<\/script>/));
  assert.equal(ssr2.contrat, undefined);
});

test('recherche libre ?contrat=Interim : pastille et h1 dès le HTML servi', async () => {
  const r = await call({ kw: 'plombier-chauffagiste-xyz' }, '/api/seo?kw=plombier-chauffagiste-xyz&contrat=interim');
  assert.equal(r.status, 200);
  assert.match(r.body, /<button class="chip active" type="button" data-filter="Interim" aria-pressed="true">/);
  assert.match(r.body, /<h1 id="jobsHeader">[^<]* en intérim<\/h1>/);
  assert.match(r.body, /<meta name="robots" content="noindex,follow">/);
});

test('navigateur : le contrat de l’URL est lu avant l’hydratation et reste dans l’URL', () => {
  assert.match(app, /const contrat = contractFromSearch\(window\.location\.search\);/);
  assert.match(app, /if \(contrat !== State\.filter\) setContractFilter\(contrat, \{ reload: false \}\);\s*\n\s*const savedY/);
  assert.ok(app.indexOf('setContractFilter(contrat, { reload: false })') < app.indexOf('if (hydrateSsr(rawPath, { kw, city, distance })) return;'), 'filtre posé avant hydrateSsr');
  assert.match(app, /if \(\(ssr\.contrat \|\| 'all'\) !== State\.filter\) return false;/, 'HTML servi réutilisé seulement pour le même contrat');
  assert.match(app, /if \(CONTRACT_KEYS\.includes\(c\)\) qs\.set\('contrat', c\);/, 'lien partageable');
  assert.match(app, /loadJobs\(\{ kw: s\.kw, city: s\.city, distance: s\.distance \}\);/, 'le rayon choisi survit à un changement de pastille');
  assert.match(app, /const CONTRACT_KEYS = \['CDI', 'CDD', 'Interim', 'Alternance', 'Stage'\];/);
});

// ── 2. Sitemap des fiches France Travail ──
test('sitemap FT : tranches de 150 triées par date, fiches indexables seulement, lastmod en jour de Paris', async () => {
  _clearFtSitemap(); calls.length = 0; ftTotal = 400; failRange = '';
  const now = new Date('2026-11-17T12:00:00Z');
  const r = await ftOfferEntries({ now });
  const ranges = calls.filter(u => u.includes('offres/search')).map(u => new URL(u).searchParams.get('range'));
  assert.deepEqual(ranges.sort(), ['0-149', '150-299', '300-449'].sort());
  assert.equal(r.fetched, 400);
  assert.equal(r.entries.length, 360, '1 offre sur 10 anonyme écartée');
  assert.equal(r.excluded.hiringOrganization, 40);
  assert.equal(new Set(r.entries.map(e => e.loc)).size, r.entries.length, 'pas de doublon');
  assert.equal(r.entries[0].loc, '/offre/ft_A00000');
  // 00:40 « Z » de France Travail = 00:40 à Paris → même jour (et pas la veille en UTC)
  assert.equal(r.entries[0].lastmod, '2026-11-17');
  assert.equal(parisDay(new Date('2026-11-16T23:30:00Z')), '2026-11-17');
});

test('sitemap FT : plafond respecté (≤ 3 150, limite de l’API)', async () => {
  calls.length = 0; ftTotal = 100000; failRange = '';
  const { offers } = await listRecentFT({ max: 500 });
  assert.equal(offers.length, 500);
  const ranges = calls.filter(u => u.includes('offres/search')).map(u => new URL(u).searchParams.get('range'));
  assert.ok(ranges.includes('450-499'), 'dernière tranche coupée au plafond');
  calls.length = 0;
  await listRecentFT({ max: 99999, budgetMs: 60000 });
  const all = calls.filter(u => u.includes('offres/search')).map(u => new URL(u).searchParams.get('range').split('-').map(Number));
  assert.ok(all.every(([a, b]) => a <= 3000 && b <= 3149 && b - a < 150), 'jamais au-delà de 3149');
  assert.equal(FT_SITEMAP_MAX, 3000);
});

test('sitemap FT servi : index à 3 sous-cartes, XML valide, cache court si une tranche échoue', async () => {
  _clearFtSitemap(); ftTotal = 300; failRange = '';
  let r = await call({ sitemap: 'index' });
  for (const p of SITEMAPS) assert.ok(r.body.includes('https://talentpulse-topaz.vercel.app' + p), p);
  assert.ok(r.body.includes('/sitemap-offres-ft.xml'));
  r = await call({ sitemap: 'offres-ft' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /xml/);
  assert.match(r.headers['cache-control'], /s-maxage=86400/);
  assert.match(r.body, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(r.body, /<url><loc>https:\/\/talentpulse-topaz\.vercel\.app\/offre\/ft_A00000<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><\/url>/);
  assert.ok(!/adz_/.test(r.body), 'Adzuna absent (fiche éphémère, 410 après 24 h)');
  _clearFtSitemap(); failRange = '150-299';
  r = await call({ sitemap: 'offres-ft' });
  assert.match(r.headers['cache-control'], /s-maxage=600/, 'sitemap partiel : pas figé 24 h');
  failRange = '';
  const rewrite = vercel.rewrites.find(x => x.source === '/sitemap-offres-ft.xml');
  assert.equal(rewrite?.destination, '/api/seo?sitemap=offres-ft');
});

// ── 4. JSON-LD JobPosting ──
test('employmentType : durée et nature du contrat sans contradiction', () => {
  assert.equal(employmentTypes({ contract: 'CDI', tempsPlein: 'Temps partiel' }), 'PART_TIME');
  assert.equal(employmentTypes({ contract: 'CDI', tempsPlein: 'Temps plein' }), 'FULL_TIME');
  assert.equal(employmentTypes({ contract: 'CDI' }), undefined, 'CDI sans durée : rien de deviné');
  assert.deepEqual(employmentTypes({ contract: 'CDD', tempsPlein: 'Temps partiel' }), ['TEMPORARY', 'PART_TIME']);
  assert.equal(employmentTypes({ contract: 'CDD', tempsPlein: 'Temps plein' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'Intérim', tempsPlein: 'Temps plein' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'CDI', horaires: 'Temps partiel - 20H/semaine\nTravail le dimanche' }), 'PART_TIME');
  assert.equal(employmentTypes({ contract: 'CDI', horaires: 'Temps plein ou temps partiel' }), undefined, 'libellé ambigu : rien');
  const ft = jobsApi.mapFT(ftOffer(1, { dureeTravailLibelleConverti: 'Temps partiel', dureeTravailLibelle: 'Temps partiel - 20H/semaine' }));
  const ld = jobPostingLd(ft, { pageUrl: 'https://talentpulse-topaz.vercel.app/offre/' + ft.id });
  assert.equal(ld.employmentType, 'PART_TIME');
  assert.ok(!JSON.stringify(ld).includes('FULL_TIME'));
});

test('validThrough : seulement la date d’expiration fournie par France Travail', () => {
  const without = jobsApi.mapFT(ftOffer(2));
  assert.equal(jobPostingLd(without).validThrough, undefined);
  const withDate = jobsApi.mapFT(ftOffer(3, { dateExpiration: '2026-12-15T23:59:59.000Z' }));
  assert.equal(jobPostingLd(withDate).validThrough, '2026-12-15');
});

test('dates France Travail : heure de Paris étiquetée « Z » relue en UTC (été et hiver)', () => {
  assert.equal(jobsApi.ftParisDate('2026-11-17T18:06:12.247Z'), '2026-11-17T17:06:12.247Z');
  assert.equal(jobsApi.ftParisDate('2026-07-01T12:00:00Z'), '2026-07-01T10:00:00.000Z');
  assert.equal(jobsApi.ftParisDate('2026-01-01T00:30:00Z'), '2025-12-31T23:30:00.000Z');
  assert.equal(jobsApi.ftParisDate(''), '');
  assert.equal(jobsApi.ftParisDate('pas une date'), '');
  const job = jobsApi.mapFT(ftOffer(4, { dateCreation: '2026-11-17T18:06:00.000Z', dateActualisation: '2026-11-17T18:10:00.000Z' }));
  assert.equal(job.posted, '2026-11-17T17:06:00.000Z');
  assert.equal(job.updated, '2026-11-17T17:10:00.000Z');
  assert.equal(jobPostingLd(job).datePosted, '2026-11-17T17:06:00.000Z', 'datePosted jamais dans le futur');
});

// ── 5. Points mineurs ──
test('encart marché : typographie française, « Rhône », mention de territoire, pas de salaire en double', () => {
  assert.equal(typoFr("Demandeurs d'Emploi en catégories A,B ou C"), 'Demandeurs d’emploi en catégories A, B ou C');
  assert.equal(typoFr('2ème trimestre 2026'), '2e trimestre 2026');
  assert.equal(typoFr('Candidats inscrits ou non - Toutes durées'), 'Candidats inscrits ou non – Toutes durées');
  assert.equal(territoryName('RHONE'), 'Rhône');
  assert.equal(territoryName('BOUCHES DU RHONE'), 'Bouches-du-Rhône');
  assert.equal(territoryName('Rhône'), 'Rhône');
  const fig = (id, title, value, extra = {}) => ({ id, title, value, periode: { label: '2ème trimestre 2026', kind: 'quarter' }, ...extra });
  const html = marketCompactHtml({
    activityLabel: 'Serveur / Serveuse', territoryLabel: 'RHONE', coverageNote: 'Chiffres de l’ensemble du département.',
    figures: [fig('DE_1', 'Demandeurs d’emploi', { text: '1 090', kind: 'count' }, { libNomenclature: "Demandeurs d'Emploi en catégories A,B ou C" }),
      { id: 'SAL_3', title: 'Salaires en poste', value: { text: '2 045 €', kind: 'money' }, periode: { label: 'année 2022', kind: 'year', year: '2022' } }],
  }, { salaryKnown: true });
  assert.match(html, /Serveur \/ Serveuse · Rhône/);
  assert.match(html, /Chiffres de l’ensemble du département\./);
  assert.match(html, /Demandeurs d’emploi en catégories A, B ou C/);
  assert.ok(!/2ème|d'Emploi|RHONE/.test(html));
  assert.equal((html.match(/2 045/g) || []).length, 1, 'le montant n’apparaît qu’une fois');
});

test('accueil : JSON-LD WebSite + Organization sans donnée légale, retiré des autres pages', async () => {
  const raw = meta(shell, /<script type="application\/ld\+json" id="homeLd">([^<]*)<\/script>/);
  const ld = JSON.parse(raw);
  const types = ld['@graph'].map(n => n['@type']).sort();
  assert.deepEqual(types, ['Organization', 'WebSite']);
  assert.ok(!/siren|siret|address|telephone|email|Rueil|Klaa/i.test(raw), 'aucune information légale dans ce bloc');
  const org = ld['@graph'].find(n => n['@type'] === 'Organization');
  assert.equal(org.logo.url, 'https://talentpulse-topaz.vercel.app/icon-512.png');
  const page = await call({ page: 'cgu' });
  assert.ok(!page.body.includes('homeLd'), 'pas de WebSite sur les autres pages');
});

test('meta descriptions : 120 à 165 caractères sur les pages indexables courtes ; fiche coupée à un mot', async () => {
  for (const p of ['lettre', 'conseils', 'mentions-legales']) {
    const d = meta((await call({ page: p })).body, /<meta name="description" content="([^"]*)">/);
    assert.ok(d.length >= 120 && d.length <= 165, `${p} : ${d.length}`);
  }
  const t = clipText('Lorem ipsum dolor sit amet, '.repeat(10), 160);
  assert.ok(t.length <= 160 && t.endsWith('…') && !/\s…$/.test(t));
  assert.equal(clipText('Court.', 160), 'Court.');
});

// ── 6. Mentions légales ──
test('pages légales : plus aucun [À COMPLÉTER], e-mail talentpultze@gmail.com et tribunal judiciaire de Nanterre', async () => {
  const LEGAL = legalInfo();
  assert.equal(LEGAL.contactEmail, 'talentpultze@gmail.com');
  assert.equal(LEGAL.court, 'tribunal judiciaire de Nanterre');
  const pages = globalThis.TP_LEGAL.buildLegalPages({ LEGAL, FEATURES: { auth: true, sync: true } });
  for (const [path, page] of Object.entries(pages)) {
    const body = page.body();
    assert.ok(!/À COMPLÉTER|class="todo"/.test(body), path + ' : marqueur restant');
  }
  for (const path of ['/mentions-legales', '/confidentialite', '/cgu', '/a-propos', '/contact']) {
    assert.match(pages[path].body(), /mailto:talentpultze@gmail\.com/, path);
  }
  assert.match(pages['/cgu'].body(), /Tribunal compétent : tribunal judiciaire de Nanterre\./);
  for (const p of ['mentions-legales', 'confidentialite', 'cgu', 'a-propos', 'contact']) {
    const r = await call({ page: p });
    assert.ok(!/À COMPLÉTER/.test(r.body), p + ' (HTML servi)');
  }
  assert.ok(!/0\s*6\s*\d\d|0\s*7\s*\d\d|\+33/.test(JSON.stringify(LEGAL)), 'aucun téléphone publié');
});
