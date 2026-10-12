// Source « Choisir le Service Public » : construction de l'index (CSV ouvert DGAFP) et recherche en mémoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, mapRow, FIELDS, cityFrom, employerOf } from '../scripts/build-csp.mjs';
import { fetchCSP, fetchCSPById, mapCSP, cspUrl, _reset } from '../lib/sources-csp.js';

const HEADER = "Organisme de rattachement;Référence;Versant;Métier;Statut du poste;Nature de l'emploi;Durée du contrat;Intitulé du poste;Localisation du poste;Lieu d'affectation;Niveau d'études;Niveau d'expérience min. requis;Date de vacance de l'emploi;Date de début de publication par défaut;Date de fin de publication par défaut;Date de première publication;Spécialisation;Télétravail;Management;Employeur;Catégorie;Temps Plein;Durée du poste;Langues;Niveaux;Lieu d'affectation (sans géolocalisation);Avis de vacances au JO;Compétences attendues;Documents à transmettre;Nature de contrat";
const CSV = HEADER + '\n'
  + 'Communes;O093260911001078;Fonction Publique Territoriale;Chargée / Chargé d\'entretien des locaux;Vacant;Emploi ouvert aux titulaires et aux contractuels;;Agent d\'entretien (H/F) - Gagny;Seine Saint-Denis (93);1 place Foch : 93220 Gagny;;;01/10/2026;11/09/2026;30/11/2026;11/09/2026;;;;;Catégorie C (employé); Oui;;;;Gagny;"Texte\nsur deux lignes; avec ;";;;\n'
  + "Ministères;MEF_1;Fonction Publique de l'Etat;Développeuse / Développeur;Vacant;Emploi ouvert uniquement aux contractuels;3 ans;INGENIEUR DEVOPS H/F;Rhône (69);ESI - 10 rue X 69003 LYON;;;;01/09/2026;30/12/2026;01/09/2026;;Oui;;DGFiP;Catégorie A (cadre);Non;;;;;;;;CDD de 3 ans\n"
  + "Ministères;OLD_1;Fonction Publique de l'Etat;X;Vacant;;;Poste expiré;Paris (75);;;;;01/01/2026;31/01/2026;01/01/2026;;;;Y;Catégorie B;Oui;;;;;;;;\n";

test('build-csp : parse CSV (guillemets, multilignes), filtre les offres expirées, champs compacts', () => {
  const it = parseCsv(CSV); const header = it.next().value;
  const rows = [...it].filter(c => c.length > 10).map(c => mapRow(Object.fromEntries(header.map((h, i) => [h, c[i] || ''])), '2026-10-12')).filter(Boolean);
  assert.equal(rows.length, 2, 'offre expirée exclue');
  const o = Object.fromEntries(FIELDS.map((f, i) => [f, rows[0][i]]));
  assert.equal(o.employer, 'Mairie de Gagny');
  assert.equal(o.dep, '93'); assert.equal(o.city, 'Gagny'); assert.equal(o.categorie, 'C'); assert.equal(o.versant, 'FPT');
  assert.equal(o.contrat, 'Titulaire ou contractuel'); assert.equal(o.first, '2026-09-11'); assert.equal(o.end, '2026-11-30');
  const d = Object.fromEntries(FIELDS.map((f, i) => [f, rows[1][i]]));
  assert.equal(d.city, 'Lyon'); assert.equal(d.contrat, 'CDD de 3 ans'); assert.equal(d.tempsPlein, 0); assert.equal(d.teletravail, 1);
  assert.equal(cityFrom('139 rue de Bercy 75012 Paris', ''), 'Paris');
  assert.equal(employerOf({ 'Employeur': '', 'Organisme de rattachement': 'Etablissements publics locaux', 'Intitulé du poste': 'Animateur (h/f) - CCAS de Sevran' }, ''), 'CCAS de Sevran');
});

test('recherche CSP : mots-clés, lieu (commune / département / région), contrat, date, pagination, lien officiel', async () => {
  const row = (ref, title, dep, city, contrat, first, extra = {}) => ({ ref, title, employer: 'Mairie de ' + city, dep, city, versant: 'FPT', categorie: 'C', contrat, metier: 'Agent', first, end: '2026-12-31', teletravail: 0, tempsPlein: 1, region: { 93: '11', 75: '11', 69: '84' }[dep], _hay: (title + ' agent mairie de ' + city).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), _city: city.toLowerCase(), ...extra });
  _reset({ snapshot: '2026-09-13', rows: [
    row('A1', "Agent d'entretien (H/F) - Gagny", '93', 'Gagny', 'Titulaire ou contractuel', '2026-10-10'),
    row('A2', 'Agent de restauration', '75', 'Paris', 'CDI', '2026-09-01'),
    row('A3', "Agent d'entretien", '69', 'Lyon', 'CDD de 1 an', '2026-08-01'),
    row('A4', 'Expirée', '93', 'Gagny', 'CDI', '2026-08-01', { end: '2026-10-01' }),
  ] });
  const now = new Date('2026-10-12T10:00:00Z');
  const q = (o) => fetchCSP({ page: 1, loc: { type: 'none' }, ...o }, now);
  assert.equal((await q({})).total, 3, 'offre expirée exclue à la volée');
  assert.equal((await q({ keyword: 'entretien' })).total, 2);
  assert.equal((await q({ keyword: 'entretien', loc: { type: 'departement', departement: '93' } })).resultats[0].id, 'csp_A1');
  assert.equal((await q({ loc: { type: 'region', region: '11' } })).total, 2, 'Île-de-France');
  assert.equal((await q({ loc: { type: 'commune', label: 'Paris 15e' } })).total, 1, 'arrondissement → ville');
  assert.equal((await q({ contrat: 'CDI' })).total, 1);
  assert.equal((await q({ contrat: 'CDD' })).total, 2, 'CDD : contractuels inclus');
  assert.ok((await q({ contrat: 'Interim' })).skipped, 'intérim : source non concernée');
  assert.ok((await q({ experience: '1' })).skipped, 'filtre non géré : source exclue plutôt que hors filtre');
  assert.equal((await q({ publie: '7' })).total, 1, 'publiée depuis 7 jours');
  const j = (await q({ keyword: 'gagny' })).resultats[0];
  assert.equal(j.source, 'Choisir le Service Public'); assert.equal(j.publicSector, true); assert.equal(j.salary, '');
  assert.match(j.url, /^https:\/\/choisirleservicepublic\.gouv\.fr\/offre-emploi\/agent-d-entretien-h-f-gagny-reference-A1\/$/);
  assert.equal((await fetchCSPById('csp_A2')).title, 'Agent de restauration');
  assert.equal(await fetchCSPById('csp_ZZZ'), null);
  process.env.CSP_DISABLED = '1';
  assert.ok((await q({})).disabled); delete process.env.CSP_DISABLED;
});

test('index CSP livré : présent, récent et cohérent', async () => {
  const { default: d } = await import('../lib/data/csp-offres.json', { with: { type: 'json' } });
  assert.deepEqual(d.fields, FIELDS);
  assert.ok(d.rows.length > 1000, 'au moins 1 000 offres');
  assert.match(d.snapshot, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(cspUrl({ title: 'X', ref: 'R 1' }).endsWith('-reference-R%201/'));
  assert.ok(mapCSP({ ref: 'R', title: 'AGENT', employer: 'COMMUNE DE X', dep: '75', city: '', versant: 'FPE', categorie: 'A', contrat: 'CDI', metier: 'M', first: '2026-10-01', end: '2026-12-01', teletravail: 1, tempsPlein: 1 }).city === 'Paris');
});

test('stubs : France Travail Connect et sources sur accord restent inactifs sans configuration', async () => {
  const ftc = await import('../lib/ftconnect.js');
  assert.equal(ftc.buildAuthorizeUrl(), null);
  Object.assign(process.env, { FT_CONNECT_CLIENT_ID: 'PAR_x', FT_CONNECT_CLIENT_SECRET: 's', FT_CONNECT_REDIRECT_URI: 'https://talentpulse.fr/api/auth/ft-callback' });
  const a = ftc.buildAuthorizeUrl({ state: 'st', nonce: 'no' });
  const u = new URL(a.url);
  assert.equal(u.searchParams.get('realm'), '/individu'); assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'st'); assert.match(u.searchParams.get('scope'), /openid/);
  for (const k of ['FT_CONNECT_CLIENT_ID', 'FT_CONNECT_CLIENT_SECRET', 'FT_CONNECT_REDIRECT_URI']) delete process.env[k];
  const ex = await import('../lib/sources-extra.js');
  assert.ok((await ex.fetchEngagement({})).disabled);
  assert.ok((await ex.fetchEmployerFeeds({})).disabled);
  assert.deepEqual(ex.parseEmployerFeeds('smartrecruiters:Accor, inconnu:X, smartrecruiters:../x'), [{ kind: 'smartrecruiters', id: 'Accor' }]);
});
