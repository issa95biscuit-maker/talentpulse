import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/assets/display-text.js';

const { typoTitle, displayTitle, displayContract, displayCompany, CSP_EMPLOYER_MAX } = globalThis.TP_DISPLAY;

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

test('displayTitle : suffixe abrégé après une barre, sans inventer un mot douteux', () => {
  assert.equal(displayTitle('Vendeur/euse en boulangerie (H/F)'), 'Vendeur / Vendeuse en boulangerie (H/F)');
  assert.equal(displayTitle('Vendeur/Vendeuse Showroom (H/F)'), 'Vendeur / Vendeuse Showroom (H/F)');
  assert.equal(displayTitle('Vendeur/ Vendeuse en parapharmacie (H/F)'), 'Vendeur / Vendeuse en parapharmacie (H/F)');
  assert.equal(displayTitle('Vendeur / Vendeuse Showroom (H/F)'), 'Vendeur / Vendeuse Showroom (H/F)');
  assert.equal(displayTitle('FORMATEURS/TRICES stage BAFA et BAFD (H/F)'), 'Formateurs / Formatrices stage BAFA et BAFD (H/F)');
  assert.equal(displayTitle('Préparateur/trice'), 'Préparateur / Préparatrice');
  assert.equal(displayTitle('Coach/Formateur/trice'), 'Coach / Formateur / Formatrice');
  assert.equal(displayTitle('Boulanger/ère (H/F)'), 'Boulanger / Boulangère (H/F)');
  assert.equal(displayTitle('Infirmier/ère'), 'Infirmier / Infirmière');
  assert.equal(displayTitle('Pâtissier/ière'), 'Pâtissier / Pâtissière');
  assert.equal(displayTitle('Technicien/ne'), 'Technicien / Technicienne');
  assert.equal(displayTitle('Musicien/ienne'), 'Musicien / Musicienne');
  assert.equal(displayTitle('Chargé/e de mission'), 'Chargé / Chargée de mission');
  assert.equal(displayTitle('Agent/e d’entretien'), 'Agent / Agente d’entretien');
  assert.equal(displayTitle('Serveur/se'), 'Serveur / Serveuse');
  assert.equal(displayTitle('Vendeurs/euses'), 'Vendeurs / Vendeuses');
  assert.equal(displayTitle('Pharmacie/Parapharmacie'), 'Pharmacie / Parapharmacie');
  assert.equal(displayTitle('Barman/barmaid'), 'Barman / barmaid');
  assert.equal(displayTitle('Manager/e commercial (H/F)'), 'Manager/e commercial (H/F)');
  assert.equal(displayTitle('Foo/euse'), 'Foo/euse');
  assert.equal(displayTitle('Foo/ienne'), 'Foo/ienne');
  assert.equal(displayTitle('agent/ne'), 'Agent/ne');
  // le titre source (API, JSON-LD) ne développe pas la barre
  assert.equal(typoTitle('Vendeur/euse en boulangerie (H/F)'), 'Vendeur/euse en boulangerie (H/F)');
});

test('displayContract : durée France Travail lisible, libellé non reconnu intact', () => {
  assert.equal(displayContract('Intérim - 3 Jour(s)'), 'Intérim · 3 jours');
  assert.equal(displayContract('CDD - 6 Mois'), 'CDD · 6 mois');
  assert.equal(displayContract('Saisonnier - 1 Mois'), 'Saisonnier · 1 mois');
  assert.equal(displayContract('Intérim - 1 Jour(s)'), 'Intérim · 1 jour');
  assert.equal(displayContract('CDD - 15 Jour(s)'), 'CDD · 15 jours');
  assert.equal(displayContract('1 Jour'), '1 jour');
  assert.equal(displayContract('1 Jours'), '1 jour');
  assert.equal(displayContract('3 Jour(s)'), '3 jours');
  assert.equal(displayContract('CDD - 1 An(s)'), 'CDD · 1 an');
  assert.equal(displayContract('CDD - 2 An(s)'), 'CDD · 2 ans');
  assert.equal(displayContract('CDD - 1 Année(s)'), 'CDD · 1 année');
  assert.equal(displayContract('CDD - 3 Année(s)'), 'CDD · 3 années');
  assert.equal(displayContract('CDD - 1 Annee(s)'), 'CDD · 1 année');
  assert.equal(displayContract('Intérim - 1 Semaine(s)'), 'Intérim · 1 semaine');
  assert.equal(displayContract('Intérim - 2 Semaine(s)'), 'Intérim · 2 semaines');
  assert.equal(displayContract('Intérim - 1 Heure(s)'), 'Intérim · 1 heure');
  assert.equal(displayContract('Intérim - 8 Heure(s)'), 'Intérim · 8 heures');
  assert.equal(displayContract('Intérim - 1 Minute(s)'), 'Intérim · 1 minute');
  assert.equal(displayContract('CDD - 1,5 Mois'), 'CDD · 1,5 mois');
  assert.equal(displayContract('  CDD - 6 Mois  '), 'CDD · 6 mois');
  assert.equal(displayContract('CDI'), 'CDI');
  assert.equal(displayContract('CDI Intérimaire'), 'CDI Intérimaire');
  assert.equal(displayContract('Profession libérale'), 'Profession libérale');
  assert.equal(displayContract('Profession  libérale'), 'Profession  libérale');
  assert.equal(displayContract("Reprise d'entreprise"), "Reprise d'entreprise");
  assert.equal(displayContract('CDD de 3 ans'), 'CDD de 3 ans');
  assert.equal(displayContract('CDD - 6 Mois renouvelable'), 'CDD - 6 Mois renouvelable');
  assert.equal(displayContract('Intérim - temps plein'), 'Intérim - temps plein');
  assert.equal(displayContract('Fonction publique de l’État, catégorie A'), 'Fonction publique de l’État, catégorie A');
  assert.equal(displayContract(''), '');
  assert.equal(displayContract(null), '');
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
