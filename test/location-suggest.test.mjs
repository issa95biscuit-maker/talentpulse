// Sprint 3 : résolution des lieux (communes, arrondissements, départements, régions), paramètres
// France Travail / Adzuna, suggestions de métiers, nettoyage des intitulés. Réseau entièrement simulé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/assets/geo-fr.js';
import handler from '../api/jobs.js';
import suggestHandler from '../api/suggest.js';
import { _test as J } from '../lib/jobs.js';
import { _test as S } from '../lib/suggest.js';

process.env.FT_CLIENT_ID = 'x'; process.env.FT_CLIENT_SECRET = 'y'; process.env.ADZUNA_APP_ID = 'a'; process.env.ADZUNA_APP_KEY = 'b';

// Mini référentiel communal (extrait de geo.api.gouv.fr)
const COMMUNES = [
  { nom: 'Argenteuil', code: '95018', codeDepartement: '95', codesPostaux: ['95100'], population: 110000 },
  { nom: 'Argenteuil-sur-Armançon', code: '89019', codeDepartement: '89', codesPostaux: ['89160'], population: 200 },
  { nom: 'Cergy', code: '95127', codeDepartement: '95', codesPostaux: ['95000', '95800'], population: 69000 },
  { nom: 'Saint-Denis', code: '97411', codeDepartement: '974', codesPostaux: ['97400'], population: 153000 },
  { nom: 'Saint-Denis', code: '93066', codeDepartement: '93', codesPostaux: ['93200', '93210'], population: 150000 },
  { nom: 'Montreuil', code: '93048', codeDepartement: '93', codesPostaux: ['93100'], population: 111000 },
  { nom: 'Montreuil', code: '85148', codeDepartement: '85', codesPostaux: ['85200'], population: 800 },
  { nom: 'Versailles', code: '78646', codeDepartement: '78', codesPostaux: ['78000'], population: 84000 },
  { nom: 'Évry-Courcouronnes', code: '91228', codeDepartement: '91', codesPostaux: ['91000', '91080'], population: 67000 },
  { nom: 'Boulogne-Billancourt', code: '92012', codeDepartement: '92', codesPostaux: ['92100'], population: 121000 },
  { nom: 'Lyon', code: '69123', codeDepartement: '69', codesPostaux: ['69001'], population: 520000 },
  { nom: 'Saint-Étienne', code: '42218', codeDepartement: '42', codesPostaux: ['42000'], population: 173000 },
];
const n = s => globalThis.TP_GEO.norm(s);
const calls = [];
let geoDown = false;
global.fetch = async (url) => {
  url = String(url);
  const json = (obj, headers = {}) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
  if (url.includes('geo.api.gouv.fr')) {
    calls.push(url);
    if (geoDown) throw new Error('ECONNREFUSED');
    const u = new URL(url);
    const m = u.pathname.match(/^\/communes\/(\d[\dAB]\d{3})$/);
    if (m) { const c = COMMUNES.find(x => x.code === m[1]); return c ? json(c) : new Response('{}', { status: 404 }); }
    if (u.pathname === '/communes') {
      const nom = u.searchParams.get('nom'), cp = u.searchParams.get('codePostal'), dep = u.searchParams.get('codeDepartement');
      let list = COMMUNES;
      if (cp) list = list.filter(c => c.codesPostaux.includes(cp));
      if (nom) list = list.filter(c => n(c.nom).startsWith(n(nom)));
      if (dep) list = list.filter(c => c.codeDepartement === dep);
      return json([...list].sort((a, b) => b.population - a.population));
    }
    return json([]);
  }
  calls.push(url);
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (url.includes('referentiel/appellations')) return json([{ code: '38216', libelle: 'Serveur / Serveuse de restaurant' }, { code: '10868', libelle: 'Chef de rang' }, { code: '11573', libelle: 'Boulanger / Boulangère' }]);
  if (url.includes('offresdemploi/v2/offres/search')) return json({ resultats: [
    { id: 'A1', intitule: 'VENDEUR CONSEIL EN MAGASIN H/F (H/F)', entreprise: { nom: "GIRL'S BAR" }, lieuTravail: { libelle: '69 - LYON 05' }, typeContrat: 'CDI', experienceLibelle: '2 An(s)', dateCreation: '2026-10-01T10:00:00.000Z', origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/A1' }, description: 'Texte long' },
  ] }, { 'Content-Range': 'offres 0-0/1' });
  if (url.includes('api.adzuna.com')) return json({ count: 1, results: [
    { id: 9, title: 'Vendeur', company: { display_name: 'Boutique' }, location: { display_name: 'Paris 15e Arrondissement, Paris' }, created: '2026-10-01T08:00:00Z', redirect_url: 'https://adzuna.fr/9', description: 'x' },
  ] });
  throw new Error('unexpected ' + url);
};

function call(h, query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); }, end() { resolve({ status: this.statusCode }); } };
    h({ method: 'GET', query, headers: {} }, res);
  });
}
const ftUrl = () => new URL(calls.filter(u => u.includes('offres/search')).pop());
const adzUrl = () => new URL(calls.filter(u => u.includes('adzuna')).pop());

test('lieux : les cas de recette (communes, homonymes, codes postaux, arrondissements)', async () => {
  const R = J.resolveLocation;
  const cases = [
    ['Argenteuil', 'commune', '95018', 'Argenteuil'],
    ['Cergy', 'commune', '95127', 'Cergy'],
    ['Saint-Denis', 'commune', '97411', 'Saint-Denis (974)'],
    ['Saint-Denis (93)', 'commune', '93066', 'Saint-Denis (93)'],
    ['saint denis 93', 'commune', '93066', 'Saint-Denis (93)'],
    ['Montreuil', 'commune', '93048', 'Montreuil (93)'],
    ['Versailles', 'commune', '78646', 'Versailles'],
    ['evry courcouronnes', 'commune', '91228', 'Évry-Courcouronnes'],
    ['Boulogne-Billancourt', 'commune', '92012', 'Boulogne-Billancourt'],
    ['st etienne', 'commune', '42218', 'Saint-Étienne'],
    ['95', 'departement', '95', "Val-d'Oise"],
    ["Val-d'Oise", 'departement', '95', "Val-d'Oise"],
    ['val d oise', 'departement', '95', "Val-d'Oise"],
    ['Seine-Saint-Denis', 'departement', '93', 'Seine-Saint-Denis'],
    ['Île-de-France', 'region', '11', 'Île-de-France'],
    ['ile de france', 'region', '11', 'Île-de-France'],
    ['IDF', 'region', '11', 'Île-de-France'],
    ['Paris 15', 'arrondissement', '75115', 'Paris 15e'],
    ['75015', 'arrondissement', '75115', 'Paris 15e'],
    ['Lyon 3e', 'arrondissement', '69383', 'Lyon 3e'],
    ['95100', 'commune', '95018', 'Argenteuil (95100)'],
  ];
  for (const [q, type, code, display] of cases) {
    const loc = await R({ lieu: q });
    const got = loc.insee || loc.departement || loc.region || loc.code;
    const t = loc.arrondissement ? 'arrondissement' : loc.type;
    assert.equal(t, type, `${q} : type ${t}`);
    assert.equal(type === 'commune' || type === 'arrondissement' ? loc.insee : type === 'departement' ? loc.departement : loc.region, code, `${q} : code ${got}`);
    assert.equal(loc.display, display, `${q} : affichage`);
  }
});

test('lieux : geo.api.gouv.fr indisponible -> référentiel local pour départements et régions', async () => {
  geoDown = true;
  try {
    assert.equal((await J.resolveLocation({ lieu: 'Hauts-de-Seine' })).departement, '92');
    assert.equal((await J.resolveLocation({ lieu: 'Bretagne' })).region, '53');
  } finally { geoDown = false; }
});

test('France Travail / Adzuna : commune + distance, département, région, arrondissement', async () => {
  calls.length = 0;
  let r = await call(handler, { motsCles: 'vendeur', lieu: 'Argenteuil' });
  let ft = ftUrl().searchParams, adz = adzUrl().searchParams;
  assert.equal(ft.get('commune'), '95018'); assert.equal(ft.get('distance'), '10'); assert.equal(adz.get('where'), 'Argenteuil');
  assert.equal(r.body.location.type, 'commune');

  r = await call(handler, { motsCles: 'vendeur', lieu: '95' });
  ft = ftUrl().searchParams; adz = adzUrl().searchParams;
  assert.equal(ft.get('departement'), '95'); assert.ok(!ft.get('commune')); assert.equal(adz.get('where'), "Val-d'Oise");

  r = await call(handler, { motsCles: 'vendeur', lieu: 'ile de france' });
  ft = ftUrl().searchParams; adz = adzUrl().searchParams;
  assert.equal(ft.get('region'), '11'); assert.ok(!ft.get('departement') && !ft.get('commune')); assert.equal(adz.get('where'), 'Île-de-France');
  assert.deepEqual([r.body.location.type, r.body.location.display], ['region', 'Île-de-France']);

  r = await call(handler, { motsCles: 'vendeur', region: '84' });
  assert.equal(ftUrl().searchParams.get('region'), '84');

  r = await call(handler, { motsCles: 'vendeur', lieu: '75015' });
  ft = ftUrl().searchParams; adz = adzUrl().searchParams;
  assert.equal(ft.get('commune'), '75115'); assert.ok(Number(ft.get('distance')) <= 5); assert.equal(adz.get('where'), 'Paris'); assert.ok(!adz.get('distance'));
  assert.equal(r.body.location.type, 'arrondissement');
});

test('France Travail : mots-clés assainis (caractères refusés par l’API retirés)', async () => {
  calls.length = 0;
  await call(handler, { motsCles: 'vendeur <script> "luxe" ; (H/F)' });
  const kw = ftUrl().searchParams.get('motsCles');
  assert.ok(!/[<>";()]/.test(kw), kw);
  assert.ok(/vendeur/.test(kw) && /luxe/.test(kw));
});

test('mode light=1 (bandeau défilant) : champs minimaux, 12 offres max', async () => {
  const r = await call(handler, { light: '1', tri: 'date', source: 'ft' });
  assert.equal(r.status, 200);
  const j = r.body.resultats[0];
  assert.deepEqual(Object.keys(j).sort(), ['city', 'company', 'contract', 'id', 'posted', 'source', 'title']);
  assert.ok(r.body.resultats.length <= 12);
});

test('nettoyage : intitulés, entreprises, villes, expérience', async () => {
  assert.equal(J.cleanTitle('VENDEUR CONSEIL EN MAGASIN H/F (H/F)'), 'Vendeur conseil en magasin (H/F)');
  assert.equal(J.cleanTitle('responsable point de vente (h/f) (H/F)'), 'Responsable point de vente (H/F)');
  assert.equal(J.cleanTitle('CHAUFFEUR SPL CACES F/H'), 'Chauffeur SPL CACES (H/F)');
  assert.equal(J.cleanTitle('Employé (e) de ménage'), 'Employé(e) de ménage');
  assert.equal(J.companyCase("GIRL'S BAR"), "Girl's Bar");
  assert.equal(J.companyCase('CONCESSIONS GARES FRANCE SAS'), 'Concessions Gares France SAS');
  assert.equal(J.companyCase('Decathlon'), 'Decathlon');
  assert.deepEqual(['Lyon 05', 'Paris 1er Arrondissement', 'Lyon 6e Arrondissement', 'St Priest', 'Marseille 13'].map(J.cleanCity), ['Lyon 5e', 'Paris 1er', 'Lyon 6e', 'Saint-Priest', 'Marseille 13e']);
  assert.deepEqual(['1 An(s)', 'Expérience exigée de 3 An(s)', '6 Mois', 'Débutant accepté', ''].map(J.cleanExp), ['1 an d’expérience', '3 ans d’expérience', '6 mois d’expérience', 'Débutant accepté', '']);
  const r = await call(handler, { motsCles: 'vendeur', lieu: 'Lyon' });
  const ft = r.body.resultats.find(x => x.id === 'ft_A1'), adz = r.body.resultats.find(x => x.id === 'adz_9');
  assert.equal(ft.city, 'Lyon 5e'); assert.equal(ft.company, "Girl's Bar"); assert.equal(ft.exp, '2 ans d’expérience');
  assert.equal(adz.city, 'Paris 15e');
});

test('suggestions métiers : référentiel ROME France Travail, cache, repli local, validation', async () => {
  S.reset();
  let r = await call(suggestHandler, { type: 'metier', q: 'serv' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'france-travail');
  assert.ok(r.body.items.some(i => i.label === 'Serveur / Serveuse de restaurant' && i.code === '38216'), JSON.stringify(r.body.items));
  const before = calls.filter(u => u.includes('appellations')).length;
  await call(suggestHandler, { type: 'metier', q: 'chef' });
  assert.equal(calls.filter(u => u.includes('appellations')).length, before, 'référentiel mis en cache');
  r = await call(suggestHandler, { type: 'metier', q: 'x' });
  assert.ok(r.status === 400 || (r.body.items || []).length === 0, 'requête trop courte');
  // Sans clés France Travail : liste locale
  S.reset();
  const id = process.env.FT_CLIENT_ID; delete process.env.FT_CLIENT_ID;
  try {
    r = await call(suggestHandler, { type: 'metier', q: 'boulang' });
    assert.ok(['local', 'france-travail'].includes(r.body.source));
    assert.ok(r.body.items.some(i => /boulang/i.test(i.label)));
  } finally { process.env.FT_CLIENT_ID = id; }
});

test('geo-fr.js (navigateur + serveur) : normalisation et suggestions locales', () => {
  const G = globalThis.TP_GEO;
  assert.equal(G.norm('Île-de-France'), G.norm('ile de france'));
  assert.equal(G.norm("Val-d'Oise"), G.norm('val d oise'));
  assert.equal(G.depByCode('2A').label, 'Corse-du-Sud');
  assert.equal(G.suggestPlaces('ile de fr', 3)[0].label, 'Île-de-France');
  assert.equal(G.suggestPlaces('93', 3)[0].label, 'Seine-Saint-Denis');
  assert.equal(G.suggestPlaces('paris 15', 3)[0].label, 'Paris 15e');
  assert.equal(G.suggestPlaces('75116', 3)[0].label, 'Paris 16e');
  assert.equal(G.suggestPlaces('marseille 8', 3)[0].label, 'Marseille 8e');
  assert.ok(!G.depByCode('101'));
});
