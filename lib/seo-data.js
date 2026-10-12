/**
 * Pages d'atterrissage SEO : métiers × lieux « curés » (indexables).
 * Toute autre combinaison /offres/:metier/:lieu reste accessible mais en noindex (recherche libre).
 * Les textes métiers sont volontairement courts et factuels : ils complètent les chiffres calculés
 * à partir des offres réelles (contrats, salaires affichés, employeurs), jamais l'inverse.
 */
import '../public/assets/geo-fr.js';
const GEO = globalThis.TP_GEO;

// tier 1 : tous les lieux ; tier 2 : France, régions et grandes villes (TOP_CITIES)
export const JOBS = [
  { slug: 'emploi', label: 'Emploi', q: '', tier: 1, family: 'all', blurb: '' },
  { slug: 'commercial', label: 'Commercial / Commerciale', q: 'commercial', tier: 1, family: 'vente', blurb: 'Les postes commerciaux combinent souvent un fixe et une part variable (commissions, primes sur objectifs) ; le permis B est fréquemment demandé pour les fonctions terrain.' },
  { slug: 'vendeur', label: 'Vendeur / Vendeuse', q: 'vendeur', tier: 1, family: 'vente', blurb: 'La vente en magasin recrute beaucoup en CDI à temps partiel et en CDD saisonniers (soldes, fêtes) ; le travail le samedi est la norme.' },
  { slug: 'caissier', label: 'Caissier / Caissière', q: 'caissier', tier: 2, family: 'vente', blurb: 'Les postes d’hôte ou hôtesse de caisse sont souvent à temps partiel, avec des horaires décalés et du travail le week-end ; ils sont accessibles sans diplôme.' },
  { slug: 'serveur', label: 'Serveur / Serveuse', q: 'serveur', tier: 1, family: 'restauration', blurb: 'La restauration recrute toute l’année, avec des pics avant l’été ; le service du soir et du week-end est fréquent, et de nombreux postes sont ouverts aux débutants.' },
  { slug: 'cuisinier', label: 'Cuisinier / Cuisinière', q: 'cuisinier', tier: 1, family: 'restauration', blurb: 'Les offres vont du commis au chef de partie : un CAP cuisine est souvent apprécié, l’expérience compte autant que le diplôme, et la restauration collective offre des horaires de journée.' },
  { slug: 'boulanger', label: 'Boulanger / Boulangère', q: 'boulanger', tier: 2, family: 'restauration', blurb: 'Le métier s’exerce en horaires très matinaux, en artisanat comme en grande distribution ; le CAP boulanger est la voie d’accès la plus courante, y compris en alternance.' },
  { slug: 'infirmier', label: 'Infirmier / Infirmière', q: 'infirmier', tier: 1, family: 'sante', blurb: 'Le diplôme d’État infirmier est obligatoire ; les établissements de santé et les EHPAD proposent surtout des CDI, avec des horaires en 12 h ou en roulement jour/nuit.' },
  { slug: 'aide-soignant', label: 'Aide-soignant / Aide-soignante', q: 'aide soignant', tier: 1, family: 'sante', blurb: 'Le diplôme d’État d’aide-soignant (DEAS) est requis ; les besoins sont forts en EHPAD, à l’hôpital et dans les services de soins à domicile.' },
  { slug: 'auxiliaire-de-vie', label: 'Auxiliaire de vie', q: 'auxiliaire de vie', tier: 1, family: 'sante', blurb: 'L’accompagnement de personnes âgées ou en situation de handicap se fait surtout à domicile : temps partiel fréquent, déplacements entre bénéficiaires, permis souvent apprécié.' },
  { slug: 'secretaire-medical', label: 'Secrétaire médical / médicale', q: 'secrétaire médicale', tier: 2, family: 'sante', blurb: 'Accueil des patients, prise de rendez-vous et gestion des dossiers : les cabinets, cliniques et centres de santé recrutent, souvent avec une formation de niveau bac.' },
  { slug: 'educateur', label: 'Éducateur / Éducatrice', q: 'éducateur', tier: 2, family: 'social', blurb: 'Éducateur spécialisé, de jeunes enfants ou moniteur-éducateur : chaque métier a son diplôme d’État ; les associations et foyers recrutent principalement en CDI.' },
  { slug: 'enseignant', label: 'Enseignant / Enseignante', q: 'enseignant', tier: 2, family: 'social', blurb: 'En dehors des concours de l’Éducation nationale, les offres concernent l’enseignement privé, la formation pour adultes et les remplacements en contrat.' },
  { slug: 'agent-d-entretien', label: 'Agent / Agente d’entretien', q: 'agent entretien', tier: 1, family: 'services', blurb: 'Le nettoyage de bureaux et de locaux recrute en continu, souvent à temps partiel et en horaires décalés (tôt le matin ou en soirée) ; aucun diplôme n’est généralement exigé.' },
  { slug: 'agent-de-securite', label: 'Agent / Agente de sécurité', q: 'agent de sécurité', tier: 2, family: 'services', blurb: 'La carte professionnelle délivrée par le CNAPS est obligatoire (formation APS) ; le travail de nuit et le week-end est courant, notamment en événementiel et en magasin.' },
  { slug: 'coiffeur', label: 'Coiffeur / Coiffeuse', q: 'coiffeur', tier: 2, family: 'services', blurb: 'Le CAP ou le BP coiffure ouvrent la plupart des postes en salon ; l’alternance est une voie d’entrée très répandue.' },
  { slug: 'chauffeur', label: 'Chauffeur / Chauffeuse', q: 'chauffeur', tier: 1, family: 'logistique', blurb: 'Chauffeur-livreur (permis B), poids lourd (C, CE avec FIMO) ou transport de voyageurs (D) : le permis demandé détermine le type de poste et la rémunération.' },
  { slug: 'cariste', label: 'Cariste', q: 'cariste', tier: 1, family: 'logistique', blurb: 'Le CACES R489 (catégories 1, 3 ou 5 selon les chariots) est presque toujours exigé ; l’intérim est très présent dans les entrepôts, souvent en équipes alternées.' },
  { slug: 'preparateur-de-commandes', label: 'Préparateur / Préparatrice de commandes', q: 'préparateur de commandes', tier: 1, family: 'logistique', blurb: 'Les entrepôts recrutent beaucoup en intérim et en CDD, avec des pics en fin d’année ; le poste est accessible sans diplôme, le CACES est un plus.' },
  { slug: 'magasinier', label: 'Magasinier / Magasinière', q: 'magasinier', tier: 2, family: 'logistique', blurb: 'Réception, stockage et suivi des stocks : le poste demande de la rigueur et souvent un CACES ; on le trouve en industrie, en logistique et dans la distribution.' },
  { slug: 'logistique', label: 'Logistique', q: 'logistique', tier: 1, family: 'logistique', blurb: 'La logistique couvre les postes d’entrepôt (préparation, cariste, quai) comme l’encadrement et la gestion des flux ; l’intérim y est un mode de recrutement courant.' },
  { slug: 'electricien', label: 'Électricien / Électricienne', q: 'électricien', tier: 1, family: 'btp', blurb: 'Bâtiment, industrie ou maintenance : les habilitations électriques (B1V, BR…) sont demandées, et les entreprises recrutent des débutants formés par l’alternance.' },
  { slug: 'plombier', label: 'Plombier / Plombière', q: 'plombier', tier: 2, family: 'btp', blurb: 'Les besoins sont réguliers en installation comme en dépannage ; un CAP ou un BP est la voie d’accès habituelle, et le permis B est souvent nécessaire.' },
  { slug: 'macon', label: 'Maçon / Maçonne', q: 'maçon', tier: 2, family: 'btp', blurb: 'Le gros œuvre recrute en CDI, en CDD de chantier et en intérim ; les entreprises valorisent l’expérience et forment volontiers des apprentis.' },
  { slug: 'btp', label: 'BTP', q: 'btp', tier: 1, family: 'btp', blurb: 'Le bâtiment et les travaux publics regroupent des métiers de chantier (maçon, coffreur, conducteur d’engins) et d’encadrement ; l’intérim y est très répandu.' },
  { slug: 'mecanicien', label: 'Mécanicien / Mécanicienne', q: 'mécanicien', tier: 1, family: 'industrie', blurb: 'Mécanique automobile, poids lourd ou industrielle : un CAP ou un bac pro est généralement demandé, et les garages recrutent aussi en alternance.' },
  { slug: 'technicien-de-maintenance', label: 'Technicien / Technicienne de maintenance', q: 'technicien de maintenance', tier: 1, family: 'industrie', blurb: 'La maintenance industrielle recherche surtout des profils bac+2 (BTS MS, DUT GIM) ; les astreintes et le travail en équipes sont fréquents.' },
  { slug: 'ingenieur', label: 'Ingénieur / Ingénieure', q: 'ingénieur', tier: 2, family: 'industrie', blurb: 'Les offres couvrent l’industrie, le BTP, l’informatique et le conseil ; le CDI cadre est la norme, et l’anglais est souvent demandé.' },
  { slug: 'developpeur', label: 'Développeur / Développeuse', q: 'développeur', tier: 1, family: 'tech', blurb: 'Les offres précisent en général la pile technique (JavaScript, Java, PHP, Python…) ; le CDI domine, et le télétravail partiel est souvent mentionné.' },
  { slug: 'comptable', label: 'Comptable', q: 'comptable', tier: 1, family: 'bureau', blurb: 'Cabinets d’expertise comptable et services financiers d’entreprise recrutent du BTS au master ; la maîtrise d’un logiciel comptable est souvent demandée.' },
  { slug: 'assistant-administratif', label: 'Assistant / Assistante administrative', q: 'assistant administratif', tier: 1, family: 'bureau', blurb: 'Accueil, courrier, suivi de dossiers et facturation : le poste existe dans tous les secteurs, avec une demande fréquente de maîtrise des outils bureautiques.' },
  { slug: 'marketing', label: 'Marketing', q: 'marketing', tier: 2, family: 'bureau', blurb: 'Les offres marketing vont de l’assistanat au poste de chef de produit ; le marketing digital (réseaux sociaux, référencement, acquisition) représente une large part des recrutements.' },
];

// [slug, nom, préposition + nom, département, latitude, longitude]
const CITY_ROWS = [
  ['paris', 'Paris', 'à Paris', '75', 48.857, 2.352], ['marseille', 'Marseille', 'à Marseille', '13', 43.296, 5.370],
  ['lyon', 'Lyon', 'à Lyon', '69', 45.764, 4.836], ['toulouse', 'Toulouse', 'à Toulouse', '31', 43.605, 1.444],
  ['nice', 'Nice', 'à Nice', '06', 43.710, 7.262], ['nantes', 'Nantes', 'à Nantes', '44', 47.218, -1.554],
  ['montpellier', 'Montpellier', 'à Montpellier', '34', 43.611, 3.877], ['strasbourg', 'Strasbourg', 'à Strasbourg', '67', 48.573, 7.752],
  ['bordeaux', 'Bordeaux', 'à Bordeaux', '33', 44.838, -0.579], ['lille', 'Lille', 'à Lille', '59', 50.629, 3.057],
  ['rennes', 'Rennes', 'à Rennes', '35', 48.117, -1.678], ['reims', 'Reims', 'à Reims', '51', 49.258, 4.032],
  ['toulon', 'Toulon', 'à Toulon', '83', 43.124, 5.928], ['grenoble', 'Grenoble', 'à Grenoble', '38', 45.188, 5.725],
  ['dijon', 'Dijon', 'à Dijon', '21', 47.322, 5.041], ['angers', 'Angers', 'à Angers', '49', 47.478, -0.563],
  ['nimes', 'Nîmes', 'à Nîmes', '30', 43.837, 4.360], ['clermont-ferrand', 'Clermont-Ferrand', 'à Clermont-Ferrand', '63', 45.778, 3.087],
  ['le-havre', 'Le Havre', 'au Havre', '76', 49.494, 0.108], ['saint-etienne', 'Saint-Étienne', 'à Saint-Étienne', '42', 45.440, 4.387],
  ['tours', 'Tours', 'à Tours', '37', 47.394, 0.685], ['rouen', 'Rouen', 'à Rouen', '76', 49.443, 1.099],
  ['orleans', 'Orléans', 'à Orléans', '45', 47.903, 1.909], ['caen', 'Caen', 'à Caen', '14', 49.183, -0.371],
  ['metz', 'Metz', 'à Metz', '57', 49.120, 6.176],
];
export const TOP_CITIES = ['paris', 'marseille', 'lyon', 'toulouse', 'nice', 'nantes', 'montpellier', 'strasbourg', 'bordeaux', 'lille'];
const DEP_IN = { '92': 'dans les Hauts-de-Seine', '93': 'en Seine-Saint-Denis', '94': 'dans le Val-de-Marne', '95': 'dans le Val-d’Oise', '78': 'dans les Yvelines', '91': 'en Essonne', '77': 'en Seine-et-Marne', '59': 'dans le Nord', '13': 'dans les Bouches-du-Rhône', '69': 'dans le Rhône', '33': 'en Gironde', '31': 'en Haute-Garonne', '44': 'en Loire-Atlantique' };
const REG_IN = { '11': 'en Île-de-France', '24': 'en Centre-Val de Loire', '27': 'en Bourgogne-Franche-Comté', '28': 'en Normandie', '32': 'dans les Hauts-de-France', '44': 'dans le Grand Est', '52': 'dans les Pays de la Loire', '53': 'en Bretagne', '75': 'en Nouvelle-Aquitaine', '76': 'en Occitanie', '84': 'en Auvergne-Rhône-Alpes', '93': 'en Provence-Alpes-Côte d’Azur', '94': 'en Corse' };

export const slugify = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const depName = c => GEO.depByCode(c).label;
const regOfDep = c => GEO.DEPARTEMENTS.find(d => d[0] === c)[2];

export const PLACES = [
  ...CITY_ROWS.map(([slug, name, inside, dep, lat, lon]) => ({ slug, type: 'commune', name, in: inside, dep, reg: regOfDep(dep), lat, lon, top: TOP_CITIES.includes(slug) })),
  ...Object.entries(DEP_IN).map(([code, inside]) => ({ slug: slugify(depName(code)), type: 'departement', name: depName(code), in: inside, code, dep: code, reg: regOfDep(code) })),
  ...Object.entries(REG_IN).map(([code, inside]) => ({ slug: slugify(GEO.regByCode(code).label), type: 'region', name: GEO.regByCode(code).label, in: inside, code, reg: code })),
];
export const JOB_BY_SLUG = new Map(JOBS.map(j => [j.slug, j]));
export const PLACE_BY_SLUG = new Map(PLACES.map(p => [p.slug, p]));

/** Une combinaison est « curée » (indexable, dans le sitemap) selon le palier du métier. */
export function isCurated(job, place) {
  if (!job) return false;
  if (!place) return true;
  if (job.tier === 1) return true;
  return place.type === 'region' || (place.type === 'commune' && place.top);
}

// Régions limitrophes (métropole)
const REGION_NEIGHBOURS = { '11': ['24', '28', '32', '44', '27'], '24': ['11', '28', '52', '75', '84', '27'], '27': ['44', '11', '24', '84'], '28': ['32', '11', '24', '52', '53'], '32': ['28', '11', '44'], '44': ['32', '11', '27'], '52': ['53', '28', '24', '75'], '53': ['52', '28'], '75': ['52', '24', '84', '76'], '76': ['75', '84', '93'], '84': ['27', '24', '75', '76', '93'], '93': ['84', '76', '94'], '94': ['93', '76'] };
const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));

/** Lieux voisins pour le maillage interne : département et région parents, villes proches, sous-lieux. */
export function nearbyPlaces(place, job) {
  if (!place) return PLACES.filter(p => p.type === 'region' && p.reg !== '94').slice(0, 13);
  const out = [];
  const cities = PLACES.filter(p => p.type === 'commune');
  if (place.type === 'commune') {
    out.push(...PLACES.filter(p => p.type === 'departement' && p.code === place.dep));
    out.push(...PLACES.filter(p => p.type === 'region' && p.code === place.reg));
    out.push(...cities.filter(c => c !== place).sort((a, b) => dist(place, a) - dist(place, b)).slice(0, 5));
  } else if (place.type === 'departement') {
    out.push(...PLACES.filter(p => p.type === 'region' && p.code === place.reg));
    out.push(...cities.filter(c => c.dep === place.code));
    out.push(...PLACES.filter(p => p.type === 'departement' && p !== place && p.reg === place.reg));
  } else {
    out.push(...cities.filter(c => c.reg === place.code));
    out.push(...PLACES.filter(p => p.type === 'departement' && p.reg === place.code));
    out.push(...(REGION_NEIGHBOURS[place.code] || []).map(c => PLACES.find(p => p.type === 'region' && p.code === c)));
  }
  return [...new Set(out)].filter(p => isCurated(job, p)).slice(0, 10);
}

/** Métiers proches : même famille d'abord, puis les métiers les plus recherchés. */
export function relatedJobs(job, place) {
  const pool = JOBS.filter(j => j !== job && j.slug !== 'emploi' && isCurated(j, place));
  const same = pool.filter(j => j.family === job?.family);
  const others = pool.filter(j => j.family !== job?.family);
  return [...same, ...others].slice(0, 10);
}

export function curatedPaths() {
  const out = [];
  for (const j of JOBS) {
    out.push(`/offres/${j.slug}`);
    for (const p of PLACES) if (isCurated(j, p)) out.push(`/offres/${j.slug}/${p.slug}`);
  }
  return out;
}
