import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/assets/display-text.js';

const { typoTitle, displayTitle, displayCompany, CSP_EMPLOYER_MAX } = globalThis.TP_DISPLAY;

test('typoTitle : H/F en doublon, majuscules, compactage typographique', () => {
  assert.equal(typoTitle('VENDEUR CONSEIL EN MAGASIN H/F (H/F)'), 'Vendeur conseil en magasin (H/F)');
  assert.equal(typoTitle('responsable point de vente (h/f) (H/F)'), 'Responsable point de vente (H/F)');
  assert.equal(typoTitle('CHAUFFEUR SPL CACES F/H'), 'Chauffeur SPL CACES (H/F)');
  assert.equal(typoTitle('Employé (e) de ménage'), 'Employé(e) de ménage');
  assert.equal(typoTitle('ALTERNANCE : ALTERNANCE COMMERCIAL H/F'), 'Alternance commercial (H/F)');
  assert.equal(typoTitle('Charge(e) de clientèle'), 'Chargé(e) de clientèle');
  assert.equal(typoTitle('1 agent technique logistique (h/f)'), '1 agent technique logistique (H/F)');
});

test('displayTitle : écriture inclusive développée, données typographiques conservées à part', () => {
  assert.equal(displayTitle('Vendeur(se) expo menuiseries (H/F)'), 'Vendeur / Vendeuse expo menuiseries (H/F)');
  assert.equal(displayTitle('Charge(e) de clientèle'), 'Chargé / Chargée de clientèle');
  assert.equal(displayTitle('Chargé(e) de mission qualité (H/F)'), 'Chargé / Chargée de mission qualité (H/F)');
  assert.equal(displayTitle('Conseiller(e) vendeur(se) expert(e) en ameublement (H/F)'), 'Conseiller / Conseillère vendeur / vendeuse expert / experte en ameublement (H/F)');
  assert.equal(displayTitle('Conseiller(ère) vendeur(se) en accessoires (H/F)'), 'Conseiller / Conseillère vendeur / vendeuse en accessoires (H/F)');
  assert.equal(displayTitle('Préparateur(trice)/vendeur(se) en boulangerie (H/F)'), 'Préparateur / Préparatrice / vendeur / vendeuse en boulangerie (H/F)');
  assert.equal(displayTitle('Ingénieur(e) d’études (H/F)'), 'Ingénieur / Ingénieure d’études (H/F)');
  assert.equal(displayTitle('Agent(e) d’entretien'), 'Agent / Agente d’entretien');
  assert.equal(displayTitle('Chef.fe de projet Branding (H/F)'), 'Chef / Cheffe de projet Branding (H/F)');
  assert.equal(displayTitle('FORMATEURS/TRICES stage BAFA et BAFD (H/F)'), 'Formateurs / Formatrices stage BAFA et BAFD (H/F)');
  assert.equal(displayTitle('Vendeur / Vendeuse Showroom (H/F)'), 'Vendeur / Vendeuse Showroom (H/F)');
  assert.equal(displayTitle('Manager(e) commercial (H/F)'), 'Manager(e) commercial (H/F)');
  // typoTitle ne développe pas les doublets
  assert.equal(typoTitle('Vendeur(se) expo menuiseries (H/F)'), 'Vendeur(se) expo menuiseries (H/F)');
});

test('displayCompany : ellipse au dernier mot complet, sans inventer la suite', () => {
  assert.equal(displayCompany('Mairie de Rueil-Malmaison'), 'Mairie de Rueil-Malmaison');
  const raw = 'La Métropole de Lyon / Délégation solidarités habitat et éducation / Institut Départementa';
  assert.equal(raw.length, CSP_EMPLOYER_MAX);
  assert.equal(displayCompany(raw), 'La Métropole de Lyon / Délégation solidarités habitat et éducation / Institut…');
  assert.ok(!displayCompany(raw).includes('Départemental'));
  assert.equal(
    displayCompany("Institut National de Recherche pour l'Agriculture, l'Alimentation et l'Environnement (INRA"),
    "Institut National de Recherche pour l'Agriculture, l'Alimentation et l'Environnement…"
  );
  assert.equal(displayCompany('Déjà tronqué…'), 'Déjà tronqué…');
});
