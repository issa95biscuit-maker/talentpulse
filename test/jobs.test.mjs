// Tests du moteur de recherche (lib/jobs.js via api/jobs.js) : France Travail et Adzuna simulés,
// geo.api.gouv.fr réel (test ignoré si le réseau est indisponible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/jobs.js';

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
