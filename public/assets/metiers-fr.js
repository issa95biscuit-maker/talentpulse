/*
 * TalentPulse — intitulés de métiers courants (suggestions instantanées, repli hors ligne).
 * Complétés côté serveur par le référentiel des appellations ROME de France Travail (/api/suggest).
 * Fichier partagé navigateur (<script>) + fonctions API (ESM) : expose globalThis.TP_METIERS.
 */
globalThis.TP_METIERS = [
  // Commerce, vente
  'Vendeur / Vendeuse', 'Vendeur en prêt-à-porter', 'Conseiller de vente', 'Caissier / Caissière', 'Employé libre-service', 'Employé de commerce',
  'Responsable de magasin', 'Manager de rayon', 'Commercial / Commerciale', 'Commercial B2B', 'Commercial terrain', 'Business developer',
  'Technico-commercial', 'Attaché commercial', 'Chargé de clientèle', 'Conseiller clientèle', 'Téléconseiller', 'Chargé de relation client',
  'Agent immobilier', 'Négociateur immobilier', 'Conseiller bancaire', 'Conseiller en assurance', 'Merchandiser', 'Acheteur',
  // Hôtellerie, restauration, tourisme
  'Serveur / Serveuse', 'Chef de rang', 'Barman / Barmaid', 'Barista', 'Cuisinier / Cuisinière', 'Commis de cuisine', 'Chef de cuisine',
  'Second de cuisine', 'Plongeur', 'Employé polyvalent de restauration', 'Équipier polyvalent', 'Pizzaïolo', 'Boulanger / Boulangère',
  'Pâtissier / Pâtissière', 'Boucher / Bouchère', 'Réceptionniste', 'Réceptionniste en hôtellerie', 'Femme / Valet de chambre', 'Gouvernant(e) d’hôtel',
  'Agent d’accueil', 'Animateur / Animatrice', 'Conseiller en voyages', 'Hôte / Hôtesse d’accueil',
  // Santé, social, services à la personne
  'Infirmier / Infirmière', 'Aide-soignant / Aide-soignante', 'Auxiliaire de puériculture', 'Agent de service hospitalier (ASH)', 'Médecin généraliste',
  'Kinésithérapeute', 'Pharmacien', 'Préparateur en pharmacie', 'Sage-femme', 'Ergothérapeute', 'Psychologue', 'Orthophoniste', 'Manipulateur en radiologie',
  'Secrétaire médical(e)', 'Assistant dentaire', 'Ambulancier', 'Auxiliaire de vie', 'Aide à domicile', 'Accompagnant éducatif et social (AES)',
  'Éducateur spécialisé', 'Moniteur éducateur', 'Assistant de service social', 'Assistante maternelle', 'Garde d’enfants', 'Agent d’entretien',
  'Agent de propreté', 'Employé de ménage',
  // Éducation, formation
  'Professeur des écoles', 'Enseignant', 'Professeur de mathématiques', 'Formateur / Formatrice', 'Animateur périscolaire', 'ATSEM',
  'Accompagnant d’élèves en situation de handicap (AESH)', 'Surveillant / Assistant d’éducation', 'Éducateur de jeunes enfants', 'Auxiliaire de crèche',
  // Logistique, transport
  'Préparateur de commandes', 'Cariste', 'Magasinier', 'Manutentionnaire', 'Agent logistique', 'Responsable logistique', 'Gestionnaire de stock',
  'Chauffeur livreur', 'Chauffeur poids lourd', 'Chauffeur super poids lourd', 'Conducteur de bus', 'Chauffeur VTC', 'Livreur à vélo', 'Coursier',
  'Agent de quai', 'Déménageur', 'Affréteur', 'Agent d’exploitation transport', 'Conducteur de train',
  // BTP, industrie, artisanat
  'Maçon / Maçonne', 'Électricien / Électricienne', 'Plombier / Plombière', 'Chauffagiste', 'Peintre en bâtiment', 'Plaquiste', 'Carreleur',
  'Menuisier', 'Charpentier', 'Couvreur', 'Conducteur de travaux', 'Chef de chantier', 'Manœuvre BTP', 'Ouvrier polyvalent du bâtiment',
  'Grutier', 'Conducteur d’engins', 'Technicien de maintenance', 'Technicien de maintenance industrielle', 'Mécanicien automobile', 'Carrossier',
  'Soudeur / Soudeuse', 'Chaudronnier', 'Tourneur-fraiseur', 'Opérateur de production', 'Agent de production', 'Conducteur de ligne',
  'Régleur', 'Technicien qualité', 'Ingénieur qualité', 'Ingénieur méthodes', 'Ingénieur production', 'Dessinateur projeteur', 'Frigoriste',
  'Jardinier paysagiste', 'Agent d’entretien des espaces verts', 'Ouvrier agricole', 'Viticulteur',
  // Informatique, numérique
  'Développeur / Développeuse', 'Développeur web', 'Développeur full-stack', 'Développeur front-end', 'Développeur back-end', 'Développeur Java',
  'Développeur Python', 'Développeur PHP', 'Développeur JavaScript', 'Développeur mobile', 'Développeur .NET', 'Ingénieur logiciel',
  'DevOps', 'Administrateur systèmes et réseaux', 'Technicien support informatique', 'Technicien helpdesk', 'Ingénieur cybersécurité',
  'Analyste SOC', 'Architecte cloud', 'Data analyst', 'Data scientist', 'Data engineer', 'Chef de projet informatique', 'Product owner',
  'Product manager', 'Scrum master', 'UX designer', 'UI designer', 'Webdesigner', 'Intégrateur web', 'Testeur QA', 'Consultant SAP',
  'Consultant fonctionnel', 'Administrateur base de données',
  // Marketing, communication, création
  'Chargé de communication', 'Chargé de marketing', 'Chef de projet marketing digital', 'Community manager', 'Responsable marketing',
  'Traffic manager', 'Chargé SEO', 'Content manager', 'Rédacteur web', 'Graphiste', 'Motion designer', 'Photographe', 'Vidéaste',
  'Attaché de presse', 'Chef de produit',
  // Gestion, administration, finance, RH, juridique
  'Assistant administratif', 'Assistant de direction', 'Secrétaire', 'Agent administratif', 'Gestionnaire administratif', 'Office manager',
  'Comptable', 'Assistant comptable', 'Aide-comptable', 'Expert-comptable', 'Contrôleur de gestion', 'Analyste financier', 'Trésorier',
  'Gestionnaire de paie', 'Chargé de recrutement', 'Responsable RH', 'Assistant RH', 'Chargé RH', 'Juriste', 'Assistant juridique',
  'Avocat', 'Clerc de notaire', 'Gestionnaire de copropriété', 'Gestionnaire locatif', 'Auditeur', 'Directeur administratif et financier',
  // Sécurité, défense, fonction publique
  'Agent de sécurité', 'Agent de sûreté aéroportuaire', 'Agent de surveillance', 'Agent de prévention', 'Pompier', 'Gardien d’immeuble',
  'Agent territorial', 'Adjoint administratif',
  // Ingénierie, recherche
  'Ingénieur', 'Ingénieur commercial', 'Ingénieur d’études', 'Ingénieur électronique', 'Ingénieur mécanique', 'Ingénieur génie civil',
  'Ingénieur environnement', 'Technicien de laboratoire', 'Chargé d’études', 'Chef de projet', 'Consultant',
  // Contrats et formats recherchés
  'Alternance', 'Apprentissage', 'Stage', 'Job étudiant', 'Saisonnier', 'Intérim', 'Télétravail', 'Temps partiel', 'Débutant accepté',
];
