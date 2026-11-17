// Dédoublonnage après fusion des sources : vrais doublons, faux positifs, entreprise vide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { _test } from '../lib/jobs.js';
import { jobPostingLd } from '../lib/jobposting.js';
import { formatJobsCount } from '../lib/jobs-count.js';

const { dedupe } = _test;

const base = (over = {}) => ({
  source: 'Adzuna',
  title: 'Serveur / Serveuse en restauration (H/F)',
  company: 'Ibis Lyon Est Bron',
  city: 'Bron',
  dept: '69',
  postalCode: '',
  contract: '',
  salary: '',
  salaryMin: null,
  salaryMax: null,
  desc: 'Merci de bien lire l\'annonce avant de nous contacter. Mise en place de la salle et service à table.',
  url: 'https://www.adzuna.fr/details/1',
  posted: '2026-11-11T05:44:51.000Z',
  ...over,
});

const ftIbis = (over = {}) => base({
  id: 'ft_216GQNH',
  source: 'France Travail',
  title: 'Serveur , Serveuse en restauration (H/F)',
  company: 'Ibis Lyon Est Bron',
  city: 'Bron',
  postalCode: '69500',
  contract: 'CDI',
  salary: '',
  desc: 'Merci de bien lire l\'annonce avant de nous contacter.\n\nUn serveur expérimenté pour la salle et la terrasse.',
  url: 'https://candidat.francetravail.fr/offres/recherche/detail/216GQNH',
  posted: '2026-11-10T10:41:47.614Z',
  _insee: '69029',
  ...over,
});

const adzIbis = (over = {}) => base({
  id: 'adz_5961099909',
  source: 'Adzuna',
  title: 'SERVEUR / SERVEUSE en restauration (F/H)',
  company: 'France Travail',
  city: 'Bron',
  salary: '12,31 €/h',
  salaryMin: 19782,
  salaryMax: 19782,
  contract: '',
  desc: 'Description du poste : Merci de bien lire l\'annonce avant de nous contacter. Un serveur expérimenté.',
  ...over,
});

test('vrai doublon : France Travail et Adzuna (H/F, casse, ponctuation), on garde la source officielle et le salaire manquant', () => {
  const out = dedupe([adzIbis(), ftIbis()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ft_216GQNH');
  assert.equal(out[0].source, 'France Travail');
  assert.equal(out[0].company, 'Ibis Lyon Est Bron');
  assert.equal(out[0].url, 'https://candidat.francetravail.fr/offres/recherche/detail/216GQNH');
  assert.equal(out[0].salary, '12,31 €/h');
  assert.equal(out[0].salaryMin, 19782);
  assert.equal(out[0].contract, 'CDI');
  assert.match(out[0].desc, /terrasse/);
});

test('vrai doublon : accents, code postal et préfixe d\'entreprise (Groupama)', () => {
  const ft = base({
    id: 'ft_8550268',
    source: 'France Travail',
    title: 'Conseiller Commercial Développeur (H/F)',
    company: 'Groupama Méditerranée',
    city: 'Nîmes',
    dept: '30',
    postalCode: '30000',
    contract: 'CDI',
    salary: '25 000 – 30 000 €/an',
    salaryMin: 25000,
    salaryMax: 30000,
    desc: 'Groupama Méditerranée recrute un conseiller commercial développeur à Nîmes.',
    url: 'https://candidat.francetravail.fr/offres/recherche/detail/8550268',
    posted: '2026-11-01T10:00:00.000Z',
  });
  const adz = base({
    id: 'adz_5954448970',
    title: 'conseiller commercial développeur',
    company: 'Groupama',
    city: 'Nimes',
    dept: '30',
    salary: '26 000 €/an',
    salaryMin: 26000,
    salaryMax: 26000,
    desc: 'Même offre reprise par Adzuna.',
    posted: '2026-11-02T10:00:00.000Z',
  });
  const out = dedupe([adz, ft]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ft_8550268');
  assert.equal(out[0].salary, '25 000 – 30 000 €/an', 'un salaire déjà renseigné n\'est pas remplacé');
  assert.equal(out[0].company, 'Groupama Méditerranée');
});

test('code postal commun quand le nom de commune diffère', () => {
  const a = ftIbis({ city: 'Bron', postalCode: '69500' });
  const b = adzIbis({ city: '69500', company: 'Ibis Lyon Est Bron', postalCode: '69500' });
  const out = dedupe([b, a]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ft_216GQNH');
});

test('salaire estimé : on ne le recopie pas', () => {
  const out = dedupe([
    ftIbis(),
    adzIbis({ salary: '12 €/h (estimation Adzuna)', salaryMin: 19284, salaryMax: 19284 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].salary, '');
  assert.equal(out[0].salaryMin, null);
});

test('sans France Travail, on garde le lien Postuler et on complète le reste', () => {
  const withApply = base({
    id: 'adz_a',
    company: 'Café de la Gare',
    city: 'Lyon 3e',
    title: 'Equipier (H/F)',
    applyUrl: 'https://recruteur.example/postuler',
    salary: '',
    desc: 'Service en salle du soir, tenue fournie, planning tournant.',
  });
  const richerPay = base({
    id: 'adz_b',
    company: 'Cafe de la Gare',
    city: 'Lyon 3ème',
    title: 'ÉQUIPIER',
    salary: '2 000 €/mois',
    salaryMin: 24000,
    salaryMax: 24000,
    desc: 'Service en salle du soir, tenue fournie.',
  });
  const out = dedupe([richerPay, withApply]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'adz_a');
  assert.equal(out[0].applyUrl, 'https://recruteur.example/postuler');
  assert.equal(out[0].salary, '2 000 €/mois');
});

test('faux positif : deux postes différents chez le même employeur', () => {
  const serveur = ftIbis({ id: 'ft_a', title: 'Serveur / Serveuse (H/F)' });
  const chef = ftIbis({ id: 'ft_b', title: 'Chef de rang (H/F)', desc: 'Responsable de rang en salle, brigade de quatre.' });
  const out = dedupe([serveur, chef]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(j => j.id).sort(), ['ft_a', 'ft_b']);
});

test('faux positif : même intitulé, employeurs ou communes différents', () => {
  const ibis = ftIbis();
  const autre = ftIbis({ id: 'ft_autre', company: 'Frite Alors !', postalCode: '69001', city: 'Lyon 1er', _insee: '69381' });
  const autreArr = ftIbis({ id: 'ft_lyon7', city: 'Lyon 7e', postalCode: '69007', _insee: '69387', company: 'Ibis Lyon Est Bron' });
  const out = dedupe([ibis, autre, autreArr]);
  assert.equal(out.length, 3);
});

test('faux positif : même commune affichée, codes postaux contradictoires', () => {
  const a = ftIbis({ id: 'ft_69002', city: 'Lyon', postalCode: '69002', _insee: '69382', company: 'Trantranzai' });
  const b = ftIbis({ id: 'ft_69008', city: 'Lyon', postalCode: '69008', _insee: '69388', company: 'Trantranzai', title: 'Serveur , Serveuse en restauration (H/F)' });
  assert.equal(dedupe([a, b]).length, 2);
});

test('entreprise vide ou « non communiquée » : on ne fusionne pas', () => {
  const anon = (id, company) => ftIbis({ id, company, source: 'France Travail', salary: '12 €/h' });
  const empty = dedupe([anon('ft_1', ''), anon('ft_2', '')]);
  assert.equal(empty.length, 2);
  const hidden = dedupe([
    anon('ft_3', 'Non communiquée'),
    anon('ft_4', 'Entreprise non communiquée'),
    adzIbis({ id: 'adz_x', company: 'Confidentiel', salary: '' }),
  ]);
  assert.equal(hidden.length, 3);
});

test('même intitulé et même ville : une republication sans le même texte ne rejoint pas un autre employeur', () => {
  const frite = ftIbis({
    id: 'ft_frite',
    company: 'Frite Alors !',
    city: 'Lyon 1er',
    postalCode: '69001',
    _insee: '69381',
    desc: 'Nous recherchons pour notre restaurant 2 serveurs en CDI. Accueil, prise de commande et service en salle.',
  });
  const bistrot = adzIbis({
    id: 'adz_bistrot',
    city: 'Lyon 1er',
    company: 'France Travail',
    salary: '',
    desc: 'Description du poste : Le bistrot 96 recrute un serveur pour assurer le service de son restaurant, prise de poste en janvier.',
  });
  const out = dedupe([frite, bistrot]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(j => j.id).sort(), ['adz_bistrot', 'ft_frite']);
});

test('deux republications sans employeur fiable restent séparées ; une seule offre fiable les absorbe', () => {
  const board = (id, city) => adzIbis({ id, company: 'France Travail', city, salary: '' });
  assert.equal(dedupe([board('adz_1', 'Bron'), board('adz_2', 'Bron')]).length, 2);
  const ambiguous = dedupe([
    ftIbis({ id: 'ft_a', company: 'Ibis Lyon Est Bron' }),
    ftIbis({ id: 'ft_b', company: 'Hôtel Ibis Styles Bron', postalCode: '69500' }),
    adzIbis({ salary: '' }),
  ]);
  assert.equal(ambiguous.length, 3, 'deux employeurs fiables : la republication n\'est pas attribuée au hasard');
  const unique = dedupe([ftIbis(), board('adz_1', 'Bron'), board('adz_2', 'Bron')]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].id, 'ft_216GQNH');
});

test('préfixe ambigu : Groupama, Groupama Méditerranée et Groupama Gan restent distincts', () => {
  const job = (id, company) => base({
    id, company, source: 'France Travail', city: 'Nîmes', dept: '30',
    title: 'Conseiller Commercial Développeur (H/F)',
    desc: 'Poste de conseil et de développement commercial sur le secteur nîmois.',
  });
  const out = dedupe([
    job('ft_g', 'Groupama'),
    job('ft_m', 'Groupama Méditerranée'),
    job('ft_n', 'Groupama Gan'),
  ]);
  assert.equal(out.length, 3);
});

test('même annonce dans deux villes : otherLocations, pas un second poste', () => {
  const a = base({ id: 'adz_3', title: 'Technicien', company: "Armée de l'Air", city: 'Lyon 3e', desc: 'Même annonce' });
  const b = base({ id: 'adz_4', title: 'Technicien', company: "Armée de l'Air", city: 'Villeurbanne', desc: 'Même annonce' });
  const out = dedupe([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].otherLocations, 1);
});

test('compteur, liste et JSON-LD restent alignés sur les offres conservées', () => {
  const out = dedupe([adzIbis(), ftIbis({
    salary: '12,31 €/h',
    salaryMin: 19782,
    salaryMax: 19782,
    companyUrl: 'https://ibis.example',
  })]);
  assert.equal(out.length, 1);
  assert.ok(out.length <= 2);
  const location = { type: 'commune', label: 'Lyon', display: 'Lyon', distance: 10 };
  const label = formatJobsCount({ shown: out.length, hasMore: true, location });
  assert.equal(label, 'Plus d’une offre à moins de 10\u00a0km de Lyon');
  assert.equal(
    formatJobsCount({ shown: out.length, hasMore: false, location }),
    '1 offre à moins de 10\u00a0km de Lyon',
  );
  assert.equal(formatJobsCount({ shown: dedupe([]).length, hasMore: false, location }), '0 offre à moins de 10\u00a0km de Lyon');
  const ld = jobPostingLd(out[0], { pageUrl: 'https://talentpulse-topaz.vercel.app/offre/ft_216GQNH' });
  assert.equal(ld['@type'], 'JobPosting');
  assert.equal(ld.identifier.value, 'ft_216GQNH');
  assert.equal(dedupe([]).length, 0);
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const dedupePos = html.indexOf('/assets/dedupe.js');
  const appPos = html.indexOf('/assets/app.js');
  assert.ok(dedupePos > 0 && appPos > dedupePos, 'le script de dédoublonnage est chargé avant l\'application');
});
