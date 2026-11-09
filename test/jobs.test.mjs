// Tests du moteur de recherche (lib/jobs.js via api/jobs.js) : France Travail et Adzuna simulés,
// geo.api.gouv.fr réel (test ignoré si le réseau est indisponible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/jobs.js';

process.env.CSP_DISABLED = '1'; // source Fonction publique testée à part (test/csp.test.mjs)
process.env.FT_CLIENT_ID = 'x'; process.env.FT_CLIENT_SECRET = 'y'; process.env.ADZUNA_APP_ID = 'a'; process.env.ADZUNA_APP_KEY = 'b';
const realFetch = global.fetch;
const calls = [];
global.fetch = async (url, opts) => {
  url = String(url);
  if (url.includes('geo.api.gouv.fr')) return realFetch(url, opts);
  calls.push(url);
  const json = (obj, headers = {}) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (url.includes('offresdemploi/v2/offres/search')) return json({ resultats: [
    { id: '123ABC', intitule: 'Serveur H/F', entreprise: { nom: 'Brasserie X' }, lieuTravail: { libelle: '69 - LYON 03' }, typeContrat: 'CDI', alternance: false, salaire: { libelle: 'Annuel de 35000.0 Euros à 55000.0 Euros' }, experienceLibelle: 'Débutant accepté', experienceExige: 'D', dateCreation: '2026-09-30T10:00:00.000Z', dureeTravailLibelle: '35H Travail en journée', dureeTravailLibelleConverti: 'Temps plein', origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/123ABC' }, permis: [{ libelle: 'B - Véhicule léger', exigence: 'S' }], formations: [{ niveauLibelle: 'Bac ou équivalent' }] },
    { id: '456', intitule: 'Apprenti serveur', lieuTravail: { libelle: '69 - LYON 05' }, typeContrat: 'CDD', alternance: true, dateCreation: '2026-09-29T10:00:00.000Z', origineOffre: { urlOrigine: 'https://www.indeed.fr/x', partenaires: [{ nom: 'INDEED', url: 'https://www.indeed.fr/x' }] } },
  ] }, { 'Content-Range': 'offres 0-29/70' });
  if (url.includes('api.adzuna.com')) return json({ count: 40, results: [
    { id: 1, title: '<strong>Serveur</strong> en brasserie', company: { display_name: 'Brasserie X' }, location: { display_name: 'Lyon, Rhône' }, contract_type: 'contract', contract_time: 'full_time', salary_min: 2000, salary_max: 2000, created: '2026-09-28T08:00:00Z', redirect_url: 'https://adzuna.fr/1', description: 'Desc A' },
    { id: 2, title: 'Serveur en brasserie', company: { display_name: 'Brasserie X' }, location: { display_name: 'Lyon, Rhône' }, contract_type: 'contract', created: '2026-09-28T08:00:00Z', redirect_url: 'https://adzuna.fr/2', description: 'Desc A' },
    { id: 3, title: 'Technicien', company: { display_name: "Armée de l'Air" }, location: { display_name: 'Lyon 3e, Lyon' }, created: '2026-09-28T08:00:00Z', description: 'Même annonce' },
    { id: 4, title: 'Technicien', company: { display_name: "Armée de l'Air" }, location: { display_name: 'Villeurbanne, Rhône' }, created: '2026-09-28T08:00:00Z', description: 'Même annonce' },
  ] });
  throw new Error('unexpected ' + url);
};

function call(query) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); }, end() { resolve({ status: this.statusCode }); } };
    handler({ method: 'GET', query }, res);
  });
}

const online = await realFetch('https://geo.api.gouv.fr/departements/69').then(r => r.ok).catch(() => false);

test('recherche : ville -> INSEE, Adzuna localisé, dédoublonnage, salaires, pagination, filtres', { skip: !online && 'geo.api.gouv.fr injoignable' }, async () => {
  const ok = (c, m) => assert.ok(c, m);
  calls.length = 0;
  let r = await call({ motsCles: 'serveur', lieu: 'Lyon' });
  const ft = calls.find(u => u.includes('offres/search')), adz = calls.find(u => u.includes('adzuna'));
  ok(ft.includes('commune=69123') && ft.includes('distance=10'), 'FT reçoit commune=69123 : ' + ft.split('?')[1]);
  ok(adz.includes('where=Lyon'), 'Adzuna reçoit where=Lyon : ' + adz.split('&').filter(p => !/app_/.test(p)).join('&').split('?').pop());
  ok(r.body.total === 110 && r.body.totals.ft === 70 && r.body.totals.adzuna === 40, 'totaux FT+Adzuna ' + JSON.stringify(r.body.totals));
  ok(r.body.hasMore === true, 'hasMore');
  const titles = r.body.resultats.map(j => `${j.source}|${j.title}|${j.city}|${j.contract}|${j.salary}|${j.otherLocations}`);
  
  ok(r.body.resultats.filter(j => /Serveur en brasserie/.test(j.title)).length === 1, 'doublon Adzuna titre+entreprise+ville supprimé');
  ok(r.body.resultats.filter(j => j.title === 'Technicien').length === 1 && r.body.resultats.find(j => j.title === 'Technicien').otherLocations === 1, 'même annonce multi-villes regroupée');
  ok(r.body.resultats.find(j => j.id === 'ft_123ABC').salary === '35 000 – 55 000 €/an', 'salaire FT formaté');
  ok(r.body.resultats.find(j => j.id === 'adz_1').contract === 'CDD', 'contract_type Adzuna "contract" -> CDD');
  ok(r.body.resultats.find(j => j.id === 'adz_1').salary === '2 000 €/mois', 'salaire Adzuna 2k–2k -> 2 000 €/mois');
  ok(r.body.resultats.find(j => j.id === 'ft_456').contract === 'Alternance' && r.body.resultats.find(j => j.id === 'ft_456').sourceSite === 'INDEED', 'alternance FT + site partenaire');
  ok(/^\d{4}-\d{2}-\d{2}T/.test(r.body.resultats[0].posted), 'date ISO');
  ok(r.body.location.label === 'Lyon', 'location label');
  calls.length = 0;
  r = await call({ motsCles: 'serveur', departement: '69', contrat: 'Alternance', publie: '1', page: '2', tri: 'date', temps: 'plein', salaireMin: '30000' });
  const ft2 = calls.find(u => u.includes('offres/search')), adz2 = calls.find(u => u.includes('adzuna'));
  
  ok(ft2.includes('range=30-59') && ft2.includes('natureContrat=E2%2CFS') && ft2.includes('publieeDepuis=1') && ft2.includes('departement=69') && ft2.includes('sort=1'), 'FT page 2 + filtres');
  ok(adz2.includes('/search/2?') && adz2.includes('max_days_old=1') && adz2.includes('where=Rh') && adz2.includes('salary_min=30000'), 'Adzuna page 2 + filtres');
  calls.length = 0;
  r = await call({ motsCles: 'serveur', experience: 'debutant' });
  ok(!calls.some(u => u.includes('adzuna')) && r.body.notes && r.body.notes.adzuna, 'filtre expérience : Adzuna exclu avec note');
  r = await call({ count: '1' });
  ok(r.body.total === 110 && !r.body.resultats, 'mode count');
  r = await call({ debug: '1' });
  ok(JSON.stringify(r.body).indexOf('x') === -1 || r.body.env.FT_CLIENT_ID === true, 'debug sans fuite de valeur');
});

test('Adzuna : arrondissement seul reconstruit avec la ville', async () => {
  const { _test } = await import('../lib/jobs.js');
  const base = { id: 1, title: 'Serveur', redirect_url: 'https://www.adzuna.fr/x' };
  const c = loc => _test.mapAdzuna({ ...base, location: loc }).city;
  assert.equal(c({ display_name: '1er-Arrondissement, Lyon, Rhône' }), 'Lyon 1er');
  assert.equal(c({ display_name: '15e Arrondissement, Paris' }), 'Paris 15e');
  assert.equal(c({ display_name: '1er-Arrondissement', area: ['France', 'Auvergne-Rhône-Alpes', 'Rhône', 'Lyon', '1er-Arrondissement'] }), 'Lyon 1er');
  assert.equal(c({ display_name: 'Villeurbanne, Rhône' }), 'Villeurbanne');
  assert.equal(c({}), 'France');
});

test('parseFTSalary : corrige les périodes incohérentes (mensuel/annuel/horaire)', async () => {
  const { _test } = await import('../lib/jobs.js');
  const p = _test.parseFTSalary;

  const badMensuel = p('Mensuel de 32000.0 Euros à 50000.0 Euros');
  assert.match(badMensuel.label, /€\/an/);
  assert.equal(badMensuel.annualMin, 32000);
  assert.equal(badMensuel.annualMax, 50000);
  assert.match(badMensuel.extra, /interprété en annuel/);

  const okMensuel = p('Mensuel de 2200.0 Euros sur 12.0 mois');
  assert.equal(okMensuel.label, '2 200 €/mois');
  assert.equal(okMensuel.annualMin, 26400);

  const badAnnuel = p('Annuel de 1800.0 Euros à 2000.0 Euros');
  assert.match(badAnnuel.label, /€\/mois/);
  assert.equal(badAnnuel.annualMin, 1800 * 12);
  assert.equal(badAnnuel.annualMax, 2000 * 12);

  const horaire = p('Horaire de 12.31 Euros');
  assert.equal(horaire.label, '12,31 €/h');
  assert.equal(horaire.annualMin, Math.round(12.31 * 1607));
});

test('contrat : alternance prioritaire, déduction si vide, pastille non inventée côté API', async () => {
  const { _test } = await import('../lib/jobs.js');
  const alt = _test.mapFT({ id: '1', intitule: 'Alternance - serveur (H/F)', typeContrat: 'CDD', alternance: false, description: 'Contrat de professionnalisation', dateCreation: '2026-10-01T00:00:00Z' });
  assert.equal(alt.contract, 'Alternance');
  const adz = _test.mapAdzuna({ id: 7, title: 'Alternance - serveur (H/F)', contract_type: 'contract', description: 'CDD', redirect_url: 'https://www.adzuna.fr/7' });
  assert.equal(adz.contract, 'Alternance');
  const cdi = _test.mapAdzuna({ id: 8, title: 'Serveur', description: 'Poste en CDI, temps plein', redirect_url: 'https://www.adzuna.fr/8' });
  assert.equal(cdi.contract, 'CDI');
  const interim = _test.mapAdzuna({ id: 10, title: 'Préparateur de commandes', description: 'Mission d’intérim de 2 semaines', redirect_url: 'https://www.adzuna.fr/10' });
  assert.equal(interim.contract, 'Intérim');
  const blank = _test.mapAdzuna({ id: 11, title: 'Agent d’accueil', description: 'Horaires de journée', redirect_url: 'https://www.adzuna.fr/11' });
  assert.equal(blank.contract, '');
});

test('villes : casse, article, département homonyme, nom INSEE', async () => {
  const { _test } = await import('../lib/jobs.js');
  assert.equal(_test.frenchPlaceCase('PONT-À-MOUSSON'), 'Pont-à-Mousson');
  assert.equal(_test.frenchPlaceCase('CALUIRE-ET-CUIRE'), 'Caluire-et-Cuire');
  assert.deepEqual(_test.localPlace('Seine-Saint-Denis'), { city: 'Seine-Saint-Denis (dép.)', dept: '93' });
  assert.deepEqual(_test.localPlace('Paris'), { city: 'Paris', dept: '75' });
  const list = [
    { nom: 'Caluire-et-Cuire', code: '69034', codeDepartement: '69', population: 43000 },
    { nom: 'La Courneuve', code: '93027', codeDepartement: '93', population: 47000 },
    { nom: 'Saint-Denis', code: '93066', codeDepartement: '93', population: 113000 },
  ];
  assert.equal(_test.pickCommune(list, 'Caluire Et Cuire').nom, 'Caluire-et-Cuire');
  assert.equal(_test.pickCommune(list, 'Courneuve').nom, 'La Courneuve');
  assert.equal(_test.pickCommune(list, 'Denis'), null);
  if (online) {
    const a = await _test.canonPlace('Caluire Et Cuire');
    assert.equal(a.city, 'Caluire-et-Cuire');
    assert.equal(a.dept, '69');
    const b = await _test.canonPlace('Courneuve');
    assert.equal(b.city, 'La Courneuve');
    assert.equal(b.dept, '93');
    const c = await _test.canonPlace('Seine-Saint-Denis');
    assert.equal(c.city, 'Seine-Saint-Denis (dép.)');
    assert.equal(c.dept, '93');
  }
});

test('contrat : un stage annoncé dans le titre est classé Stage (Adzuna « contract » / FT CDD ou CDI)', async () => {
  const { _test } = await import('../lib/jobs.js');
  const c = (title, contract) => _test.classifyContract({ contract, title, desc: '' });
  assert.equal(c('Stage Ressources Humaines et formation (H/F)', 'CDD'), 'Stage');
  assert.equal(c('Consultante/Consultant Transformation - Stage (Stage) (H/F)', 'CDD'), 'Stage');
  assert.equal(c('Stage – Ingénieur(e) Quantique', 'CDD'), 'Stage');
  assert.equal(c('Internship/Stage - VC Analyst', 'CDD'), 'Stage');
  assert.equal(c('Attaché(e) relation client STAGE 6mois (H/F)', 'CDD'), 'Stage');
  assert.equal(c('Stage Business Developer (H/F)', 'CDI'), 'Stage');
  assert.equal(c('Stag. juriste corporate (Stage) (H/F)', 'CDD'), 'Stage');
  // Pas un stage : formateurs / coordinateurs de stages
  assert.equal(c('Coordinateur/Coordinatrice de stages de formation professionnelle', 'CDD'), 'CDD');
  assert.equal(c('FORMATEURS/TRICES stage BAFA et BAFD (H/F)', 'CDD'), 'CDD');
  assert.equal(c('Serveur (H/F)', 'CDI'), 'CDI');
  // L’alternance reste prioritaire
  assert.equal(c('Alternance - Stage RH', 'CDD'), 'Alternance');
});
