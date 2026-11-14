import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legalInfo, LEGAL_DEFAULTS } from '../lib/env.js';

const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const legalPages = readFileSync(new URL('../public/assets/legal-pages.js', import.meta.url), 'utf8');
const legalSrc = app + '\n' + legalPages;
const LEGAL_ENV = ['LEGAL_EDITOR', 'LEGAL_STATUS', 'LEGAL_ADDRESS', 'LEGAL_SIREN', 'LEGAL_SIRET', 'LEGAL_DIRECTOR', 'LEGAL_VAT', 'CONTACT_EMAIL'];
function resetLegalEnv(vars = {}) {
  for (const k of LEGAL_ENV) delete process.env[k];
  Object.assign(process.env, vars);
}

test('legalInfo : défauts publics de l’éditeur, sans e-mail ni téléphone', () => {
  resetLegalEnv();
  const info = legalInfo();
  assert.equal(info.editor, 'Ryadh Issa Klaa');
  assert.equal(info.status, 'entrepreneur individuel (micro-entreprise)');
  assert.equal(info.address, '26 Domaine de la Côte Noire, 92500 Rueil-Malmaison');
  assert.equal(info.siren, '851054155');
  assert.equal(info.siret, '85105415500029');
  assert.equal(info.director, 'Ryadh Issa Klaa');
  assert.equal(info.vat, 'TVA non applicable, art. 293 B du CGI');
  assert.equal(info.contactEmail, undefined);
  assert.ok(!Object.values(info).some(v => /0\s*6|0\s*7|\+33|@gmail|@yahoo/i.test(v)));
});

test('legalInfo : les variables d’environnement priment, CONTACT_EMAIL reste optionnel', () => {
  resetLegalEnv({
    LEGAL_EDITOR: 'Autre Éditeur',
    LEGAL_STATUS: 'micro-entreprise',
    LEGAL_ADDRESS: '1 rue Exemple, 75001 Paris',
    LEGAL_SIREN: '123456789',
    LEGAL_SIRET: '12345678900011',
    LEGAL_DIRECTOR: 'Autre Éditeur',
    LEGAL_VAT: 'TVA non applicable, art. 293 B du CGI',
    CONTACT_EMAIL: 'contact@exemple.fr',
  });
  const info = legalInfo();
  assert.equal(info.editor, 'Autre Éditeur');
  assert.equal(info.address, '1 rue Exemple, 75001 Paris');
  assert.equal(info.siren, '123456789');
  assert.equal(info.siret, '12345678900011');
  assert.equal(info.contactEmail, 'contact@exemple.fr');
  resetLegalEnv();
  assert.deepEqual(legalInfo().editor, LEGAL_DEFAULTS.editor);
  assert.equal(legalInfo().contactEmail, undefined);
});

test('CGU art. 3 : décrit le comportement réel, sans envoi par TalentPulse', () => {
  assert.ok(!/TalentPulse envoie votre lettre/.test(legalSrc));
  assert.ok(!/demande expresse du candidat/.test(legalSrc));
  assert.match(legalSrc, /TalentPulse n’envoie pas lui-même votre lettre ni votre CV au recruteur/);
  assert.match(legalSrc, /e-mail prêt à envoyer depuis votre messagerie/);
  assert.match(legalSrc, /vous copiez la lettre générée et vous postulez directement sur le site d’origine/);
});

test('mentions légales : éditeur, SIREN et SIRET, pas de RCS, hébergeur Vercel, contact en attente', () => {
  assert.match(app, /editor: 'Ryadh Issa Klaa'/);
  assert.match(app, /siren: '851054155'/);
  assert.match(app, /siret: '85105415500029'/);
  assert.match(legalSrc, /SIREN : \$\{LV\('siren'/);
  assert.match(legalSrc, /SIRET : \$\{esc\(LEGAL\.siret\)\}/);
  assert.ok(!/SIREN \/ RCS/.test(legalSrc));
  assert.match(legalSrc, /Vercel Inc\., 440 N Barranca Ave #4133, Covina, CA 91723/);
  assert.match(app, /TVA non applicable, art\. 293 B du CGI/);
  assert.match(legalSrc, /TODO\('adresse email de contact vérifiée'\)/);
  assert.match(legalSrc, /TODO\('tribunal compétent'\)/);
  assert.ok(!/0668420933|0763940312|\+33 6|\+33 7/.test(legalSrc));
});

test('à propos et mentions : plus de promesse d’envoi de candidature par TalentPulse', () => {
  assert.match(legalSrc, /n’envoie pas les candidatures à votre place/);
  assert.ok(!/ne transmet pas de candidature, sauf/.test(legalSrc));
  assert.ok(!/Il ne transmet une candidature que/.test(legalSrc));
});
