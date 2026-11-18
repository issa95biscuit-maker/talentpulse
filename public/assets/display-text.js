/*
 * TalentPulse — libellés affichés (intitulés, employeurs).
 * Fichier partagé : chargé tel quel par le navigateur (<script>) ET importé par les fonctions API (ESM).
 * Il n'utilise ni import ni export : il expose globalThis.TP_DISPLAY.
 *
 * typoTitle : nettoyage typographique (casse, H/F en doublon, accents manquants).
 *             Appliqué aux données et, le cas échéant, au JSON-LD. Le titre d'API reste celui-ci.
 * displayTitle : typoTitle + affichage seulement : ponctuation, formes inclusives à point
 *             réduites au masculin quand (H/F) est déjà là, doublets « mot, féminin »,
 *             puis écriture inclusive développée (parenthèses et barres).
 * displayContract : durée France Travail (« Intérim - 3 Jour(s) ») rendue lisible.
 *             Affichage seulement : contractDetail de l'API reste la valeur source.
 * displayCompany : ellipse propre si le nom Service Public a été coupé à la source (90 car.).
 * searchKeywordLabel : libellé d’un slug de recherche libre (sigles de contrat, accents).
 *             Affichage seulement : le filtre contrat de l’API n’est pas concerné.
 */
(function () {
  const ACRONYMS = new Set(['CDI', 'CDD', 'BTP', 'RH', 'IT', 'SAV', 'VTC', 'ASH', 'AES', 'AESH', 'ATSEM', 'DRH', 'CAP', 'BEP', 'BTS', 'BAC', 'BAFA', 'BAFD', 'SNCF', 'RATP', 'PL', 'SPL', 'VL', 'CACES', 'SSIAP', 'ADV', 'QHSE', 'HSE', 'IDE', 'AS', 'DAF', 'PME', 'TPE', 'B2B', 'B2C', 'SEO', 'UX', 'UI', 'QA', 'SAP', 'ERP', 'CRM', 'IA', 'BIM', 'CVC', 'GMS', 'ETAM', 'EHPAD', 'SMS', 'CHU', 'CCAS']);
  /**
   * Accents manquants (titres CSP/FT souvent tout en capitales).
   * Clé = forme minuscule sans accent. Pas de mot ambigu (« cote », « diplome »).
   * « charges » n'est pas inclus (charges sociales ≠ chargés de mission).
   */
  const ACCENT_WORDS = {
    controle: 'contrôle', controles: 'contrôles',
    controleur: 'contrôleur', controleurs: 'contrôleurs',
    controleuse: 'contrôleuse', controleuses: 'contrôleuses',
    puericulture: 'puériculture',
    developpeur: 'développeur', developpeurs: 'développeurs',
    developpeuse: 'développeuse', developpeuses: 'développeuses',
    developpement: 'développement', developpements: 'développements',
    developpe: 'développé', developpee: 'développée', developpes: 'développés', developpees: 'développées',
    medecin: 'médecin', medecins: 'médecins', medecine: 'médecine',
    creche: 'crèche', creches: 'crèches',
    etablissement: 'établissement', etablissements: 'établissements',
    securite: 'sécurité', securites: 'sécurités',
    qualite: 'qualité', qualites: 'qualités',
    tresorerie: 'trésorerie', tresoreries: 'trésoreries',
    tresorier: 'trésorier', tresoriers: 'trésoriers',
    tresoriere: 'trésorière', tresorieres: 'trésorières',
    depot: 'dépôt', depots: 'dépôts',
    gerant: 'gérant', gerants: 'gérants', gerante: 'gérante', gerantes: 'gérantes',
    bibliotheque: 'bibliothèque', bibliotheques: 'bibliothèques',
    secretaire: 'secrétaire', secretaires: 'secrétaires', secretariat: 'secrétariat',
    deontologie: 'déontologie', mixite: 'mixité',
    petrolier: 'pétrolier', petroliers: 'pétroliers',
    petroliere: 'pétrolière', petrolieres: 'pétrolières',
    medical: 'médical', medicale: 'médicale', medicales: 'médicales', medicaux: 'médicaux',
    defense: 'défense', defenses: 'défenses',
    referent: 'référent', referents: 'référents',
    referente: 'référente', referentes: 'référentes',
    operationnel: 'opérationnel', operationnels: 'opérationnels',
    operationnelle: 'opérationnelle', operationnelles: 'opérationnelles',
    operation: 'opération', operations: 'opérations',
    operateur: 'opérateur', operateurs: 'opérateurs',
    operatrice: 'opératrice', operatrices: 'opératrices',
    hopital: 'hôpital', hopitaux: 'hôpitaux',
    etudiant: 'étudiant', etudiants: 'étudiants',
    etudiante: 'étudiante', etudiantes: 'étudiantes',
    etude: 'étude', etudes: 'études',
    prefecture: 'préfecture', prefectures: 'préfectures',
    materiel: 'matériel', materiels: 'matériels',
    materielle: 'matérielle', materielles: 'matérielles',
    materiau: 'matériau', materiaux: 'matériaux',
    general: 'général', generale: 'générale', generales: 'générales', generaux: 'généraux',
    cinema: 'cinéma', cinemas: 'cinémas',
    region: 'région', regions: 'régions',
    regional: 'régional', regionale: 'régionale',
    regionales: 'régionales', regionaux: 'régionaux',
    etat: 'état', etats: 'états',
    legal: 'légal', legale: 'légale', legales: 'légales', legaux: 'légaux',
    prevention: 'prévention',
    superieur: 'supérieur', superieurs: 'supérieurs',
    superieure: 'supérieure', superieures: 'supérieures',
    reseau: 'réseau', reseaux: 'réseaux',
    special: 'spécial', speciale: 'spéciale', speciales: 'spéciales', speciaux: 'spéciaux',
    specialise: 'spécialisé', specialisee: 'spécialisée',
    specialises: 'spécialisés', specialisees: 'spécialisées',
    interim: 'intérim', interimaire: 'intérimaire', interimaires: 'intérimaires',
    experience: 'expérience', experiences: 'expériences',
    responsabilite: 'responsabilité', responsabilites: 'responsabilités',
    accessibilite: 'accessibilité', mobilite: 'mobilité', conformite: 'conformité',
    strategie: 'stratégie', strategies: 'stratégies',
    strategique: 'stratégique', strategiques: 'stratégiques',
    metier: 'métier', metiers: 'métiers',
    societe: 'société', societes: 'sociétés',
    mediatheque: 'médiathèque', mediatheques: 'médiathèques',
    mediateur: 'médiateur', mediateurs: 'médiateurs',
    mediatrice: 'médiatrice', mediatrices: 'médiatrices', mediation: 'médiation',
    beneficiaire: 'bénéficiaire', beneficiaires: 'bénéficiaires',
    realisation: 'réalisation', realisations: 'réalisations',
    educateur: 'éducateur', educateurs: 'éducateurs',
    educatrice: 'éducatrice', educatrices: 'éducatrices', education: 'éducation',
    electricite: 'électricité',
    electricien: 'électricien', electriciens: 'électriciens',
    electricienne: 'électricienne', electriciennes: 'électriciennes',
    vehicule: 'véhicule', vehicules: 'véhicules',
    integration: 'intégration',
    integrateur: 'intégrateur', integrateurs: 'intégrateurs',
    aeronautique: 'aéronautique', aerien: 'aérien', aerienne: 'aérienne',
    etancheite: 'étanchéité',
    ministere: 'ministère', ministeres: 'ministères',
    armee: 'armée', armees: 'armées',
    reglementaire: 'réglementaire', reglementaires: 'réglementaires',
    reglementation: 'réglementation', reglementations: 'réglementations',
    reglement: 'règlement', reglements: 'règlements',
    confirme: 'confirmé', confirmee: 'confirmée',
    confirmes: 'confirmés', confirmees: 'confirmées',
    charge: 'chargé', chargee: 'chargée',
    ingenieur: 'ingénieur', ingenieurs: 'ingénieurs',
    ingenieure: 'ingénieure', ingenieures: 'ingénieures',
    equipe: 'équipe', equipes: 'équipes',
    ecole: 'école', ecoles: 'écoles',
    elu: 'élu', elus: 'élus', elue: 'élue', elues: 'élues',
    election: 'élection', elections: 'élections',
    economie: 'économie', economique: 'économique', economiques: 'économiques',
    decision: 'décision', decisions: 'décisions',
    dechet: 'déchet', dechets: 'déchets',
    previsionnel: 'prévisionnel', previsionnels: 'prévisionnels',
    previsionnelle: 'prévisionnelle', previsionnelles: 'prévisionnelles',
    regulation: 'régulation', sante: 'santé',
    donnee: 'donnée', donnees: 'données',
    systeme: 'système', systemes: 'systèmes',
    navigabilite: 'navigabilité',
    hotel: 'hôtel', hotels: 'hôtels',
    hotelier: 'hôtelier', hoteliere: 'hôtelière', hotellerie: 'hôtellerie',
    energie: 'énergie', energies: 'énergies',
    energetique: 'énergétique', energetiques: 'énergétiques',
    remuneration: 'rémunération', remunerations: 'rémunérations',
    departement: 'département', departements: 'départements',
    departemental: 'départemental', departementale: 'départementale',
    departementales: 'départementales', departementaux: 'départementaux',
    methode: 'méthode', methodes: 'méthodes',
    interet: 'intérêt', interets: 'intérêts',
    eleve: 'élève', eleves: 'élèves',
    elevage: 'élevage', elevages: 'élevages',
    evenement: 'événement', evenements: 'événements', evenementiel: 'événementiel',
    acces: 'accès',
    decideur: 'décideur', decideurs: 'décideurs',
    teletravail: 'télétravail', telephone: 'téléphone',
    teleconseiller: 'téléconseiller', teleconseillers: 'téléconseillers',
    teleconseillere: 'téléconseillère',
    telesurveillance: 'télésurveillance',
    teleoperateur: 'téléopérateur', teleoperatrice: 'téléopératrice',
    telepilote: 'télépilote',
    pediatrique: 'pédiatrique', pediatriques: 'pédiatriques', pediatrie: 'pédiatrie',
    reanimation: 'réanimation',
    cloture: 'clôture', foret: 'forêt', forets: 'forêts',
    depannage: 'dépannage', depanneur: 'dépanneur', depanneurs: 'dépanneurs',
    nucleaire: 'nucléaire', nucleaires: 'nucléaires',
    propriete: 'propriété', proprietes: 'propriétés',
    identite: 'identité', identites: 'identités',
    entite: 'entité', entites: 'entités',
    quantite: 'quantité', quantites: 'quantités',
    complementaire: 'complémentaire', complementaires: 'complémentaires',
    comptabilite: 'comptabilité',
    regisseur: 'régisseur', regisseuse: 'régisseuse', regie: 'régie',
    theatre: 'théâtre', theatres: 'théâtres',
    apres: 'après',
    employe: 'employé', employee: 'employée', employes: 'employés', employees: 'employées',
    delegue: 'délégué', deleguee: 'déléguée', delegues: 'délégués', deleguees: 'déléguées',
    attache: 'attaché', attachee: 'attachée', attaches: 'attachés', attachees: 'attachées',
  };
  const CSP_EMPLOYER_MAX = 90;
  const SKIP_FEM = /^(managers?|designers?|engineers?|developers?|leaders?|traders?|partners?|webmaster)$/i;

  /**
   * « Alternance : Alternance commercial » → « Alternance commercial ».
   * Adzuna répète souvent le type de contrat avant le vrai intitulé.
   */
  function dedupeTitlePrefix(s) {
    const re = /^(\s*)(alternance|apprentissage|stage|stagiaire|int[ée]rim|cdi|cdd|saisonnier)\s*[:：\-–—]\s*(?=\2\b)/i;
    if (!re.test(s)) return s;
    const out = s.replace(re, '$1');
    const letters = out.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length > 6 && letters === letters.toUpperCase()) return out;
    return out.replace(/^(cdi|cdd)\b/i, m => m.toUpperCase());
  }

  function applyInclusiveAccents(s) {
    return String(s)
      .replace(/\b([Cc])harge\((e)\)/g, '$1hargé($2)')
      .replace(/\b([Ee])mploye\((e)\)/g, '$1mployé($2)')
      .replace(/\b([Dd])elegue\((e)\)/g, '$1élégué($2)')
      .replace(/\b([Aa])ttache\((e)\)/g, '$1ttaché($2)');
  }

  /** Nettoyage typographique : casse, H/F unique, « Employé (e) » → « Employé(e) », accents et sigles manquants. */
  function typoTitle(t) {
    let s = dedupeTitlePrefix(String(t || '').replace(/\s+/g, ' ').trim());
    const marker = /\s*[(\[]?\s*\b(?:h\s*\/\s*f\s*\/\s*x|f\s*\/\s*h\s*\/\s*x|h\s*\/\s*f|f\s*\/\s*h|h\s*-\s*f|f\s*-\s*h)\b\s*[)\]]?/gi;
    const had = marker.test(s);
    s = s.replace(marker, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s*[-–,/]\s*$/, '').trim();
    const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length > 6 && letters === letters.toUpperCase()) {
      s = s.toLowerCase().replace(/[a-zà-ÿ0-9]+/g, w => (keptAcronym(w) ? w.toUpperCase() : w));
    } else {
      s = s.replace(/\b[A-ZÀ-Ÿ]{4,}\b/g, w => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()));
    }
    s = s.replace(/(\p{L})\s+\((e|ne|se|euse|ère|rice|trice)\)/gu, '$1($2)');
    s = applyInclusiveAccents(s);
    s = restoreAccents(s);
    if (had) s += ' (H/F)';
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** Sigle connu, ou 2 à 5 lettres sans voyelle typiques d'un titre tout en capitales (RHL, BPS, SSD, ICND). */
  function keptAcronym(w) {
    const up = String(w || '').toUpperCase();
    if (ACRONYMS.has(up)) return true;
    return /^[A-Z]{2,5}$/.test(up) && !/[AEIOUY]/.test(up);
  }

  function restoreAccents(s) {
    return String(s).replace(/(?<![\p{L}\p{N}_])([\p{L}]+)(?![\p{L}\p{N}_])/gu, (w, _m, offset, str) => {
      const key = foldKey(w);
      const fix = ACCENT_WORDS[key];
      if (!fix) return w;
      if (key === 'charge' || key === 'chargee') {
        const before = str.slice(Math.max(0, offset - 12), offset).toLowerCase();
        if (/\ben\s+$/.test(before)) return w;
      }
      return sameCap(w, fix);
    });
  }

  function sameCap(sample, word) {
    if (!word) return word;
    if (sample && sample === sample.toUpperCase() && sample.length > 1) return word.toUpperCase();
    if (/^\p{Lu}/u.test(sample || '')) return word.charAt(0).toUpperCase() + word.slice(1);
    return word.charAt(0).toLowerCase() + word.slice(1);
  }

  function feminineOf(masc, suffix) {
    const s = String(suffix || '').toLowerCase();
    if (SKIP_FEM.test(masc)) return '';
    if (s === 'e') {
      if (/é$/i.test(masc)) return masc + 'e';
      if (/eur$/i.test(masc)) return masc + 'e';
      if (/er$/i.test(masc)) return masc.slice(0, -2) + 'ère';
      return masc + 'e';
    }
    if (s === 'ère' && /er$/i.test(masc)) return masc.slice(0, -2) + 'ère';
    if ((s === 'se' || s === 'euse') && /eur$/i.test(masc)) return masc.slice(0, -3) + 'euse';
    if (s === 'trice' && /teur$/i.test(masc)) return masc.slice(0, -4) + 'trice';
    if (s === 'rice' && /eur$/i.test(masc)) return masc.slice(0, -3) + 'rice';
    if (s === 'ive' && /if$/i.test(masc)) return masc.slice(0, -2) + 'ive';
    if (s === 'ne') return masc + 'ne';
    return '';
  }

  // Suffixe court après une barre (« vendeur/euse »), pas un second mot (« Vendeur/Vendeuse »).
  const SLASH_SUF = 'iennes|ienne|euses|euse|trices|trice|ières|ière|ieres|iere|ères|ère|eres|ere|rices|rice|ives|ive|ses|se|nes|ne|es|e';
  const BARE_SUF = new RegExp('^(?:' + SLASH_SUF + ')$', 'i');
  const STEM_ACCENT = { charge: 'chargé', employe: 'employé', delegue: 'délégué', attache: 'attaché' };

  function canonicalSuffix(suf) {
    const s = String(suf || '').toLowerCase();
    const bare = s.normalize('NFD').replace(/\p{M}/gu, '');
    if (bare === 'iere' || bare === 'ere') return 'ère';
    if (bare === 'ieres' || bare === 'eres') return 'ères';
    return s;
  }

  function accentStem(masc) {
    const bare = masc.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const fix = STEM_ACCENT[bare];
    return fix ? sameCap(masc, fix) : masc;
  }

  /** Féminin d'un suffixe abrégé. Chaîne vide si la forme n'est pas sûre : on n'invente pas le mot. */
  function feminineSlash(masc, suf) {
    const s = canonicalSuffix(suf);
    if (s === 'ienne') return /ien$/i.test(masc) ? masc.slice(0, -3) + 'ienne' : '';
    if (s === 'ne') return /(ien|on)$/i.test(masc) ? masc + 'ne' : '';
    return feminineOf(masc, s);
  }

  function expandSlashPair(masc, sufRaw) {
    let suf = canonicalSuffix(sufRaw);
    let stem = masc;
    let plural = false;
    if (/s$/i.test(suf) && /s$/i.test(stem) && stem.length > 2 && suf.length > 1) {
      plural = true;
      stem = stem.slice(0, -1);
      suf = canonicalSuffix(suf.slice(0, -1));
    }
    stem = accentStem(stem);
    const fem = feminineSlash(stem, suf);
    if (!fem) return '';
    const mascOut = plural ? stem + 's' : stem;
    const femOut = plural ? fem + 's' : fem;
    return mascOut + ' / ' + sameCap(mascOut, femOut);
  }

  function expandInclusive(s) {
    let out = String(s);
    out = out.replace(/(\p{L}[\p{L}'’.-]*)\((e|ne|se|euse|ère|rice|trice|ive)\)/gu, (all, masc, suf) => {
      const fem = feminineOf(masc, suf);
      if (!fem) return all;
      return masc + ' / ' + sameCap(masc, fem);
    });
    out = out.replace(new RegExp('(\\p{L}[\\p{L}\'’.-]*)\\s*\\/\\s*(' + SLASH_SUF + ')\\b', 'giu'), (all, masc, suf) => expandSlashPair(masc, suf) || all);
    out = out.replace(/\b(\p{L}*t)eurs?\/trices?\b/giu, (all, stem) => {
      const masc = all.split('/')[0];
      const plural = /s$/i.test(masc);
      const fem = stem + 'rice' + (plural ? 's' : '');
      return masc + ' / ' + sameCap(masc, fem);
    });
    // Barre collée (« Pharmacie/Parapharmacie ») ou espace d'un seul côté (« Vendeur/ Vendeuse »).
    // On ne réécrit pas une barre déjà entourée d'espaces : sinon « Préparatrice/vendeur »
    // qui suit « Préparateur / » resterait collé. Un suffixe non développé (« Foo/euse ») reste source.
    const spaceSlash = (all, a, b) => (BARE_SUF.test(b) ? all : a + ' / ' + b);
    out = out.replace(/(\p{L}{2,})\/(\p{L}{2,})/gu, spaceSlash);
    out = out.replace(/(\p{L}{2,})\/\s+(\p{L}{2,})/gu, spaceSlash);
    out = out.replace(/(\p{L}{2,})\s+\/(\p{L}{2,})/gu, spaceSlash);
    return out.replace(/\s+/g, ' ').trim();
  }

  const DOTTED_SUF = 'euses|euse|trices|trice|rices|rice|ières|ière|ieres|iere|ères|ère|eres|ere|iennes|ienne|ives|ive|ses|se|nes|ne|fes|fe|es|e';
  const DOTTED_RE = new RegExp('(?<![.\\p{L}])(\\p{L}{4,})\\.(' + DOTTED_SUF + ')(?![.\\p{L}])', 'giu');
  const SHORT_ABBR = /^(st|dr|pr|me|mr|vol|doc|fig|art|cf|nb|bd|av|ste|resp|tel|fax|apt|rte|www|http|https|sa|sas|sarl)$/i;

  /** « .e » seul est trop court pour être une forme inclusive sûre (abréviation, sigle). */
  function plainEStem(stem) {
    const low = stem.toLowerCase();
    if (low.length < 5) return false;
    if (/e$/i.test(low)) return false;
    if (stem.length <= 5 && stem === stem.toUpperCase()) return false;
    if (ACRONYMS.has(stem.toUpperCase()) || SHORT_ABBR.test(stem)) return false;
    if (/\d/.test(stem)) return false;
    return true;
  }

  function suffixFitsStem(stem, sufBare) {
    const low = String(stem || '').toLowerCase();
    const suf = String(sufBare || '').toLowerCase();
    if (!low || !suf) return false;
    if (suf === 'euse' || suf === 'se') return /eur$/.test(low);
    if (suf === 'trice') return /teur$/.test(low);
    if (suf === 'rice') return /eur$/.test(low);
    if (suf === 'iere' || suf === 'ere') return /er$/.test(low);
    if (suf === 'ienne') return /ien$/.test(low);
    if (suf === 'ive') return /if$/.test(low);
    if (suf === 'ne') return /(ien|on)$/.test(low);
    if (suf === 'fe') return low === 'chef';
    if (suf === 'e') return plainEStem(stem);
    return false;
  }

  /** Vrai seulement si le suffixe après le point est une finale inclusive de ce radical. */
  function dottedInclusiveOk(stem, sufRaw) {
    if (!stem || stem.length < 4) return false;
    if (ACRONYMS.has(stem.toUpperCase()) || SHORT_ABBR.test(stem) || /\d/.test(stem)) return false;
    const bare = String(sufRaw || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (suffixFitsStem(stem, bare)) return true;
    if (bare.endsWith('s') && suffixFitsStem(stem, bare.slice(0, -1))) return true;
    if (stem.length > 4 && /s$/i.test(stem) && bare.endsWith('s') && suffixFitsStem(stem.slice(0, -1), bare.slice(0, -1))) return true;
    return false;
  }

  /**
   * « Apprenti.e », « Serveur.se », « Boulanger.ère » → radical masculin.
   * Uniquement quand l'intitulé porte déjà (H/F) : sans ce marqueur, le mot reste tel quel.
   */
  function collapseDottedInclusive(s) {
    return String(s).replace(DOTTED_RE, (all, stem, suf) => (dottedInclusiveOk(stem, suf) ? stem : all));
  }

  function foldKey(w) {
    return String(w || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  }

  /** « Serveur, Serveuse » est un doublet de genre, pas une énumération. */
  function isFemininePair(masc, fem) {
    let m = foldKey(masc);
    let f = foldKey(fem);
    if (m.length < 4 || f.length < 4 || m === f) return false;
    if (ACRONYMS.has(String(masc).toUpperCase()) || ACRONYMS.has(String(fem).toUpperCase())) return false;
    if (/s$/.test(m) && /s$/.test(f) && m.length > 4 && f.length > 4) {
      m = m.slice(0, -1);
      f = f.slice(0, -1);
    }
    const cands = new Set();
    if (/eur$/.test(m)) {
      cands.add(m.slice(0, -3) + 'euse');
      cands.add(m + 'e');
      if (/teur$/.test(m)) cands.add(m.slice(0, -4) + 'trice');
      cands.add(m.slice(0, -3) + 'rice');
    }
    if (/er$/.test(m)) cands.add(m.slice(0, -2) + 'ere');
    if (/ien$/.test(m)) cands.add(m.slice(0, -3) + 'ienne');
    if (/on$/.test(m)) cands.add(m + 'ne');
    if (/if$/.test(m)) cands.add(m.slice(0, -2) + 'ive');
    if (m === 'chef') cands.add('cheffe');
    if (/[^e]$/.test(m) && m.length >= 5) cands.add(m + 'e');
    return cands.has(f);
  }

  function foldGenderComma(s) {
    return String(s).replace(/(\p{L}{4,})\s*,\s*(\p{L}{4,})/gu, (all, a, b) => {
      if (!isFemininePair(a, b)) return all;
      const fem = b.charAt(0).toLowerCase() + b.slice(1).toLowerCase();
      return a + ' / ' + sameCap(a, fem);
    });
  }

  /**
   * Pas d'espace avant , . ; : ), une seule espace, une espace après , ; : entre des mots.
   * On ne touche ni aux décimales (« 2.5 », « 1,5 »), ni aux sigles (« S.A. », « B.T.S »),
   * ni aux domaines (« site.fr »).
   */
  function fixTitlePunctuation(s) {
    let out = String(s).replace(/[ \t\u00a0\u202f]+([,.;:)])/g, '$1');
    out = out.replace(/([,;:])(?=\p{L})/gu, '$1 ');
    return out.replace(/[ \t\u00a0\u202f]{2,}/g, ' ').trim();
  }

  function displayTitle(t) {
    const s = typoTitle(t);
    if (!s) return s;
    let out = fixTitlePunctuation(s);
    if (/\(H\/F\)/.test(out)) {
      out = collapseDottedInclusive(out);
      out = foldGenderComma(out);
    }
    return expandInclusive(out);
  }

  const CONTRACT_UNIT = {
    jour: ['jour', 'jours'], jours: ['jour', 'jours'],
    mois: ['mois', 'mois'],
    an: ['an', 'ans'], ans: ['an', 'ans'],
    année: ['année', 'années'], années: ['année', 'années'],
    annee: ['année', 'années'], annees: ['année', 'années'],
    semaine: ['semaine', 'semaines'], semaines: ['semaine', 'semaines'],
    heure: ['heure', 'heures'], heures: ['heure', 'heures'],
    minute: ['minute', 'minutes'], minutes: ['minute', 'minutes'],
  };

  /**
   * « Intérim - 3 Jour(s) » → « Intérim · 3 jours », « CDD - 6 Mois » → « CDD · 6 mois ».
   * Un libellé qui n'est pas « [type -] nombre unité » repart tel quel.
   */
  function displayContract(value) {
    const raw = value == null ? '' : String(value);
    const s = raw.replace(/[\u00a0\u202f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!s) return '';
    const m = s.match(/^(?:(.+?)\s+[-–—‑]\s+)?(\d+(?:[.,]\d+)?)\s+(années|annees|année|annee|semaines|semaine|heures|heure|minutes|minute|jours|jour|mois|ans|an)(?:\(s\))?\s*$/i);
    if (!m) return raw.trim();
    const n = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(n)) return raw.trim();
    const forms = CONTRACT_UNIT[m[3].toLowerCase()];
    if (!forms) return raw.trim();
    const qty = Number.isInteger(n) ? String(n) : m[2].replace('.', ',');
    const duration = qty + ' ' + forms[n === 1 ? 0 : 1];
    const prefix = (m[1] || '').trim();
    return prefix ? prefix + ' · ' + duration : duration;
  }

  /**
   * Nom d'employeur coupé à 90 caractères : on s'arrête au dernier mot complet et on ajoute une ellipse.
   * On n'invente jamais la fin du mot (pas « Départemental » à partir de « Départementa »).
   */
  function displayCompany(name) {
    const s = String(name || '').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    if (/[…]$/.test(s) || /\.{3}$/.test(s)) return s.replace(/\.{3}$/, '…');
    if (s.length < CSP_EMPLOYER_MAX) return s;
    const cut = s.slice(0, CSP_EMPLOYER_MAX);
    const atWord = cut.replace(/[\s/·,;:.\-–—]+[^\s/·]*$/, '').replace(/[\s/·,;:.\-–—]+$/, '');
    const base = atWord.length >= 12 ? atWord : cut.replace(/[\s/·,;:.\-–—]+$/, '');
    return (base || cut) + '…';
  }

  /**
   * Slug de recherche libre → libellé affiché.
   * Les sigles restent en capitales (« cdd », « CDD », « Cdd » → « CDD »)
   * et les accents connus sont rétablis (« interim », « intérim » → « Intérim »).
   * Chaîne vide si le mot n’est pas dans la table : l’appelant capitalise alors sans inventer.
   */
  const SEARCH_LABELS = {
    etudiant: 'Étudiant',
    teletravail: 'Télétravail',
    developpement: 'Développement',
    cdi: 'CDI',
    cdd: 'CDD',
    interim: 'Intérim',
    'cdi-interimaire': 'CDI intérimaire',
    independant: 'Indépendant',
    saisonnier: 'Saisonnier',
    alternance: 'Alternance',
    stage: 'Stage',
    apprentissage: 'Apprentissage',
    'temps-partiel': 'Temps partiel',
    freelance: 'Freelance',
    'contrat-pro': 'Contrat pro',
    'contrat-de-professionnalisation': 'Contrat de professionnalisation',
    franchise: 'Franchise',
    'contrat-chantier': 'Contrat chantier',
    'reprise-d-entreprise': 'Reprise d’entreprise',
  };
  function searchSlug(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function searchKeywordLabel(value) {
    return SEARCH_LABELS[searchSlug(value)] || '';
  }

  globalThis.TP_DISPLAY = { typoTitle, displayTitle, displayContract, displayCompany, dedupeTitlePrefix, searchKeywordLabel, CSP_EMPLOYER_MAX };
})();
