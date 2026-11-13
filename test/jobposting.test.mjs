import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employmentTypes, baseSalaryOf, jobPostingLd, jobPostingScript, missingRequired } from '../lib/jobposting.js';
import { mapCSP } from '../lib/sources-csp.js';
import { _test } from '../lib/jobs.js';

const base = (extra = {}) => ({
  id: 'ft_1',
  title: 'Serveur (H/F)',
  company: 'Brasserie Bellecour',
  city: 'Lyon',
  dept: '69',
  contract: 'CDI',
  tempsPlein: 'Temps plein',
  salary: '',
  desc: 'Service en salle et accueil des clients.',
  posted: '2026-11-01T08:00:00.000Z',
  url: 'https://candidat.francetravail.fr/x',
  ...extra,
});

test('employmentType : CDI, CDD, intérim, stage, alternance, temps partiel', () => {
  assert.equal(employmentTypes({ contract: 'CDI', tempsPlein: 'Temps plein' }), 'FULL_TIME');
  assert.equal(employmentTypes({ contract: 'CDD' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'CDD de 3 ans' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'Intérim' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'CDI intérimaire', tempsPlein: 'Temps plein' }), 'TEMPORARY');
  assert.equal(employmentTypes({ contract: 'Stage' }), 'INTERN');
  assert.equal(employmentTypes({ contract: 'Alternance' }), 'OTHER');
  assert.equal(employmentTypes({ contract: 'Saisonnier' }), undefined);
  assert.equal(employmentTypes({ tempsPlein: 'Temps partiel' }), 'PART_TIME');
  assert.deepEqual(employmentTypes({ contract: 'CDI', tempsPlein: 'Temps partiel' }), ['FULL_TIME', 'PART_TIME']);
  assert.deepEqual(employmentTypes({ contract: 'CDD', tempsPlein: 'Temps partiel' }), ['TEMPORARY', 'PART_TIME']);
});

test('salaire : HOUR, MONTH, YEAR, fourchette, estimation et libellé inconnu exclus', () => {
  const hour = baseSalaryOf({ salary: '12,31 €/h' });
  assert.equal(hour.value.unitText, 'HOUR');
  assert.equal(hour.value.value, 12.31);
  assert.equal(hour.currency, 'EUR');
  const month = baseSalaryOf({ salary: '1 800 – 2 200 €/mois sur 13 mois' });
  assert.equal(month.value.unitText, 'MONTH');
  assert.equal(month.value.minValue, 1800);
  assert.equal(month.value.maxValue, 2200);
  assert.equal(month.value.value, undefined);
  const year = baseSalaryOf({ salary: '28 000 – 32 000 €/an' });
  assert.equal(year.value.unitText, 'YEAR');
  assert.equal(year.value.minValue, 28000);
  assert.equal(year.value.maxValue, 32000);
  assert.equal(baseSalaryOf({ salary: '2 000 €/mois (estimation Adzuna)' }), undefined);
  assert.equal(baseSalaryOf({ salary: 'Selon profil', salaryEstimated: true }), undefined);
  assert.equal(baseSalaryOf({ salary: '' }), undefined);
  assert.equal(baseSalaryOf({ salary: 'Mensuel de 32000 Euros' }), undefined);
});

test('lieu : locality, département, code postal seulement s’il est fourni', () => {
  const ld = jobPostingLd(base({ postalCode: '69003', city: 'Lyon 3e' }));
  assert.equal(ld.jobLocation.address.addressLocality, 'Lyon 3e');
  assert.equal(ld.jobLocation.address.addressRegion, 'Rhône');
  assert.equal(ld.jobLocation.address.addressCountry, 'FR');
  assert.equal(ld.jobLocation.address.postalCode, '69003');
  assert.equal(ld.jobLocation.address.streetAddress, undefined);
  const noCp = jobPostingLd(base());
  assert.equal(noCp.jobLocation.address.postalCode, undefined);
  assert.equal(jobPostingLd(base({ city: 'France' })), null);
  assert.equal(jobPostingLd(base({ city: 'Rhône (dép.)' })), null);
  assert.equal(jobPostingLd(base({ city: '', dept: '69' })), null);
  assert.equal(jobPostingLd(base({ dept: '' })), null);
  assert.equal(jobPostingLd(base({ postalCode: '69' })).jobLocation.address.postalCode, undefined);
});

test('sans entreprise, sans date ou sans description : pas de JSON-LD', () => {
  assert.equal(jobPostingLd(base({ company: '' })), null);
  assert.ok(missingRequired(base({ company: '' })).includes('hiringOrganization'));
  for (const company of ['Confidentiel', 'Entreprise anonyme', 'Non communiqué', 'ANONYME']) {
    assert.equal(jobPostingLd(base({ company })), null, company);
  }
  assert.equal(jobPostingLd(base({ posted: '' })), null);
  assert.equal(jobPostingLd(base({ desc: '' })), null);
  assert.equal(jobPostingLd(base({ desc: 'Serveur (H/F)' })), null);
  assert.equal(jobPostingLd(base({ title: 'Offre d’emploi', desc: 'Le détail complet et le formulaire de candidature sont sur Adzuna.' })), null);
  assert.equal(jobPostingLd(base({ title: 'Poste non précisé' })), null);
});

test('télétravail total seulement, sameAs et logo seulement s’ils existent, validThrough si la source le donne', () => {
  const plain = jobPostingLd(base());
  assert.equal(plain.jobLocationType, undefined);
  assert.equal(plain.applicantLocationRequirements, undefined);
  assert.equal(plain.hiringOrganization.logo, undefined);
  assert.equal(plain.hiringOrganization.sameAs, undefined);
  assert.equal(plain.validThrough, undefined);
  assert.equal(plain.directApply, false);
  assert.equal(plain.identifier.value, 'ft_1');

  const possible = jobPostingLd(base({ desc: 'Service en salle. Télétravail possible deux jours par semaine.' }));
  assert.equal(possible.jobLocationType, undefined);

  const remote = jobPostingLd(base({ desc: 'Poste en 100% télétravail, partout en France.' }));
  assert.equal(remote.jobLocationType, 'TELECOMMUTE');
  assert.deepEqual(remote.applicantLocationRequirements, { '@type': 'Country', name: 'FR' });
  assert.equal(remote.jobLocation.address.addressLocality, 'Lyon');

  const branded = jobPostingLd(base({
    logo: 'https://entreprise.francetravail.fr/logo.png',
    companyUrl: 'https://bellecour.example/equipe',
    expires: '2026-12-01',
  }));
  assert.equal(branded.hiringOrganization.logo, 'https://entreprise.francetravail.fr/logo.png');
  assert.equal(branded.hiringOrganization.sameAs, 'https://bellecour.example/equipe');
  assert.equal(branded.validThrough, '2026-12-01');
  assert.equal(jobPostingLd(base({ companyUrl: 'https://candidat.francetravail.fr/x' })).hiringOrganization.sameAs, undefined);
  assert.equal(jobPostingLd(base({ logo: 'javascript:alert(1)' })).hiringOrganization.logo, undefined);
});

test('le JSON échappe </script> et retire le HTML dangereux de la description', () => {
  const script = jobPostingScript(base({ desc: 'Avant </script><script>alert(1)</script> après' }), { pageUrl: 'https://talentpulse-topaz.vercel.app/offre/ft_1' });
  const json = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));
  assert.ok(!json.includes('<'), json.slice(0, 80));
  assert.equal(script.indexOf('</script>'), script.lastIndexOf('</script>'));
  const ld = JSON.parse(json);
  assert.equal(ld['@type'], 'JobPosting');
  assert.match(ld.description, /Avant/);
  assert.match(ld.description, /après/);
  assert.doesNotMatch(ld.description, /script|alert/i);
  assert.equal(ld.url, 'https://talentpulse-topaz.vercel.app/offre/ft_1');
});

test('mapping source : France Travail (code postal, salaire) et Service Public (pas de salaire, télétravail possible)', () => {
  const ft = _test.mapFT({
    id: 'ABC', intitule: 'SERVEUR H/F', entreprise: { nom: 'BRASSERIE DU PORT', url: 'https://port.example' },
    lieuTravail: { libelle: '69 - LYON 07', codePostal: '69007' }, typeContrat: 'CDD',
    dureeTravailLibelleConverti: 'Temps plein', salaire: { libelle: 'Horaire de 12.50 Euros' },
    description: 'Service en terrasse.', dateCreation: '2026-11-03T09:00:00.000Z',
    origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/ABC' },
  });
  const ld = jobPostingLd(ft);
  assert.equal(ld.identifier.value, 'ft_ABC');
  assert.equal(ld.jobLocation.address.postalCode, '69007');
  assert.equal(ld.jobLocation.address.addressRegion, 'Rhône');
  assert.equal(ld.employmentType, 'TEMPORARY');
  assert.equal(ld.baseSalary.value.unitText, 'HOUR');
  assert.equal(ld.baseSalary.value.value, 12.5);
  assert.equal(ld.hiringOrganization.sameAs, 'https://port.example/');
  assert.equal(jobPostingLd(_test.mapFT({
    id: 'X', intitule: 'Serveur', entreprise: {}, lieuTravail: { libelle: '69 - LYON' },
    description: 'Service.', dateCreation: '2026-11-01T00:00:00.000Z',
  })), null);

  const csp = mapCSP({
    ref: 'A1', title: 'Agent d’entretien', employer: 'Mairie de Gagny', dep: '93', city: 'Gagny',
    versant: 'FPT', categorie: 'C', contrat: 'CDD de 1 an', metier: 'Agent d’entretien',
    first: '2026-10-01', end: '2026-12-31', teletravail: 1, tempsPlein: 0,
  });
  const pub = jobPostingLd(csp);
  assert.equal(pub.hiringOrganization.name, 'Mairie de Gagny');
  assert.equal(pub.jobLocation.address.addressLocality, 'Gagny');
  assert.equal(pub.jobLocation.address.addressRegion, 'Seine-Saint-Denis');
  assert.equal(pub.jobLocation.address.addressCountry, 'FR');
  assert.equal(pub.validThrough, '2026-12-31');
  assert.equal(pub.datePosted, '2026-10-01T08:00:00.000Z');
  assert.deepEqual(pub.employmentType, ['TEMPORARY', 'PART_TIME']);
  assert.equal(pub.baseSalary, undefined);
  assert.equal(pub.jobLocationType, undefined, '« Télétravail possible » n’est pas un poste 100 % distant');
  assert.match(pub.description, /Télétravail possible/);
  assert.equal(jobPostingLd(mapCSP({
    ref: 'B', title: 'AGENT', employer: '', dep: '75', city: 'Paris', versant: 'FPE', categorie: 'A',
    contrat: 'CDI', metier: 'M', first: '2026-10-01', end: '2026-12-01', teletravail: 0, tempsPlein: 1,
  })), null);
});
