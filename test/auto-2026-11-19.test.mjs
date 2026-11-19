// Routine auto du 19/11/2026 : fiches Choisir le Service Public.
// 1) « 9999-12-31 » = pas de date de clôture : ni « Publication jusqu’au 31/12/9999 », ni validThrough.
// 2) Employeur rempli comme un formulaire (« Affectation : », « Adresse : », « … est un établissement… »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/assets/display-text.js';
import { mapCSP, realEnd } from '../lib/sources-csp.js';
import { jobPostingLd } from '../lib/jobposting.js';

const { displayCompany } = globalThis.TP_DISPLAY;
const base = { ref: '2026-2343848', title: 'Secrétaire', employer: 'Mairie', dep: '34', city: 'Beziers', versant: 'FPE', categorie: 'C', contrat: 'Titulaire ou contractuel', metier: 'Secrétaire', first: '2026-07-08', teletravail: 0, tempsPlein: 1 };

test('realEnd : la date sentinelle 9999-12-31 n’est pas une date de fin', () => {
  assert.equal(realEnd('9999-12-31'), '');
  assert.equal(realEnd(''), '');
  assert.equal(realEnd(undefined), '');
  assert.equal(realEnd('2026-12-10'), '2026-12-10');
});

test('mapCSP : sans date de clôture, pas de « 31/12/9999 » ni de validThrough', () => {
  const job = mapCSP({ ...base, end: '9999-12-31' });
  assert.equal(job.expires, '');
  assert.ok(!job.desc.includes('9999'), job.desc);
  assert.ok(!/Publication jusqu/.test(job.desc));
  assert.equal(jobPostingLd(job, 'https://talentpulse-topaz.vercel.app/offre/csp_2026-2343848').validThrough, undefined);
});

test('mapCSP : une vraie date de fin reste affichée et dans validThrough', () => {
  const job = mapCSP({ ...base, end: '2026-12-10' });
  assert.equal(job.expires, '2026-12-10');
  assert.ok(job.desc.includes('Publication jusqu’au 10/12/2026.'));
  assert.equal(jobPostingLd(job, 'https://talentpulse-topaz.vercel.app/offre/x').validThrough, '2026-12-10');
});

test('displayCompany : étiquettes « Direction : » / « Affectation : » retirées', () => {
  assert.equal(
    displayCompany('Affectation : Direction Interrégionale des Services Pénitentiaires de Toulouse – Service P'),
    'Direction Interrégionale des Services Pénitentiaires de Toulouse – Service…',
  );
  assert.equal(
    displayCompany("Direction : Direction Générale de l'Administration Pénitentiaire Affectation : Direction I"),
    "Direction Générale de l'Administration Pénitentiaire · Direction…",
  );
  assert.equal(
    displayCompany('Direction : Institut national de jeunes sourds de Paris (INJS Paris) Adresse : 254 rue Sai'),
    'Institut national de jeunes sourds de Paris (INJS Paris)',
  );
});

test('displayCompany : phrase de présentation ramenée au nom de la structure', () => {
  assert.equal(
    displayCompany("L'agence des communications mobiles opérationnelles de sécurité et de secours est un établ"),
    "L'agence des communications mobiles opérationnelles de sécurité et de secours",
  );
  assert.equal(displayCompany("Mines Paris-PSL est une des plus prestigieuses écoles d'ingénieur.es en France. Mines Pari"), 'Mines Paris-PSL');
  // « Est » dans un nom propre n’est pas une phrase
  assert.equal(displayCompany('Hopitaux Paris Est Val de Marne'), 'Hopitaux Paris Est Val de Marne');
});

test('displayCompany : accents des mots administratifs, sans toucher au reste', () => {
  assert.equal(displayCompany("Ministere de l'Economie et des Finances"), "Ministère de l'Économie et des Finances");
  assert.equal(displayCompany('Autres de Collectivite Territoriale de Guyane'), 'Autres de Collectivité Territoriale de Guyane');
  assert.equal(displayCompany('Ministère de la Justice'), 'Ministère de la Justice');
  assert.equal(displayCompany('Ctl Recrutement'), 'Ctl Recrutement');
  assert.equal(displayCompany('Mairie de Rueil-Malmaison'), 'Mairie de Rueil-Malmaison');
});
