/* ═══════════════════════════════════════════════════════════════════
   TALENTPULSE — Single-file app, organisé par sections
   ─── 1. CONFIG     constantes, données, API
   ─── 2. STATE      données runtime, localStorage
   ─── 3. HELPERS    DOM, escape, toast
   ─── 4. NAVIGATION pages, drawer
   ─── 5. AUTH       login, register, signout
   ─── 6. JOBS       fetch, render, filter, save, apply
   ─── 7. DETAIL     job detail panel
   ─── 8. LETTRE     generator
   ─── 9. CONSEILS   static content
   ─── 10. MODALS    legal, apply
   ─── 11. UI        dark mode, init
═══════════════════════════════════════════════════════════════════ */

(function () {
'use strict';

// ─── 1. CONFIG ────────────────────────────────────────────────────
const API = '/api/jobs'; // proxy Vercel vers France Travail / Adzuna
const SITE = 'https://talentpulse-topaz.vercel.app';
// Drapeaux de fonctionnalités : tout est désactivé par défaut, puis lu sur /api/health.
// Chaque fonctionnalité s'active côté serveur uniquement si ses variables d'environnement existent :
// sans clés, le site fonctionne exactement comme avant (tout en local).
const FEATURES = { auth: false, sync: false, savedSearches: false, aiLetter: false, emailAlerts: false, whatsappAlerts: false, accountEmails: false };
let featuresPromise = null;
function loadFeatures() { return (featuresPromise ||= fetchFeatures()); }
async function fetchFeatures() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.features) Object.keys(FEATURES).forEach(k => { FEATURES[k] = data.features[k] === true; });
  } catch { /* hors ligne / endpoint absent : mode local */ }
}
const ICONS = {
  code: '<svg class="i" aria-hidden="true"><use href="#i-code-xml"/></svg>',
  chart: '<svg class="i" aria-hidden="true"><use href="#i-chart-line"/></svg>',
  briefcase: '<svg class="i" aria-hidden="true"><use href="#i-briefcase-business"/></svg>',
  health: '<svg class="i" aria-hidden="true"><use href="#i-heart-pulse"/></svg>',
  education: '<svg class="i" aria-hidden="true"><use href="#i-graduation-cap"/></svg>',
  restaurant: '<svg class="i" aria-hidden="true"><use href="#i-utensils"/></svg>',
  construction: '<svg class="i" aria-hidden="true"><use href="#i-hard-hat"/></svg>',
  truck: '<svg class="i" aria-hidden="true"><use href="#i-truck"/></svg>',
  megaphone: '<svg class="i" aria-hidden="true"><use href="#i-megaphone"/></svg>',
  handshake: '<svg class="i" aria-hidden="true"><use href="#i-handshake"/></svg>',
  arrowUpRight: '<svg class="i" aria-hidden="true"><use href="#i-arrow-up-right"/></svg>',
  document: '<svg class="i" aria-hidden="true"><use href="#i-file-text"/></svg>',
  message: '<svg class="i" aria-hidden="true"><use href="#i-message-square"/></svg>',
  target: '<svg class="i" aria-hidden="true"><use href="#i-target"/></svg>',
  salary: '<svg class="i" aria-hidden="true"><use href="#i-euro"/></svg>',
  network: '<svg class="i" aria-hidden="true"><use href="#i-users"/></svg>',
  wellbeing: '<svg class="i" aria-hidden="true"><use href="#i-brain"/></svg>',
  search: '<svg class="i" aria-hidden="true"><use href="#i-search"/></svg>',
  bookmark: '<svg class="i" aria-hidden="true"><use href="#i-bookmark"/></svg>',
  clipboard: '<svg class="i" aria-hidden="true"><use href="#i-clipboard-list"/></svg>',
  bell: '<svg class="i" aria-hidden="true"><use href="#i-bell"/></svg>',
  home: '<svg class="i" aria-hidden="true"><use href="#i-house"/></svg>',
  car: '<svg class="i" aria-hidden="true"><use href="#i-car"/></svg>',
  info: '<svg class="i" aria-hidden="true"><use href="#i-info"/></svg>',
  location: '<svg class="i" aria-hidden="true"><use href="#i-map-pin"/></svg>',
  clock: '<svg class="i" aria-hidden="true"><use href="#i-clock"/></svg>',
  external: '<svg class="i" aria-hidden="true"><use href="#i-external-link"/></svg>',
  check: '<svg class="i" aria-hidden="true"><use href="#i-check"/></svg>',
  plus: '<svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>',
  x: '<svg class="i" aria-hidden="true"><use href="#i-x"/></svg>',
  left: '<svg class="i" aria-hidden="true"><use href="#i-chevron-left"/></svg>',
  right: '<svg class="i" aria-hidden="true"><use href="#i-chevron-right"/></svg>',
  share: '<svg class="i" aria-hidden="true"><use href="#i-share"/></svg>',
  alert: '<svg class="i" aria-hidden="true"><use href="#i-triangle-alert"/></svg>',
  refresh: '<svg class="i" aria-hidden="true"><use href="#i-refresh-cw"/></svg>',
  cloud: '<svg class="i" aria-hidden="true"><use href="#i-cloud"/></svg>',
  device: '<svg class="i" aria-hidden="true"><use href="#i-smartphone"/></svg>',
  sparkles: '<svg class="i" aria-hidden="true"><use href="#i-sparkles"/></svg>',
  eye: '<svg class="i" aria-hidden="true"><use href="#i-eye"/></svg>',
  eyeOff: '<svg class="i" aria-hidden="true"><use href="#i-eye-off"/></svg>',
  building: '<svg class="i" aria-hidden="true"><use href="#i-building-2"/></svg>',
  file: '<svg class="i" aria-hidden="true"><use href="#i-file"/></svg>',
  user: '<svg class="i" aria-hidden="true"><use href="#i-user"/></svg>',
  calendar: '<svg class="i" aria-hidden="true"><use href="#i-calendar"/></svg>',
  mail: '<svg class="i" aria-hidden="true"><use href="#i-mail"/></svg>',
  phone: '<svg class="i" aria-hidden="true"><use href="#i-phone"/></svg>'
};
const SVG_BOOKMARK = filled => `<svg class="i${filled ? ' i-fill' : ''}" aria-hidden="true"><use href="#i-bookmark"/></svg>`;
const icon = (name, cls = 'ui-icon') => `<span class="${cls}" aria-hidden="true">${ICONS[name] || ICONS.briefcase}</span>`;
const CATEGORIES = [
  { icon: 'code', img: 'tech', name: 'Tech & IT', q: 'développeur', sub: 'Développeur, data, support' },
  { icon: 'megaphone', img: 'marketing', name: 'Marketing', q: 'marketing', sub: 'Digital, communication' },
  { icon: 'handshake', img: 'commercial', name: 'Commercial', q: 'commercial', sub: 'Vente, relation client' },
  { icon: 'health', img: 'sante', name: 'Santé', q: 'infirmier', sub: 'Infirmier, aide-soignant' },
  { icon: 'education', img: 'education', name: 'Éducation', q: 'enseignant', sub: 'Enseignement, animation' },
  { icon: 'restaurant', img: 'restauration', name: 'Restauration', q: 'serveur', sub: 'Salle, cuisine, hôtellerie' },
  { icon: 'construction', img: 'btp', name: 'BTP', q: 'BTP', sub: 'Chantier, artisanat' },
  { icon: 'truck', img: 'logistique', name: 'Logistique', q: 'logistique', sub: 'Entrepôt, transport' },
];
const CONSEILS = [
  { icon: 'document', title: 'Rédiger un CV percutant', body: 'Mettez en avant vos résultats chiffrés. Adaptez votre CV à chaque offre. Utilisez des verbes d\'action.' },
  { icon: 'message', title: 'Réussir son entretien', body: 'Préparez 3 questions à poser. Connaissez l\'entreprise. Anticipez les questions classiques.' },
  { icon: 'target', title: 'Bien cibler ses candidatures', body: 'Qualité avant quantité. Personnalisez chaque lettre. Suivez vos candidatures.' },
  { icon: 'salary', title: 'Négocier son salaire', body: 'Connaissez le marché. Argumentez avec vos compétences. Restez professionnel.' },
  { icon: 'network', title: 'Développer son réseau', body: 'LinkedIn est incontournable. Participez à des événements. Cultivez vos contacts.' },
  { icon: 'wellbeing', title: 'Gérer son stress', body: 'Pratiquez la respiration. Préparez-vous bien. Acceptez les refus comme un apprentissage.' },
];
const TODO = t => `<span class="todo">[À COMPLÉTER : ${t}]</span>`;
const LEGAL_PAGES = {
  '/mentions-legales': {
    title: 'Mentions légales',
    description: 'Mentions légales du site TalentPulse : éditeur, hébergeur et contact.',
    body: `<h1 id="legalPageTitle">Mentions légales</h1>
<h2>Éditeur du site</h2>
<p>Le site TalentPulse (talentpulse-topaz.vercel.app) est édité par ${TODO('nom et prénom de l’éditeur ou raison sociale')}, ${TODO('statut : particulier, micro-entreprise, SAS…')}.</p>
<ul>
<li>Adresse : ${TODO('adresse postale')}</li>
<li>SIREN / RCS : ${TODO('numéro, si société ou entrepreneur')}</li>
<li>Email : ${TODO('adresse email de contact vérifiée')}</li>
<li>Directeur de la publication : ${TODO('nom du directeur de la publication')}</li>
</ul>
<h2>Hébergeur</h2>
<p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — <a href="https://vercel.com" rel="noopener" target="_blank" style="text-decoration:underline">vercel.com</a>.</p>
<h2>Sources des offres</h2>
<p>Les offres d’emploi affichées proviennent de l’API Offres d’emploi de France Travail et de l’API Adzuna. Elles restent la propriété et la responsabilité de leurs émetteurs. TalentPulse n’est pas l’employeur et ne transmet aucune candidature : vous postulez sur le site d’origine de chaque annonce.</p>
<h2>Réutilisation des offres et traitements appliqués</h2>
<p>Les offres France Travail proviennent de l’API Offres d’emploi et sont réutilisées conformément à la <a href="https://francetravail.io/produits-partages/catalogue/offres-emploi" rel="noopener" target="_blank" style="text-decoration:underline">licence de réutilisation des offres d’emploi de France Travail</a>. Elles sont interrogées en temps réel à chaque recherche ; la date de publication et de dernière mise à jour figure sur chaque offre. Les offres Adzuna sont affichées avec la mention « Jobs by Adzuna » exigée par les <a href="https://developer.adzuna.com/docs/terms_of_service" rel="noopener" target="_blank" style="text-decoration:underline">conditions de l’API Adzuna</a>.</p>
<p>Traitements appliqués, sans modifier le fond des annonces : intitulés et noms d’entreprise écrits en MAJUSCULES remis en casse normale, mention « (H/F) » dédoublonnée, libellés de lieu harmonisés (« Lyon 05 » → « Lyon 5e »), libellés d’expérience reformulés (« 2 An(s) » → « 2 ans d’expérience »), salaires convertis dans un format lisible, et suppression des doublons (même intitulé, même entreprise, même ville) entre les deux sources.</p>
<h2>Propriété intellectuelle</h2>
<p>La marque, le logo et l’interface TalentPulse sont la propriété de l’éditeur. Toute reproduction sans autorisation est interdite. France Travail et Adzuna sont des marques de leurs titulaires respectifs ; elles sont citées uniquement pour indiquer la source des annonces.</p>
<h2>Crédits</h2>
<ul>
<li>Photographies : Alex Kotliarskyi, Negley Stockman et Centre for Ageing Better, via <a href="https://unsplash.com/license" rel="noopener" target="_blank" style="text-decoration:underline">Unsplash</a> (licence Unsplash).</li>
<li>Icônes : <a href="https://lucide.dev" rel="noopener" target="_blank" style="text-decoration:underline">Lucide</a> (licence ISC).</li>
<li>Données géographiques : <a href="https://geo.api.gouv.fr" rel="noopener" target="_blank" style="text-decoration:underline">API Découpage administratif</a> (geo.api.gouv.fr, Licence Ouverte Etalab).</li>
</ul>`
  },
  '/confidentialite': {
    title: 'Politique de confidentialité',
    description: 'Comment TalentPulse traite vos données : stockage local, compte optionnel, sous-traitants, durées de conservation et droits.',
    body: () => privacyPolicy()
  }
};
function privacyPolicy() {
  const F = FEATURES;
  const accounts = F.auth;
  const rows = [
    ['Recherche d’offres', 'Mots-clés, lieu et filtres saisis', 'Intérêt légitime (fournir le service demandé)', 'Non conservés (journaux techniques de l’hébergeur : 30 jours max.)'],
    ['Mon espace sans compte', 'Profil, favoris, suivi, recherches, compétences du CV', 'Stockage local sur votre appareil, sous votre contrôle', 'Jusqu’à ce que vous les effaciez'],
  ];
  if (accounts) {
    rows.push(['Compte TalentPulse', 'Adresse e-mail, prénom, mot de passe (haché avec Argon2id, jamais stocké en clair), date de création', 'Exécution du contrat (art. 6.1.b RGPD)', 'Jusqu’à la suppression du compte ; compte inactif supprimé après 3 ans']);
    rows.push(['Synchronisation', 'Favoris, suivi de candidatures, recherches enregistrées, profil professionnel', 'Exécution du contrat', 'Jusqu’à suppression par vous ou du compte']);
    rows.push(['Sécurité', 'Session (cookie technique httpOnly), empreintes HMAC d’adresse IP et d’e-mail pour limiter les tentatives', 'Intérêt légitime (sécurité du service)', 'Session : 30 jours ; compteurs anti-abus : 48 h']);
  }
  if (F.emailAlerts || F.whatsappAlerts) rows.push(['Alertes', 'Critères de recherche, canal choisi, ' + (F.whatsappAlerts ? 'numéro WhatsApp, ' : '') + 'historique des offres envoyées', 'Consentement (activation de l’alerte, retrait à tout moment)', 'Historique d’envoi : 90 jours']);
  if (F.aiLetter) rows.push(['Lettre de motivation IA', 'Poste, entreprise, atouts et profil saisis dans le formulaire', 'Exécution du service demandé', 'Non conservés par TalentPulse']);
  const processors = ['<li><strong>Vercel Inc.</strong> (hébergement, États-Unis, clauses contractuelles types / Data Privacy Framework)</li>'];
  if (accounts) processors.push('<li><strong>Neon</strong> (base de données PostgreSQL, hébergée dans l’Union européenne)</li>');
  if (F.emailAlerts || F.accountEmails) processors.push(`<li><strong>Resend</strong> (envoi des e-mails ${F.accountEmails ? 'de confirmation d’adresse et de réinitialisation du mot de passe' : ''}${F.accountEmails && F.emailAlerts ? ' et ' : ''}${F.emailAlerts ? 'd’alerte' : ''})</li>`);
  if (F.whatsappAlerts) processors.push('<li><strong>Twilio</strong> et <strong>Meta (WhatsApp)</strong> (envoi des alertes WhatsApp)</li>');
  if (F.aiLetter) processors.push('<li><strong>Vercel AI Gateway</strong> et le fournisseur du modèle de langage (génération de la lettre ; les données ne servent pas à entraîner les modèles selon leurs conditions)</li>');
  processors.push('<li><strong>France Travail</strong> et <strong>Adzuna</strong> reçoivent uniquement les critères de recherche (via nos serveurs), sans donnée personnelle</li>');
  processors.push('<li><strong>geo.api.gouv.fr</strong> (service public de la DINUM) : pour suggérer villes, départements et régions, votre navigateur lui envoie directement les lettres saisies dans le champ « Lieu » ; comme pour tout site web, il voit votre adresse IP. Aucune autre donnée n’est transmise.</li>');
  return `<h1 id="legalPageTitle">Politique de confidentialité</h1>
<p class="legal-meta">Dernière mise à jour : 3 octobre 2026</p>
<h2>En résumé</h2>
<p>TalentPulse fonctionne <strong>sans compte</strong> : vos données restent alors dans votre navigateur.${accounts ? ' Si vous créez un compte (facultatif), nous conservons le strict nécessaire pour synchroniser votre espace entre vos appareils.' : ''} Nous ne déposons <strong>aucun cookie publicitaire ni de mesure d’audience</strong>${accounts ? ' ; le seul cookie est un cookie de session technique, strictement nécessaire, déposé lorsque vous vous connectez' : ''}.</p>
<h2>Responsable du traitement</h2>
<p>${TODO('nom ou raison sociale de l’éditeur, adresse')} — contact : ${TODO('adresse email de contact vérifiée')}.</p>
<h2>Données traitées</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Tableau des traitements"><table><thead><tr><th scope="col">Finalité</th><th scope="col">Données</th><th scope="col">Base légale</th><th scope="col">Durée</th></tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<p>Le fichier de votre CV n’est jamais envoyé : il est analysé dans votre navigateur et seules les compétences détectées sont gardées sur votre appareil.</p>
<p>Vous pouvez effacer les données de cet appareil à tout moment :</p>
<p><button type="button" class="btn btn-outline" data-action="clear-data">Effacer les données de cet appareil</button></p>
<h2>Destinataires et sous-traitants</h2>
<ul>${processors.join('')}</ul>
<h2>Liens vers les sites d’origine</h2>
<p>Lorsque vous cliquez sur « Voir l’offre », vous quittez TalentPulse pour le site de la source (France Travail, Adzuna ou un partenaire). Leur propre politique de confidentialité s’applique alors.</p>
<h2>Vos droits</h2>
<p>Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité.${accounts ? ' Depuis « Mon espace », vous pouvez <strong>exporter</strong> toutes vos données (JSON) et <strong>supprimer votre compte</strong> : la suppression est immédiate et définitive.' : ''} Pour toute demande : ${TODO('adresse email de contact vérifiée')}. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).</p>
<h2>Sécurité</h2>
<p>Connexions chiffrées (HTTPS)${accounts ? ', mots de passe hachés avec Argon2id, sessions stockées sous forme d’empreinte, limitation des tentatives de connexion, protection contre les requêtes intersites (CSRF)' : ''}${accounts && F.accountEmails ? '. Les liens envoyés par e-mail sont à usage unique et stockés sous forme d’empreinte : 1\u00a0heure pour réinitialiser le mot de passe (qui ferme toutes les sessions ouvertes), 48\u00a0heures pour confirmer l’adresse ; les liens expirés sont supprimés automatiquement' : ''}.</p>`;
}
const LEGAL_CONTENT = {
  about: {
    title: 'À propos de TalentPulse',
    body: '<p>TalentPulse est un agrégateur gratuit : il rassemble en une seule recherche les offres de France Travail et d’Adzuna, supprime les doublons et affiche un lien direct vers l’annonce d’origine.</p><p>TalentPulse n’est pas l’employeur des offres affichées et ne transmet pas de candidature. Les informations peuvent évoluer ou disparaître selon les sources d’origine.</p>'
  },
  cgu: {
    title: 'Conditions Générales d’Utilisation',
    body: '<h4>1. Objet</h4><p>Les présentes conditions encadrent l’utilisation du service gratuit TalentPulse.</p><h4>2. Offres tierces</h4><p>TalentPulse affiche des annonces provenant de France Travail et d’Adzuna. Leur contenu, leur disponibilité et les modalités de candidature relèvent de leurs sources d’origine.</p><h4>3. Candidatures</h4><p>TalentPulse ne transmet aucune candidature. Le bouton « Voir l’offre » vous redirige vers le site d’origine, où vous postulez directement. Le « suivi » est un aide-mémoire enregistré sur votre appareil (ou dans votre compte si vous en avez créé un).</p><h4>4. Données</h4><p>Voir la <a href="/confidentialite" data-route="/confidentialite" style="text-decoration:underline">politique de confidentialité</a>.</p>'
  },
  contact: {
    title: 'Contact',
    body: `<p>Une question, une suggestion ou un problème technique ?</p><p><strong>Email :</strong> ${TODO('adresse email de contact vérifiée')}</p><p>Pour une question sur une offre, contactez directement l’employeur ou la source indiquée dans l’annonce.</p>`
  }
};
// ─── 2. STATE ─────────────────────────────────────────────────────
// Cache d'affichage de la session (le vrai cookie httpOnly est revalidé par /api/auth/me au démarrage)
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 jours, comme la session serveur
const State = {
  user:    readSession(),
  profile: safeGet('tp_profile', { prenom:'', nom:'', title:'', city:'', skills:'', contract:'' }),
  saved:   new Set(safeGet('tp_saved', [])),
  applied: new Set(safeGet('tp_applied', [])),
  viewed:  new Set(safeGet('tp_viewed', [])),
  dark:    (() => { try { const v = localStorage.getItem('tp_dark'); return v === '1' || (v === null && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch { return false; } })(),
  jobs:    [],
  filter:  'all',
  sort:    'relevance',
  currentJobId: null,
  kanban:  safeGet('tp_kanban', {}),
  history: safeGet('tp_history', []),
  cv:      safeGet('tp_cv', null),
  alerts:  safeGet('tp_alerts', []),
  searches:safeGet('tp_searches', []),
  lastSearch: null,
  loadError: null,
  filters: sanitizeFilters(safeGet('tp_filters', null)),
  jobCache: safeGet('tp_jobcache', {}),
  apiPage: 1,
  total: 0,
  hasMore: false,
  resolvedLocation: null,
  sourceNotes: null,
};
function sanitizeFilters(raw) {
  const f = defaultFilters();
  if (!raw || typeof raw !== 'object') return f;
  const legacyDate = { '24h': '1', '7j': '7', '30j': '31' };
  if (['debutant', '1', '2', '3'].includes(raw.experience)) f.experience = raw.experience;
  if (['NV5', 'NV4', 'NV3', 'NV2', 'NV1'].includes(raw.niveauEtudes)) f.niveauEtudes = raw.niveauEtudes;
  const d = legacyDate[raw.datePosted] || raw.datePosted;
  if (['1', '7', '31'].includes(d)) f.datePosted = d;
  if (['plein', 'partiel'].includes(raw.tempsPlein)) f.tempsPlein = raw.tempsPlein;
  if (/^\d{5}$/.test(String(raw.salaireMin || ''))) f.salaireMin = String(raw.salaireMin);
  return f;
}
function safeGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

/* ─── SESSION (fix #5) ─────────────────────────────────────────────
   Le cookie de session est géré par le backend (httpOnly). Le
   localStorage ne sert QUE de cache d'affichage : il doit donc
   expirer de lui-même, sinon l'UI affiche un utilisateur "connecté"
   alors que le cookie serveur est mort depuis longtemps.           */

function readSession() {
  const raw = safeGet('tp_user', null);
  if (!raw || typeof raw !== 'object' || !raw.email) return null;
  // Ancien format (sans savedAt) → on le rejette pour forcer une re-validation
  if (!raw.savedAt || (Date.now() - raw.savedAt) > SESSION_TTL) {
    try { localStorage.removeItem('tp_user'); } catch {}
    return null;
  }
  return { prenom: raw.prenom || '', email: raw.email, createdAt: raw.createdAt || null, savedAt: raw.savedAt };
}

function writeSession(user) {
  State.user = { prenom: user.prenom || '', email: user.email, createdAt: user.createdAt || State.user?.createdAt || null, emailVerified: user.emailVerified ?? State.user?.emailVerified ?? true, savedAt: Date.now() };
  safeSet('tp_user', State.user);
}

function clearSession() {
  State.user = null;
  try { localStorage.removeItem('tp_user'); } catch {}
}

/* Appelée dès qu'un appel API renvoie 401/403 : la session serveur
   n'est plus valide, on nettoie l'UI immédiatement au lieu de laisser
   l'utilisateur cliquer dans le vide. */
let sessionExpiredNotified = false;
function handleSessionExpired() {
  if (!State.user) return;
  clearSession();
  refreshAuthUI();
  if (!sessionExpiredNotified) {
    sessionExpiredNotified = true;
    toast('Session expirée, reconnectez-vous.', 'err');
    setTimeout(() => { sessionExpiredNotified = false; }, 5000);
  }
  showPage('login');
  switchAuthTab('in');
}

/* ─── COMPTE & SYNCHRONISATION ──────────────────────────────────────
   Déconnecté : tout reste dans localStorage (fonctionnement historique).
   Connecté : localStorage sert de cache, chaque modification est aussi
   envoyée à l'API (/api/me/*). À la connexion, les données locales sont
   fusionnées dans le compte (POST /api/me/sync), puis l'état serveur
   devient la référence. */
async function bootstrapAccount() {
  if (!FEATURES.auth) { if (State.user) { clearSession(); refreshAuthUI(); } return; }
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!res.ok) return; // 5xx : on ne déconnecte pas à tort
    const data = await res.json().catch(() => ({}));
    if (data && data.user && data.user.email) {
      writeSession(data.user);
      refreshAuthUI();
      await pullServerState();
    } else if (State.user) {
      clearSession();
      refreshAuthUI();
    }
  } catch { /* hors ligne : on garde le cache */ }
}

const remoteOn = () => !!(State.user && FEATURES.sync);
let syncStatus = 'idle';
function setSyncStatus(st) {
  syncStatus = st;
  const pill = $('#syncPill');
  if (pill && $('#page-profile').classList.contains('active')) renderSyncPill();
}
async function remote(path, opts = {}) {
  if (!remoteOn()) return null;
  try {
    const data = await apiFetch(path, { ...opts, auth: true });
    if (syncStatus === 'error') setSyncStatus('ok');
    return data;
  } catch (err) {
    if (err.kind !== 'auth') {
      setSyncStatus('error');
      toast('Synchronisation impossible : la modification est gardée sur cet appareil.', 'err');
    }
    return null;
  }
}
const clip = (v, n) => String(v || '').slice(0, n);
function jobSnapshot(j) {
  if (!j) return {};
  const url = /^https?:\/\//i.test(j.url || '') ? clip(j.url, 1000) : '';
  return { title: clip(j.title, 200), company: clip(j.company, 160), city: clip(j.city, 160), contract: clip(j.contract, 40), salary: clip(j.salary, 80), source: clip(j.source, 40), sourceSite: clip(j.sourceSite, 80), posted: clip(j.posted, 40), url };
}
const validJobId = id => /^(ft|adz|lba)_[A-Za-z0-9._-]+$/.test(id || '') && id.length <= 80;
function profilePayload() {
  const p = State.profile || {};
  return { prenom: clip(p.prenom, 60), nom: clip(p.nom, 60), title: clip(p.title, 120), city: clip(p.city, 80), skills: clip(p.skills, 1000), contract: clip(p.contract, 40) };
}
function alertPayload(a) {
  const out = { label: clip(a.label || [a.kw, a.city].filter(Boolean).join(' · '), 120), query: { kw: clip(a.kw, 120), city: clip(a.city, 80) }, channels: a.channels || [] };
  if (a.whatsappTo) out.whatsappTo = a.whatsappTo;
  return out;
}
function buildSyncPayload() {
  const favorites = [...State.saved].filter(validJobId).slice(0, 500).map(id => ({ jobId: id, job: jobSnapshot(findJob(id)) }));
  const pipeline = [];
  KCOLS.forEach(c => (State.kanban[c.key] || []).forEach((k, i) => {
    if (validJobId(k.id) && pipeline.length < 500) pipeline.push({ jobId: k.id, status: c.key, position: i, job: jobSnapshot({ ...(findJob(k.id) || {}), ...k }) });
  }));
  const alerts = State.alerts.filter(a => !a.id && (a.kw || a.city)).slice(0, 20).map(a => ({ ...alertPayload(a), channels: [] }));
  const p = profilePayload();
  return { favorites, pipeline, alerts, profile: Object.values(p).some(Boolean) ? p : undefined };
}
function applyServerState(data) {
  if (!data) return;
  if (Array.isArray(data.favorites)) {
    State.saved = new Set(data.favorites.map(f => f.jobId));
    data.favorites.forEach(f => { if (!State.jobCache[f.jobId]) State.jobCache[f.jobId] = { id: f.jobId, ...f.job }; });
  }
  if (Array.isArray(data.pipeline)) {
    const kb = {};
    data.pipeline.slice().sort((a, b) => (a.position || 0) - (b.position || 0)).forEach(it => {
      (kb[it.status] = kb[it.status] || []).push({ id: it.jobId, title: it.job.title || 'Offre', company: it.job.company || '', url: it.job.url || '' });
      if (!State.jobCache[it.jobId]) State.jobCache[it.jobId] = { id: it.jobId, ...it.job };
    });
    State.kanban = kb;
    State.applied = new Set(data.pipeline.map(it => it.jobId));
    safeSet('tp_kanban', State.kanban);
  }
  if (Array.isArray(data.alerts)) {
    State.alerts = data.alerts.map(a => ({ id: a.id, kw: a.query.kw || '', city: a.query.city || '', label: a.label, channels: a.channels || [], whatsappTo: a.whatsappTo || '', created: Date.parse(a.createdAt) || Date.now(), lastSentAt: a.lastSentAt || null }));
    safeSet('tp_alerts', State.alerts);
  }
  const prof = data.user && data.user.profile;
  if (prof && typeof prof === 'object') {
    Object.entries(prof).forEach(([k, v]) => { if (v && k in State.profile) State.profile[k] = v; });
    if (!State.profile.prenom && data.user.prenom) State.profile.prenom = data.user.prenom;
    syncProfile();
  }
  safeSet('tp_jobcache', State.jobCache);
  syncState();
  updateFavBadge();
}
async function pullServerState() {
  if (!remoteOn()) return;
  setSyncStatus('syncing');
  const [fav, pipe, al, prof] = await Promise.all([
    remote('/api/me/favorites'), remote('/api/me/pipeline'), remote('/api/me/alerts'), remote('/api/me/profile'),
  ]);
  if (!fav && !pipe && !al) return;
  applyServerState({ favorites: fav?.favorites, pipeline: pipe?.pipeline, alerts: al?.alerts, user: prof?.user });
  setSyncStatus('ok');
  rerenderCurrent();
}
async function syncAfterLogin() {
  if (!remoteOn()) return 0;
  const payload = buildSyncPayload();
  const n = payload.favorites.length + payload.pipeline.length + payload.alerts.length;
  setSyncStatus('syncing');
  const data = await remote('/api/me/sync', { method: 'POST', body: payload, timeout: 20000 });
  if (data) { applyServerState(data); setSyncStatus('ok'); }
  else await pullServerState();
  return data ? n : 0;
}
function rerenderCurrent() {
  if ($('#page-profile')?.classList.contains('active')) renderProfile();
  if ($('#page-jobs')?.classList.contains('active') && State.jobs.length) renderJobs();
}
function clearAccountCache() {
  // Après déconnexion, l'espace local repart de zéro : les données restent dans le compte.
  try { Object.keys(localStorage).filter(k => k.startsWith('tp_') && k !== 'tp_dark' && k !== 'tp_filters').forEach(k => localStorage.removeItem(k)); } catch {}
  State.profile = { prenom:'', nom:'', title:'', city:'', skills:'', contract:'' };
  State.saved = new Set(); State.applied = new Set(); State.viewed = new Set();
  State.kanban = {}; State.history = []; State.cv = null; State.alerts = []; State.searches = []; State.jobCache = {};
  updateFavBadge();
}
function syncState() {
  safeSet('tp_saved', [...State.saved]);
  safeSet('tp_applied', [...State.applied]);
  safeSet('tp_viewed', [...State.viewed]);
  updateFavBadge();
}
function updateFavBadge() {
  const b = $('#navFavCount');
  if (!b) return;
  const n = State.saved.size;
  b.textContent = n > 99 ? '99+' : String(n);
  b.classList.toggle('hide', n === 0);
  $('#navFavBtn')?.setAttribute('aria-label', n ? `Mes favoris (${n})` : 'Mes favoris');
}
function syncProfile() { safeSet('tp_profile', State.profile); }

// ─── 3. HELPERS ───────────────────────────────────────────────────
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function sourceClass(s) { return s === 'France Travail' ? 'src-ft' : s === 'Adzuna' ? 'src-adz' : ''; }
const FT_LICENCE_URL = 'https://francetravail.io/produits-partages/catalogue/offres-emploi';
const fmtDate = d => (d && !isNaN(new Date(d)) ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
/** Mention exigée par les conditions de l'API Adzuna : « Jobs by Adzuna », « Jobs » et le logo liés à adzuna.fr */
const adzunaAttribution = () => `<span class="adz-attr"><a href="https://www.adzuna.fr" target="_blank" rel="noopener">Jobs</a> by <a href="https://www.adzuna.fr" target="_blank" rel="noopener" class="adz-logo"><img src="/img/adzuna-logo.png" alt="Adzuna" width="87" height="23" loading="lazy" decoding="async"></a></span>`;
/** Avatar : logo fourni par France Travail s'il existe, sinon initiale */
function avatarHtml(j, name) {
  if (j.logo) return `<div class="co-avatar co-logo" aria-hidden="true"><img src="${esc(j.logo)}" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`;
  return `<div class="co-avatar" style="${avatarStyle(name)}" aria-hidden="true">${esc(name[0].toUpperCase())}</div>`;
}
const sourceIcon = s => `<svg class="i" aria-hidden="true"><use href="#i-${s === 'Adzuna' ? 'globe' : 'landmark'}"/></svg>`;
// Pastilles entreprise : couples fond/texte pastel, contraste ≥ 4.5:1 (WCAG AA)
const AVATAR_COLORS = [['#FFEDD5','#9A3412'],['#E0F2FE','#075985'],['#EDE9FE','#5B21B6'],['#D1FAE5','#065F46'],['#FEE2E2','#991B1B'],['#FEF3C7','#92400E'],['#FCE7F3','#9D174D'],['#CFFAFE','#155E75']];
function avatarStyle(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `--av-bg:${bg};--av-fg:${fg}`;
}

// Date relative façon "Indeed" : Aujourd'hui / Il y a X jours / Il y a X mois...
function relativeDate(dateStr) {
  if (!dateStr) return '';
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    d = new Date(dateStr);
  } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/');
    d = new Date(`${year}-${month}-${day}`);
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return '';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Il y a 1 jour';
  if (diffDays < 30) return `Il y a ${diffDays} jours`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return 'Il y a 1 mois';
  if (months < 12) return `Il y a ${months} mois`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'Il y a 1 an' : `Il y a ${years} ans`;
}

let toastTimer;
function toast(msg, type) {
  const t = $('#toast');
  if (!t) return;
  // Auto-détection si type non fourni
  if (!type) {
    if (/✓|✅|Bienvenue|activées|créée|sauvegard|envoyée|importé|copiée|mis à jour/i.test(msg)) type = 'ok';
    else if (/erreur|invalide|incorrect|requis|trop court|déjà|Autorisez|Aucun compte/i.test(msg)) type = 'err';
  }
  t.className = 'toast';
  if (type) t.classList.add(type);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── 4. NAVIGATION ────────────────────────────────────────────────
let jobsRequestSeq = 0;
let jobsAbort = null;
let routeHandling = false;
let lastFocusBeforeDetail = null;

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function humanizeSlug(value) {
  try { return decodeURIComponent(String(value || '')).replace(/-/g, ' ').trim(); } catch { return String(value || '').replace(/-/g, ' '); }
}

function updatePageMeta(title, description, canonicalPath) {
  document.title = title;
  const url = SITE + (canonicalPath || '/');
  const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
  set('meta[name="description"]', 'content', description);
  set('link[rel="canonical"]', 'href', url);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  set('meta[property="og:url"]', 'content', url);
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', description);
}

function searchPath(params) {
  const p = params || {};
  const kw = p.kw || 'emploi';
  const city = p.city || '';
  return city ? '/offres/' + slugify(kw) + '/' + slugify(city) : '/offres/' + slugify(kw);
}

function syncSearchRoute(params, replace) {
  const p = params || {};
  const path = searchPath(p);
  const title = (p.kw || p.city) ? (p.kw || 'Offres') + (p.city ? ' à ' + p.city : '') + ' — TalentPulse' : 'Offres d’emploi — TalentPulse';
  const description = (p.kw || p.city) ? 'Offres de ' + (p.kw || 'emploi') + (p.city ? ' à ' + p.city : '') + ' issues de France Travail et Adzuna, réunies sur TalentPulse.' : 'Recherchez parmi les offres France Travail et Adzuna avec TalentPulse.';
  updatePageMeta(title, description, path);
  if (window.location.pathname !== path) window.history[replace ? 'replaceState' : 'pushState']({ talentpulse: true, kw: p.kw || '', city: p.city || '' }, '', path);
}

const STATIC_ROUTES = {
  '/lettre':     { page: 'lettre',   title: 'Lettre de motivation — TalentPulse', desc: 'Générez une trame de lettre de motivation à personnaliser.' },
  '/conseils':   { page: 'conseils', title: 'Conseils carrière — TalentPulse', desc: 'Conseils pour réussir votre recherche d’emploi.' },
  '/mon-espace': { page: 'profile',  title: 'Mon espace — TalentPulse', desc: 'Vos favoris, votre suivi de candidatures et votre CV, sur cet appareil.' },
  '/nouveau-mot-de-passe': { page: 'account-link', title: 'Nouveau mot de passe — TalentPulse', desc: 'Choisissez un nouveau mot de passe pour votre compte TalentPulse.' },
  '/verifier-email': { page: 'account-link', title: 'Confirmation de l’adresse e-mail — TalentPulse', desc: 'Confirmez votre adresse e-mail TalentPulse.' },
  '/connexion':  { page: 'login',    title: 'Connexion — TalentPulse', desc: 'Les comptes TalentPulse arrivent bientôt.' },
};
const PAGE_PATHS = { home: '/', jobs: null, lettre: '/lettre', conseils: '/conseils', profile: '/mon-espace', login: '/connexion' };

/** Mémorise la position de défilement de l'entrée courante (restaurée au retour arrière). */
function rememberScroll() {
  try { window.history.replaceState({ ...(window.history.state || {}), y: Math.round(window.scrollY) }, ''); } catch { /* quota Safari */ }
}
function navigate(path) {
  if (window.location.pathname !== path) { rememberScroll(); window.history.pushState({ talentpulse: true }, '', path); }
  handleRoute();
}

function handleRoute() {
  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const parts = rawPath.split('/').filter(Boolean);
  if (!parts.length) {
    updatePageMeta("TalentPulse — Toutes les offres d'emploi France Travail et Adzuna", 'Toutes les offres France Travail (alternance incluse) et Adzuna en une seule recherche. Gratuit, sans inscription, avec lien direct vers l’annonce d’origine.', '/');
    showPage('home');
    return;
  }
  if (LEGAL_PAGES[rawPath]) { showLegalPage(rawPath); return; }
  if (STATIC_ROUTES[rawPath]) {
    const r = STATIC_ROUTES[rawPath];
    updatePageMeta(r.title, r.desc, rawPath);
    if (r.page === 'account-link') { showAccountLink(rawPath === '/verifier-email' ? 'verify' : 'reset'); return; }
    showPage(r.page);
    return;
  }
  if (parts[0] === 'offres') {
    const kw = parts[1] && parts[1] !== 'emploi' ? humanizeSlug(parts[1]) : '';
    const city = parts[2] ? humanizeSlug(parts[2]) : '';
    // Retour depuis une offre : la liste est intacte sous le panneau, on la garde telle quelle (position comprise)
    if ($('#page-jobs').classList.contains('active') && State.jobs.length && rawPath === searchPath(State.lastSearch || {})) {
      closeDetail({ syncRoute: false });
      return;
    }
    const savedY = window.history.state && window.history.state.y;
    if (hydrateSsr(rawPath)) return;
    $('#searchKw').value = kw;
    $('#searchCity').value = city;
    const sb = $('#saveSearchBtn'); if (sb) sb.style.display = (kw || city) ? 'inline-flex' : 'none';
    syncSearchRoute({ kw, city }, true);
    showPage('jobs', { load: false });
    loadJobs({ kw, city }).then(() => { if (savedY) requestAnimationFrame(() => window.scrollTo(0, savedY)); });
    return;
  }
  if (parts[0] === 'offre' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    if (State.jobs.some(j => j.id === id)) { openDetail(id, { push: false }); return; }
    showPage('jobs', { load: false });
    openOfferById(id);
    return;
  }
  showPage('home');
}

// ── Pages d'atterrissage rendues côté serveur (/offres/:metier/:lieu) ──
// Le serveur fournit la 1re page France Travail en HTML et en JSON : on la reprend sans nouvelle requête
// (pas de saut de mise en page), puis on ajoute les offres Adzuna en fin de liste.
let ssrData;
function getSsr() {
  if (ssrData === undefined) {
    try { ssrData = JSON.parse($('#ssrData')?.textContent || 'null'); } catch { ssrData = null; }
  }
  return ssrData;
}
function toggleSeoBlocks(show) {
  ['#seoCrumbs', '#seoIntro', '#seoMore'].forEach(sel => { const el = $(sel); if (el && el.children.length) el.hidden = !show; });
}
function hydrateSsr(rawPath) {
  const ssr = getSsr();
  if (!ssr || ssr.used || ssr.path !== rawPath) return false;
  ssr.used = true;
  State.lastSearch = { kw: ssr.kw, city: ssr.city };
  for (const id of ['searchKw', 'rsKw']) { const el = $('#' + id); if (el) el.value = ssr.kw; }
  for (const id of ['searchCity', 'rsCity', 'filterLocation']) { const el = $('#' + id); if (el) el.value = ssr.city; }
  const sb = $('#saveSearchBtn'); if (sb) sb.style.display = 'inline-flex';
  State.jobs = (ssr.resultats || []).map(parseAggregatedJob).filter(Boolean);
  State.total = ssr.total || 0;
  State.apiPage = 1;
  State.hasMore = !!ssr.hasMore;
  State.resolvedLocation = ssr.location;
  State.loadError = null;
  showPage('jobs', { load: false });
  toggleSeoBlocks(true);
  renderJobsNotice(State.lastSearch);
  renderJobs();
  bindNavLinks($('#page-jobs'));
  const seq = jobsRequestSeq;
  const qs = buildJobsQuery(State.lastSearch, 1); qs.set('source', 'adzuna');
  apiFetch(`${API}?${qs}`, { timeout: 15000 }).then(data => {
    if (seq !== jobsRequestSeq || !data || !Array.isArray(data.resultats)) return; // une autre recherche a pris le relais
    const known = new Set(State.jobs.map(j => j.id));
    const extra = data.resultats.map(parseAggregatedJob).filter(j => j && !known.has(j.id));
    if (!extra.length) return;
    State.jobs = State.jobs.concat(extra);
    State.total = (State.total || 0) + (data.total || 0);
    State.hasMore = State.hasMore || !!data.hasMore;
    renderJobs();
  }).catch(() => {});
  return true;
}

async function openOfferById(id) {
  routeHandling = true;
  try {
    const data = await apiFetch(`${API}?id=${encodeURIComponent(id)}`);
    const job = data.offre ? parseAggregatedJob(data.offre) : null;
    if (!job) throw new Error('not found');
    if (!State.jobs.some(j => j.id === job.id)) State.jobs.unshift(job);
    renderJobs();
    openDetail(job.id, { push: false });
  } catch {
    toast("Cette offre n'est plus disponible.", 'err');
    updatePageMeta('Offre indisponible — TalentPulse', 'Cette offre n’est plus disponible.', '/offres/emploi');
    window.history.replaceState({ talentpulse: true }, '', '/offres/emploi');
    loadJobs({});
  } finally {
    routeHandling = false;
  }
}

/** Espaces insécables avant : ; ? ! » et après « (texte uniquement, pas les balises) */
function frTypo(html) {
  return String(html).replace(/>([^<>]+)</g, (m, t) => '>' + t.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0') + '<');
}
function showLegalPage(path) {
  const c = LEGAL_PAGES[path];
  $('#legalPage').innerHTML = frTypo(typeof c.body === 'function' ? c.body() : c.body);
  updatePageMeta(c.title + ' — TalentPulse', c.description, path);
  showPage('legal');
}

/** showPage(name, { load }) — load:false quand une recherche va être lancée juste après (évite la course). */
function showPage(name, { load = true } = {}) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = $(`#page-${name}`);
  if (el) el.classList.add('active');
  if (name === 'home') { loadLiveCount(); initTicker(); }
  closeDrawer();
  closeDetail({ syncRoute: false, restoreFocus: false });
  window.scrollTo(0, 0);
  $$('.nav-link').forEach(l => {
    const active = l.dataset.nav === name;
    l.classList.toggle('active', active);
    if (active) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  });
  if (name === 'jobs' && load && State.jobs.length === 0 && !jobsAbort) loadJobs(State.lastSearch || {});
  if (name === 'jobs') { renderSavedSearches(); renderActiveFilterChips(); syncFilterDrawerA11y(); }
  if (name === 'profile') renderProfile();
  if (name === 'conseils') renderConseils();
  if (name === 'home') renderCategories();
  if (name === 'login') refreshAuthForms();
}

function goToPage(name) {
  const path = PAGE_PATHS[name];
  if (name === 'jobs') { const p = State.lastSearch || {}; syncSearchRoute(p); showPage('jobs'); return; }
  if (path && window.location.pathname !== path) window.history.pushState({ talentpulse: true }, '', path);
  if (path && STATIC_ROUTES[path]) updatePageMeta(STATIC_ROUTES[path].title, STATIC_ROUTES[path].desc, path);
  showPage(name);
}

function openDrawer()  {
  const d = $('#drawer');
  d.classList.add('open');
  d.removeAttribute('inert');
  $('#drawerOverlay').classList.add('open');
  document.body.classList.add('no-scroll');
  $('#navBurger').setAttribute('aria-expanded', 'true');
  setTimeout(() => $('#drawerClose')?.focus(), 50);
}
function closeDrawer() {
  const d = $('#drawer');
  const wasOpen = d.classList.contains('open');
  d.classList.remove('open');
  d.setAttribute('inert', '');
  $('#drawerOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
  $('#navBurger').setAttribute('aria-expanded', 'false');
  if (wasOpen && d.contains(document.activeElement)) $('#navBurger').focus();
}
// ─── 5. AUTH ──────────────────────────────────────────────────────
// Les comptes s'activent uniquement si le serveur les annonce (FEATURES.auth via /api/health).
const PASSWORD_MIN = 10;

function refreshAuthUI() {
  const u = State.user;
  $('#navLogin').style.display = u ? 'none' : '';
  $('#drawerFoot').style.display = u ? 'none' : '';
  const nu = $('#navUser');
  if (u) {
    nu.classList.add('on');
    nu.innerHTML = `<span class="nav-avatar" aria-hidden="true">${esc(u.prenom?.[0]?.toUpperCase() || 'U')}</span><span>${esc(u.prenom || 'Mon espace')}</span>`;
    nu.setAttribute('aria-label', `Mon espace (connecté : ${u.email})`);
  } else {
    nu.classList.remove('on');
    nu.innerHTML = '';
  }
  const band = $('#bandSyncLine');
  if (band) band.textContent = u ? 'Synchronisé avec votre compte sur tous vos appareils' : FEATURES.auth ? 'Sur votre appareil, ou synchronisé avec un compte gratuit' : 'Données enregistrées sur votre appareil, effaçables en un clic';
}

function refreshAuthForms() {
  const enabled = FEATURES.auth;
  $('#authSoon')?.classList.toggle('hide', enabled);
  $('#forgotWrap')?.classList.toggle('hide', !(enabled && FEATURES.accountEmails));
  ['#fsIn', '#fsUp'].forEach(sel => { const fs = $(sel); if (fs) fs.disabled = !enabled; });
}

function showAuthErr(msg) {
  const e = $('#authErr');
  e.textContent = msg;
  e.classList.add('show');
}
function clearAuthErr() { $('#authErr').classList.remove('show'); }

function switchAuthTab(tab) {
  clearAuthErr();
  $('.auth-tabs')?.classList.remove('hide');
  $$('.auth-tab').forEach(t => { const on = t.dataset.tab === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  $$('.auth-form').forEach(f => f.classList.remove('active'));
  $(tab === 'in' ? '#panelIn' : '#panelUp').classList.add('active');
  $('#authTitle').textContent = tab === 'in' ? 'Connexion' : 'Créer un compte';
}

function passwordScore(v) {
  if (!v) return 0;
  let sc = 0;
  if (v.length >= PASSWORD_MIN) sc++;
  if (v.length >= 14) sc++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) sc++;
  return v.length < PASSWORD_MIN ? 1 : Math.max(2, sc);
}

// Validation temps réel inscription
function setupLiveValidation() {
  const email = $('#upEmail'), pass = $('#upPass');
  const hintE = $('#hintEmail'), hintP = $('#hintPass');
  if (!email || !pass) return;
  on(email, 'input', () => {
    const v = email.value.trim();
    if (!v) { email.className = 'form-input'; hintE.className = 'field-hint'; hintE.textContent = ''; return; }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    email.className = 'form-input ' + (ok ? 'valid' : 'invalid');
    hintE.className = 'field-hint ' + (ok ? 'ok' : 'err');
    hintE.textContent = ok ? 'Email valide' : 'Format attendu : nom@domaine.fr';
  });
  on(pass, 'input', () => {
    const v = pass.value;
    const meter = $('#pwMeter');
    const score = passwordScore(v);
    if (meter) meter.dataset.score = String(score);
    if (!v) { pass.className = 'form-input'; hintP.className = 'field-hint'; hintP.textContent = ''; return; }
    const ok = v.length >= PASSWORD_MIN;
    pass.className = 'form-input ' + (ok ? 'valid' : 'invalid');
    hintP.className = 'field-hint ' + (ok ? 'ok' : 'err');
    hintP.textContent = ok ? ['', '', 'Mot de passe correct', 'Bon mot de passe', 'Excellent mot de passe'][score] : `Encore ${PASSWORD_MIN - v.length} caractère(s) minimum`;
  });
  $$('.pw-toggle').forEach(btn => {
    btn.innerHTML = ICONS.eye;
    on(btn, 'click', () => {
      const input = $('#' + btn.dataset.pw);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
}
/* ─── COUCHE RÉSEAU CENTRALISÉE (fix #4) ───────────────────────────
   Tous les appels passent par ici : timeout, détection hors-ligne,
   messages d'erreur lisibles, et déconnexion auto sur 401/403.
   ApiError.kind vaut 'offline' | 'timeout' | 'auth' | 'server' | 'client'. */
const API_TIMEOUT = 12000;

class ApiError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status || 0;
  }
}

async function apiFetch(path, { method = 'GET', body, auth = false, timeout = API_TIMEOUT, signal } = {}) {
  if (navigator.onLine === false) {
    throw new ApiError('Vous êtes hors ligne. Vérifiez votre connexion.', 'offline');
  }
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
  const onAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }

  let res;
  try {
    res = await fetch(path, {
      method,
      signal: ctrl.signal,
      credentials: auth ? 'include' : 'same-origin',
      headers: body
        ? { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        : { 'Accept': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      if (!timedOut) throw new ApiError('Requête annulée.', 'aborted');
      throw new ApiError('Le serveur met trop de temps à répondre. Réessayez.', 'timeout');
    }
    throw new ApiError('Connexion au serveur impossible. Réessayez dans un instant.', 'offline');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  let data = {};
  try { data = await res.json(); } catch {}

  if (res.status === 401 || res.status === 403) {
    handleSessionExpired();
    throw new ApiError(apiErrorMessage(data, 'Session expirée, reconnectez-vous.'), 'auth', res.status);
  }
  if (res.status >= 500) {
    throw new ApiError('Le service est temporairement indisponible. Réessayez plus tard.', 'server', res.status);
  }
  if (!res.ok) {
    throw new ApiError(apiErrorMessage(data, 'Requête refusée par le serveur.'), 'client', res.status);
  }
  return data;
}
function apiErrorMessage(data, fallback) {
  if (!data) return fallback;
  const e = data.error ?? data.message;
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

async function authRequest(path, payload) {
  // Sur login/register, un 401 = "mauvais identifiants", PAS une session
  // expirée : on court-circuite donc handleSessionExpired().
  if (navigator.onLine === false) throw new ApiError('Vous êtes hors ligne. Vérifiez votre connexion.', 'offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      signal: ctrl.signal,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('Le serveur met trop de temps à répondre. Réessayez.', 'timeout');
    throw new ApiError('Connexion au serveur impossible. Réessayez dans un instant.', 'offline');
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 404 || res.status === 503) throw new ApiError('Les comptes ne sont pas encore disponibles.', 'client', res.status);
  if (res.status === 429) throw new ApiError(apiErrorMessage(data, 'Trop de tentatives. Réessayez dans quelques minutes.'), 'client', 429);
  if (res.status >= 500) throw new ApiError('Le service est temporairement indisponible. Réessayez plus tard.', 'server', res.status);
  if (!res.ok) throw new ApiError(apiErrorMessage(data, 'Identifiants incorrects.'), 'client', res.status);
  return data;
}

async function afterAuth(user, isNew) {
  writeSession(user);
  refreshAuthUI();
  const imported = await syncAfterLogin();
  navigate('/mon-espace');
  toast(`Bienvenue ${State.user.prenom || ''}`.trim() + (imported ? ` : ${imported} élément(s) de cet appareil ajoutés à votre compte.` : isNew ? ' : votre compte est prêt.' : '.'), 'ok');
}

async function doSignIn(e) {
  e.preventDefault();
  clearAuthErr();
  if (!FEATURES.auth) return showAuthErr('Les comptes arrivent bientôt. Vous pouvez utiliser TalentPulse sans compte.');
  const email = $('#inEmail').value.trim().toLowerCase();
  const pass  = $('#inPass').value;
  if (!email || !pass) return showAuthErr('Email et mot de passe requis.');
  const btn = $('#formIn button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Connexion…';
  try {
    const data = await authRequest('/api/auth/login', { email, password: pass });
    if (!data.user || !data.user.email) throw new Error('Réponse serveur invalide.');
    $('#inPass').value = '';
    await afterAuth(data.user, false);
  } catch (err) {
    showAuthErr(typeof err.message === 'string' && err.message ? err.message : 'Connexion indisponible.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

async function doSignUp(e) {
  e.preventDefault();
  clearAuthErr();
  if (!FEATURES.auth) return showAuthErr('Les comptes arrivent bientôt. Vous pouvez utiliser TalentPulse sans compte.');
  const prenom = $('#upPrenom').value.trim();
  const email  = $('#upEmail').value.trim().toLowerCase();
  const pass   = $('#upPass').value;
  if (!prenom || !email || !pass) return showAuthErr('Tous les champs sont requis.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showAuthErr('Email invalide.');
  if (pass.length < PASSWORD_MIN) return showAuthErr(`Utilisez au moins ${PASSWORD_MIN} caractères.`);
  if (!$('#upConsent').checked) return showAuthErr('Merci d’accepter la politique de confidentialité pour créer un compte.');
  const btn = $('#formUp button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Création…';
  try {
    const data = await authRequest('/api/auth/register', { prenom, email, password: pass, consent: true });
    if (!data.user || !data.user.email) throw new Error('Réponse serveur invalide.');
    $('#upPass').value = '';
    await afterAuth(data.user, true);
  } catch (err) {
    showAuthErr(typeof err.message === 'string' && err.message ? err.message : 'Inscription indisponible.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Créer mon compte';
  }
}

// ── Mot de passe oublié, nouveau mot de passe, vérification d'adresse ──
function showForgot(show) {
  clearAuthErr();
  $('.auth-tabs').classList.toggle('hide', show);
  $$('.auth-form').forEach(f => f.classList.remove('active'));
  $(show ? '#panelForgot' : '#panelIn').classList.add('active');
  $('#authTitle').textContent = show ? 'Mot de passe oublié' : 'Connexion';
  $('#forgotOk').classList.remove('show');
  if (show) { $('#forgotEmail').value = $('#inEmail').value; setTimeout(() => $('#forgotEmail').focus(), 30); }
  else setTimeout(() => $('#forgotBtn').focus(), 30);
}
async function doForgot(e) {
  e.preventDefault();
  clearAuthErr();
  const email = $('#forgotEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showAuthErr('Adresse e-mail invalide.');
  const btn = $('#formForgot button[type="submit"]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Envoi…';
  try {
    const data = await authRequest('/api/auth/forgot', { email });
    const ok = $('#forgotOk'); ok.textContent = data.message || 'Si un compte existe, un e-mail vient d’être envoyé.'; ok.classList.add('show');
  } catch (err) { showAuthErr(err.message || 'Envoi impossible pour le moment.'); }
  finally { btn.disabled = false; btn.textContent = 'Recevoir le lien'; }
}
/** Le jeton arrive dans le fragment (#t=…) : jamais envoyé au serveur, retiré aussitôt de la barre d'adresse. */
function takeLinkToken() {
  const m = /[#&]t=([^&]+)/.exec(window.location.hash || '');
  const t = m ? decodeURIComponent(m[1]) : (State.linkToken || '');
  if (m) { State.linkToken = t; window.history.replaceState(window.history.state, '', window.location.pathname); }
  return t;
}
function linkMsg(kind, msg) {
  const ok = $('#linkOk'), err = $('#linkErr');
  ok.classList.remove('show'); err.classList.remove('show');
  if (!msg) return;
  const el = kind === 'ok' ? ok : err; el.textContent = msg; el.classList.add('show');
}
async function showAccountLink(kind) {
  showPage('account-link');
  const token = takeLinkToken();
  const form = $('#formReset');
  $('#linkTitle').textContent = kind === 'reset' ? 'Nouveau mot de passe' : 'Confirmation de l’adresse e-mail';
  form.classList.add('hide');
  linkMsg();
  await loadFeatures();
  form.classList.toggle('hide', kind !== 'reset' || !token || !FEATURES.accountEmails);
  if (!FEATURES.accountEmails) return linkMsg('err', 'Cette fonctionnalité n’est pas encore disponible.');
  if (!token) return linkMsg('err', 'Lien incomplet : ouvrez directement le lien reçu par e-mail, ou demandez-en un nouveau depuis la page de connexion.');
  if (kind === 'reset') { setTimeout(() => $('#resetPass').focus(), 50); return; }
  linkMsg('ok', 'Vérification en cours…');
  try {
    const data = await authRequest('/api/auth/verify', { token });
    State.linkToken = '';
    if (State.user && data.user) writeSession(data.user);
    renderAccountBox();
    linkMsg('ok', 'Merci, votre adresse e-mail est confirmée.');
  } catch (err) { linkMsg('err', err.message || 'Ce lien est invalide ou a expiré.'); }
}
async function doReset(e) {
  e.preventDefault();
  const p1 = $('#resetPass').value, p2 = $('#resetPass2').value;
  if (p1.length < PASSWORD_MIN) return linkMsg('err', `Utilisez au moins ${PASSWORD_MIN} caractères.`);
  if (p1 !== p2) return linkMsg('err', 'Les deux mots de passe ne correspondent pas.');
  const btn = $('#formReset button[type="submit"]');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Enregistrement…';
  try {
    const data = await authRequest('/api/auth/reset', { token: State.linkToken, password: p1 });
    State.linkToken = ''; $('#resetPass').value = ''; $('#resetPass2').value = '';
    await afterAuth(data.user, false);
    toast('Mot de passe modifié. Vos autres sessions ont été fermées.', 'ok');
  } catch (err) { linkMsg('err', err.message || 'Impossible de modifier le mot de passe.'); }
  finally { btn.disabled = false; btn.textContent = 'Enregistrer le mot de passe'; }
}
async function resendVerification(btn) {
  btn.disabled = true;
  try { await authRequest('/api/auth/resend-verification', {}); toast('E-mail de confirmation renvoyé. Pensez à vérifier vos courriers indésirables.', 'ok'); }
  catch (err) { toast(err.message || 'Envoi impossible pour le moment.', 'err'); }
  finally { btn.disabled = false; }
}

async function signOut() {
  let serverOk = true;
  if (FEATURES.auth) {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', auth: true, timeout: 6000 });
    } catch (err) {
      serverOk = err.kind === 'auth';
    }
  }
  clearSession();
  clearAccountCache();
  refreshAuthUI();
  navigate('/');
  toast(serverOk ? 'Vous êtes déconnecté. Vos données restent dans votre compte.' : 'Déconnecté localement : le serveur n’a pas répondu.', serverOk ? 'ok' : 'err');
}

function openDeleteAccount() {
  openLegalModal('Supprimer mon compte', `
    <p>La suppression est <strong>immédiate et définitive</strong> : compte, favoris, suivi, recherches et alertes seront effacés de nos serveurs.</p>
    <p>Pensez à <button type="button" class="btn btn-ghost btn-sm" data-action="export-data" style="padding:0 4px;min-height:0;text-decoration:underline">exporter vos données</button> avant.</p>
    <form id="deleteForm" novalidate>
      <div class="auth-err" id="deleteErr" role="alert"></div>
      <div class="form-group"><label class="form-label" for="deletePass">Confirmez avec votre mot de passe</label><input class="form-input" type="password" id="deletePass" autocomplete="current-password" required></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-danger" type="submit">Supprimer définitivement</button><button class="btn btn-ghost" type="button" data-close="legalModal">Annuler</button></div>
    </form>`);
  $$('#legalBody [data-close]').forEach(el => on(el, 'click', () => closeModal('legalModal')));
  on($('#deleteForm'), 'submit', async e => {
    e.preventDefault();
    const err = $('#deleteErr');
    err.classList.remove('show');
    const password = $('#deletePass').value;
    if (!password) { err.textContent = 'Mot de passe requis.'; err.classList.add('show'); return; }
    const btn = $('#deleteForm button[type="submit"]');
    btn.disabled = true;
    try {
      await authRequest('/api/auth/delete', { password });
      closeModal('legalModal');
      clearSession();
      clearAccountCache();
      refreshAuthUI();
      navigate('/');
      toast('Votre compte et toutes vos données ont été supprimés.', 'ok');
    } catch (ex) {
      err.textContent = ex.message || 'Suppression impossible.';
      err.classList.add('show');
      btn.disabled = false;
    }
  });
  setTimeout(() => $('#deletePass')?.focus(), 60);
}

async function exportData() {
  let payload;
  if (remoteOn()) {
    payload = await remote('/api/me/export');
    if (!payload) return;
  } else {
    payload = {
      exportedAt: new Date().toISOString(), source: 'appareil',
      profile: State.profile, favorites: [...State.saved].map(id => ({ jobId: id, job: jobSnapshot(findJob(id)) })),
      pipeline: State.kanban, history: State.history, alerts: State.alerts, searches: State.searches, cv: State.cv,
    };
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'talentpulse-mes-donnees.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Export téléchargé', 'ok');
}
// ─── MATCHING (score de compatibilité profil ↔ offre) ──────────────
function getProfileSkillSet() {
  const profSkills = (State.profile.skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const cvSkills = (State.cv?.skills || []).map(s => s.toLowerCase());
  return [...new Set([...profSkills, ...cvSkills])];
}

// Score pondéré : compétences (profil + CV) 50% · titre 30% · ville 10% · contrat préféré 10%
function matchScore(job) {
  const skills = getProfileSkillSet();
  const title  = (State.profile.title || '').toLowerCase();
  const city   = (State.profile.city || '').toLowerCase();
  const prefContract = (State.profile.contract || '').toLowerCase();
  if (!skills.length && !title) return null; // pas assez de profil pour matcher
  const hay = (job.title + ' ' + (job.desc || '') + ' ' + job.company + ' ' + (job.competencesReq || '')).toLowerCase();
  let score = 0, weight = 0;
  if (skills.length) {
    weight += 50;
    const hits = skills.filter(s => s && hay.includes(s)).length;
    score += Math.min(1, hits / skills.length) * 50;
  }
  if (title) {
    weight += 30;
    const words = title.split(/\s+/).filter(w => w.length > 3);
    if (words.some(w => hay.includes(w))) score += 30;
  }
  if (city && job.city) {
    weight += 10;
    if (job.city.toLowerCase().includes(city)) score += 10;
  }
  if (prefContract && job.contract) {
    weight += 10;
    if (job.contract.toLowerCase().includes(prefContract)) score += 10;
  }
  if (!weight) return null;
  return Math.round(score / weight * 100);
}

function matchLabel(score) { return score >= 70 ? 'Très compatible' : score >= 40 ? 'Compatible' : 'Peu compatible'; }

function matchBadge(score) {
  if (score === null) return '';
  const cls = score >= 70 ? 'match-high' : score >= 40 ? 'match-mid' : 'match-low';
  return `<span class="match-badge ${cls}">${icon('target')} ${matchLabel(score)} (${score}%)</span>`;
}

// ─── 6. JOBS ──────────────────────────────────────────────────────
// /api/jobs agrège France Travail + Adzuna, résout le lieu (ville -> code INSEE),
// applique les filtres côté serveur et pagine (page=N). Une seule requête active à la fois :
// toute nouvelle recherche annule la précédente (AbortController + numéro de requête).
const DATE_LABELS = { '1': '24 dernières heures', '7': '7 derniers jours', '31': '30 derniers jours' };

function buildJobsQuery(params, page) {
  const f = State.filters;
  const qs = new URLSearchParams();
  if (params.kw) qs.set('motsCles', params.kw);
  if (params.city) qs.set('lieu', params.city);
  if (State.filter && State.filter !== 'all') qs.set('contrat', State.filter);
  if (f.datePosted) qs.set('publie', f.datePosted);
  if (f.experience) qs.set('experience', f.experience);
  if (f.niveauEtudes) qs.set('niveau', f.niveauEtudes);
  if (f.tempsPlein) qs.set('temps', f.tempsPlein);
  if (f.salaireMin) qs.set('salaireMin', f.salaireMin);
  if (State.sort === 'recent') qs.set('tri', 'date');
  qs.set('page', String(page || 1));
  return qs;
}

async function loadJobs(params = {}, { append = false } = {}) {
  const requestId = ++jobsRequestSeq;
  if (jobsAbort) jobsAbort.abort();
  const ctrl = new AbortController();
  jobsAbort = ctrl;
  const list = $('#jobsList');
  const page = append ? (State.apiPage || 1) + 1 : 1;
  if (!append) {
    State.lastSearch = { kw: params.kw || '', city: params.city || '' };
    const fl = $('#filterLocation'); if (fl && document.activeElement !== fl) fl.value = State.lastSearch.city;
    list.innerHTML = '<p class="sr-only">Chargement des offres…</p>' + Array(5).fill('<div class="skel-card" aria-hidden="true"><div class="skel av"></div><div class="skel-lines"><div class="skel" style="width:62%;height:16px"></div><div class="skel" style="width:40%"></div><div class="skel" style="width:30%"></div><div style="display:flex;gap:6px;margin-top:6px"><div class="skel" style="width:56px;height:24px;border-radius:99px"></div><div class="skel" style="width:96px;height:24px;border-radius:99px"></div></div></div></div>').join('');
    $('#jobsCount').textContent = 'Recherche en cours…';
    list.setAttribute('aria-busy', 'true');
    $('#jobsMore').innerHTML = '';
    $('#jobsNotice').innerHTML = '';
    const header = $('#jobsHeader');
    const ssr = getSsr();
    const onSsr = !!ssr && searchPath(params) === ssr.path;
    toggleSeoBlocks(onSsr);
    header.textContent = onSsr ? ssr.h1 : (params.kw || params.city) ? `${params.kw ? 'Offres «\u00a0' + params.kw + '\u00a0»' : 'Offres'}${params.city ? ' à ' + params.city : ''}` : 'Offres d’emploi en France';
    const rk = $('#rsKw'), rc = $('#rsCity');
    if (rk && document.activeElement !== rk) rk.value = params.kw || '';
    if (rc && document.activeElement !== rc) rc.value = params.city || '';
  } else {
    const btn = $('#jobsMoreBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Chargement…'; }
  }

  let data = null, netError = null;
  try {
    data = await apiFetch(`${API}?${buildJobsQuery(params, page)}`, { signal: ctrl.signal, timeout: 15000 });
  } catch (err) {
    if (err.kind === 'aborted') return;
    netError = err;
  }
  if (requestId !== jobsRequestSeq) return; // une recherche plus récente a été lancée
  jobsAbort = null;
  list.setAttribute('aria-busy', 'false');

  const fresh = ((data && data.resultats) || []).map(parseAggregatedJob).filter(Boolean);
  if (append) {
    const known = new Set(State.jobs.map(j => j.id));
    State.jobs = State.jobs.concat(fresh.filter(j => !known.has(j.id)));
  } else {
    State.jobs = fresh;
  }
  if (!netError) {
    State.apiPage = page;
    State.total = data.total || 0;
    State.hasMore = !!data.hasMore && fresh.length > 0;
    State.resolvedLocation = data.location || null;
    State.sourceNotes = data.notes || null;
    // Lieu reconnu : on affiche son nom officiel (« saint denis 93 » -> « Saint-Denis (93) »)
    const disp = data.location && !data.location.approx && data.location.type !== 'unknown' ? data.location.display : '';
    if (!append && disp && params.city && disp !== params.city) {
      params.city = disp;
      State.lastSearch.city = disp;
      const header = $('#jobsHeader');
      if (!(getSsr() && searchPath(params) === getSsr().path)) header.textContent = `${params.kw ? 'Offres «\u00a0' + params.kw + '\u00a0»' : 'Offres'} à ${disp}`;
      for (const id of ['rsCity', 'searchCity', 'filterLocation']) { const el = $('#' + id); if (el && document.activeElement !== el) el.value = disp; }
      syncSearchRoute({ kw: params.kw || '', city: disp }, true);
    }
  } else if (!append) {
    State.total = 0; State.hasMore = false;
  }
  State.loadError = netError && !append ? netError.message : null;
  const partial = !!(data && data.errors);
  $('#envBanner')?.classList.toggle('show', !!netError || partial);
  if (netError && append) toast(netError.message, 'err');
  renderJobsNotice(params);
  renderJobs();
}

function renderJobsNotice(params) {
  const box = $('#jobsNotice');
  if (!box) return;
  const notes = [];
  const loc = State.resolvedLocation;
  if (params.city && loc) {
    if (loc.type === 'unknown') notes.push(`Lieu « ${esc(params.city)} » non reconnu : les offres France Travail affichées concernent toute la France. Essayez un nom de ville, un code postal ou un département.`);
    else if (loc.approx) notes.push(`Résultats pour <strong>${esc(loc.label)}</strong> (lieu le plus proche de « ${esc(params.city)} »).`);
    else if (loc.type === 'commune') notes.push(`Offres à <strong>${esc(loc.display || loc.label)}</strong> et dans un rayon de 10\u00a0km.`);
    else if (loc.type === 'arrondissement') notes.push(`Offres dans le <strong>${esc(loc.label)}</strong> et les arrondissements voisins.`);
    else if (loc.type === 'departement') notes.push(`Offres dans tout le département <strong>${esc(loc.label)}</strong>${loc.code ? ` (${esc(loc.code)})` : ''}.`);
    else if (loc.type === 'region') notes.push(`Offres dans toute la région <strong>${esc(loc.label)}</strong>.`);
  }
  if (State.sourceNotes && State.sourceNotes.adzuna && /France Travail/.test(State.sourceNotes.adzuna)) {
    notes.push('Filtres avancés actifs : seules les offres France Travail sont affichées.');
  }
  box.innerHTML = notes.map(n => `<div class="jobs-notice">${ICONS.info}<span>${n}</span></div>`).join('');
}

// Mappe le format normalisé renvoyé par /api/jobs
function parseAggregatedJob(j) {
  if (!j || !j.id || !j.title) return null;
  return {
    id: j.id,
    title: j.title,
    company: j.company || '',
    city: j.city || '',
    dept: j.dept || '',
    contract: j.contract || '',
    contractDetail: j.contractDetail || '',
    salary: j.salary || '',
    salaryMin: j.salaryMin ?? null,
    salaryMax: j.salaryMax ?? null,
    desc: j.desc || '',
    descIsExcerpt: !!j.descIsExcerpt,
    experience: j.exp || '',
    permis: j.permis || '',
    competencesReq: j.competences || '',
    qualites: j.qualites || '',
    horaires: j.horaires || '',
    langues: j.langues || '',
    niveauEtudes: j.niveauEtudes || '',
    avantages: j.avantages || '',
    tempsPlein: j.tempsPlein || '',
    url: j.url || '',
    posted: j.posted || '',
    updated: j.updated || '',
    logo: /^https:\/\/entreprise\.francetravail\.fr\//.test(j.logo || '') ? j.logo : '',
    source: j.source || '',
    sourceSite: j.sourceSite || j.source || '',
    otherLocations: j.otherLocations || 0,
    cat: j.cat || ''
  };
}

function getFilteredSorted() {
  const jobs = State.jobs.slice();
  if (State.sort === 'match') {
    jobs.sort((a, b) => (matchScore(b) ?? -1) - (matchScore(a) ?? -1));
  } else if (State.sort === 'salary') {
    jobs.sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
  }
  return jobs;
}

function fmtCount(n) { return Number(n || 0).toLocaleString('fr-FR').replace(/[\s\u00a0]/g, '\u202f'); }

function hasActiveFilters() {
  return State.filter !== 'all' || Object.values(State.filters).some(Boolean);
}

function renderJobs() {
  const list = $('#jobsList');
  const all = getFilteredSorted();
  const count = $('#jobsCount');
  if (count) {
    count.textContent = all.length
      ? (State.total > all.length ? `${fmtCount(State.total)} offres · ${fmtCount(all.length)} affichées` : `${fmtCount(all.length)} offre${all.length > 1 ? 's' : ''}`)
      : (State.loadError ? '' : '0 offre');
  }

  if (!all.length) {
    const s = State.lastSearch || {};
    if (State.loadError) {
      list.innerHTML = `<div class="empty error" role="alert">
        <div class="empty-icon">${ICONS.alert}</div>
        <div class="empty-title">Impossible de charger les offres</div>
        <p>${esc(State.loadError)} Vos favoris et votre suivi restent accessibles dans Mon espace.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" id="jobsRetry" type="button">${icon('refresh')} Réessayer</button>
          <a class="btn btn-outline" href="/mon-espace" data-nav="profile">Ouvrir Mon espace</a>
        </div>
      </div>`;
      on($('#jobsRetry'), 'click', () => loadJobs(State.lastSearch || {}));
    } else {
      const actions = [];
      if (hasActiveFilters()) actions.push('<button class="btn btn-primary" type="button" data-empty="filters">Retirer les filtres</button>');
      if (s.city) actions.push('<button class="btn btn-outline" type="button" data-empty="france">Chercher dans toute la France</button>');
      if (s.kw) actions.push('<button class="btn btn-ghost" type="button" data-empty="all">Voir toutes les offres</button>');
      list.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICONS.search}</div>
        <div class="empty-title">Aucune offre ne correspond${s.kw ? ` à «\u00a0${esc(s.kw)}\u00a0»` : ''}${s.city ? ` à ${esc(s.city)}` : ''}</div>
        <ul><li>Vérifiez l’orthographe ou essayez un intitulé plus courant</li><li>Élargissez la zone géographique</li>${hasActiveFilters() ? '<li>Retirez un ou plusieurs filtres</li>' : ''}</ul>
        ${actions.length ? `<div class="empty-actions">${actions.join('')}</div>` : ''}
      </div>`;
      $$('#jobsList [data-empty]').forEach(b => on(b, 'click', () => {
        const k = b.dataset.empty;
        if (k === 'filters') { resetFilters(); return; }
        runSearch(k === 'france' ? s.kw : '', '');
      }));
    }
    bindNavLinks(list);
    $('#jobsMore').innerHTML = '';
    renderContractChecklist();
    return;
  }

  list.innerHTML = all.map(jobCard).join('');
  bindJobCards(list);
  renderLoadMore(all.length);
  renderContractChecklist();
}

function bindJobCards(root, { onSave } = {}) {
  $$('.job-link', root).forEach(a => on(a, 'click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    openDetail(a.dataset.id);
  }));
  $$('.save-btn', root).forEach(el => on(el, 'click', e => {
    e.stopPropagation();
    toggleSave(el.dataset.id);
    if (onSave) onSave();
  }));
  $$('.share-btn', root).forEach(el => on(el, 'click', e => { e.stopPropagation(); shareJob(el.dataset.share); }));
}

function renderLoadMore(shown) {
  const wrap = $('#jobsMore');
  if (!wrap) return;
  const pct = State.total ? Math.min(100, Math.round(shown / State.total * 100)) : 100;
  if (!State.hasMore) {
    wrap.innerHTML = shown && State.total ? `<div class="jobs-more-meta">Vous avez vu toutes les offres disponibles pour cette recherche.</div>` : '';
    return;
  }
  wrap.innerHTML = `<div class="jobs-more-meta">${fmtCount(shown)} offres affichées sur ${fmtCount(State.total)}</div>
    <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
    <button class="btn btn-outline btn-lg" id="jobsMoreBtn" type="button">Charger plus d’offres</button>`;
  on($('#jobsMoreBtn'), 'click', () => loadJobs(State.lastSearch || {}, { append: true }));
}

function companyLabel(j) {
  return j.company ? esc(j.company) : '<span class="muted">Entreprise non communiquée</span>';
}

function jobCard(j) {
  const saved = State.saved.has(j.id);
  const tracked = State.applied.has(j.id);
  const viewed = State.viewed.has(j.id);
  const loc = j.city ? `${j.city}${j.dept && !String(j.city).includes(j.dept) ? ' (' + j.dept + ')' : ''}` : '';
  const when = relativeDate(j.posted);
  const name = j.company || j.title || '?';
  const fresh = when === "Aujourd'hui" || when === 'Il y a 1 jour';
  return `<article class="job${viewed ? ' viewed' : ''}" data-id="${esc(j.id)}">
    ${avatarHtml(j, name)}
    <div class="job-main">
      <h2 class="job-title"><a class="job-link" href="/offre/${encodeURIComponent(j.id)}" data-id="${esc(j.id)}">${esc(j.title)}</a></h2>
      <div class="job-co"><span>${companyLabel(j)}</span>${loc ? `<span class="sep" aria-hidden="true">•</span><span class="job-loc">${ICONS.location}${esc(loc)}</span>` : ''}</div>
    </div>
    <div class="job-actions">
      <button class="share-btn" type="button" data-share="${esc(j.id)}" aria-label="Partager l’offre ${esc(j.title)}">${ICONS.share}</button>
      <button class="save-btn ${saved ? 'saved' : ''}" type="button" data-id="${esc(j.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${esc(j.title)}">${SVG_BOOKMARK(saved)}</button>
    </div>
    <div class="job-meta">
      ${j.contract ? `<span class="tag tag-brand">${esc(j.contract)}</span>` : ''}
      ${j.salary ? `<span class="tag job-sal">${icon('salary')}${esc(j.salary)}</span>` : ''}
      ${j.experience ? `<span class="tag">${esc(j.experience)}</span>` : ''}
      ${j.otherLocations ? `<span class="tag">+${j.otherLocations} autre${j.otherLocations > 1 ? 's' : ''} lieu${j.otherLocations > 1 ? 'x' : ''}</span>` : ''}
      ${matchBadge(matchScore(j))}
    </div>
    <div class="job-foot">
      <div class="job-foot-left">
        ${j.source === 'Adzuna' ? adzunaAttribution() : j.source ? `<span class="src ${sourceClass(j.source)}">${sourceIcon(j.source)}${esc(j.source)}</span>` : ''}
        ${when ? `<span class="job-time"${fresh ? ' style="color:var(--ok);font-weight:600"' : ''}>${fresh ? 'Nouveau · ' : ''}${esc(when)}</span>` : ''}
      </div>
      ${tracked ? `<span class="tracked-badge">${ICONS.check}Suivie</span>` : viewed ? '<span>Déjà consultée</span>' : ''}
    </div>
  </article>`;
}

function toggleSave(id) {
  if (State.saved.has(id)) {
    State.saved.delete(id);
    toast('Retiré des favoris');
    if (validJobId(id)) remote('/api/me/favorites?jobId=' + encodeURIComponent(id), { method: 'DELETE' });
  } else {
    State.saved.add(id);
    const job = findJob(id);
    if (job) rememberJob(job);
    toast('Ajouté aux favoris', 'ok');
    if (validJobId(id)) remote('/api/me/favorites', { method: 'POST', body: { jobId: id, job: jobSnapshot(job) } });
  }
  syncState();
  if ($('#page-jobs').classList.contains('active')) renderJobs();
  const btn = document.querySelector(`.save-btn[data-id="${CSS.escape(id)}"]`);
  if (btn && State.saved.has(id)) { btn.classList.add('pop'); }
  if (State.currentJobId === id) refreshDetailSaveBtn();
}

// Les favoris doivent survivre à une nouvelle recherche : on garde un instantané local des offres.
function rememberJob(job) {
  State.jobCache[job.id] = { ...job, desc: (job.desc || '').slice(0, 4000) };
  const ids = Object.keys(State.jobCache);
  const keep = new Set([...State.saved, ...State.applied]);
  if (ids.length > 200) ids.forEach(k => { if (!keep.has(k)) delete State.jobCache[k]; });
  safeSet('tp_jobcache', State.jobCache);
}
function findJob(id) { return State.jobs.find(x => x.id === id) || State.jobCache[id] || null; }

// ─── 7. DETAIL PANEL ──────────────────────────────────────────────
function detailSection(title, content) {
  if (!content) return '';
  return `<section class="detail-section"><h2>${title}</h2><p>${esc(content)}</p></section>`;
}
const FACT_ICONS = { 'Lieu': 'location', 'Type de contrat': 'file', 'Salaire': 'salary', 'Temps de travail': 'clock', 'Horaires': 'clock', 'Expérience demandée': 'briefcase', 'Permis': 'car', 'Langues': 'message', 'Formation': 'education', 'Publiée': 'calendar' };

function trackBtnLabel(t) { return t ? `${icon('check')} Dans le suivi` : `${icon('plus')} Ajouter au suivi`; }

function openDetail(id, { push = true } = {}) {
  const j = findJob(id);
  if (!j) return;
  if (push && !routeHandling) {
    const path = '/offre/' + encodeURIComponent(j.id);
    updatePageMeta(j.title + (j.company ? ' — ' + j.company : '') + ' | TalentPulse', j.title + (j.company ? ' chez ' + j.company : '') + (j.city ? ' à ' + j.city : '') + '.', path);
    rememberScroll();
    window.history.pushState({ talentpulse: true, offerId: j.id }, '', path);
  }
  State.currentJobId = id;
  State.viewed.add(id);
  syncState();
  const tracked = State.applied.has(id);
  const site = j.sourceSite || j.source || 'le site d’origine';
  const name = j.company || j.title || '?';
  const when = relativeDate(j.posted);

  const facts = [
    ['Lieu', j.city ? j.city + (j.dept && !String(j.city).includes(j.dept) ? ' (' + j.dept + ')' : '') : ''],
    ['Type de contrat', [j.contract, j.contractDetail && j.contractDetail !== j.contract ? j.contractDetail : ''].filter(Boolean).join(' — ')],
    ['Salaire', j.salary],
    ['Temps de travail', j.tempsPlein],
    ['Horaires', j.horaires],
    ['Expérience demandée', j.experience],
    ['Permis', j.permis],
    ['Langues', j.langues],
    ['Formation', j.niveauEtudes],
    ['Publiée', fmtDate(j.posted)],
    ['Mise à jour', j.updated && fmtDate(j.updated) !== fmtDate(j.posted) ? fmtDate(j.updated) : ''],
  ].filter(([, v]) => v && String(v).trim());

  $('#detailBody').innerHTML = `
    <div class="detail-hero">
      ${avatarHtml(j, name)}
      <div style="min-width:0">
        <h2 class="detail-title" id="detailTitle">${esc(j.title)}</h2>
        <div class="detail-co">${companyLabel(j)}${j.city ? ' · ' + esc(j.city) : ''}</div>
      </div>
    </div>
    <div class="badge-row">
      ${j.contract ? `<span class="tag tag-brand">${esc(j.contract)}</span>` : ''}
      ${j.salary ? `<span class="tag job-sal">${icon('salary')}${esc(j.salary)}</span>` : ''}
      ${j.source && j.source !== 'Adzuna' ? `<span class="tag"><span class="src ${sourceClass(j.source)}">${sourceIcon(j.source)}Source : ${esc(j.source)}</span></span>` : ''}
      ${when ? `<span class="tag">${icon('clock')}${esc(when)}</span>` : ''}
      ${j.otherLocations ? `<span class="tag">Aussi publiée dans ${j.otherLocations} autre${j.otherLocations > 1 ? 's' : ''} lieu${j.otherLocations > 1 ? 'x' : ''}</span>` : ''}
      ${matchBadge(matchScore(j))}
    </div>
    ${facts.length ? `<dl class="detail-grid">${facts.map(([k, v]) => `<div class="detail-grid-item"><dt class="k"><span class="ic" aria-hidden="true">${ICONS[FACT_ICONS[k]] || ICONS.info}</span>${k}</dt><dd class="v">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${detailSection(j.descIsExcerpt ? 'Extrait de l’annonce' : 'Description du poste', j.desc)}
    ${j.descIsExcerpt ? `<p class="excerpt-note">Adzuna ne fournit qu’un extrait : la description complète est sur le site d’origine.</p>` : ''}
    ${detailSection('Compétences demandées', j.competencesReq)}
    ${detailSection('Qualités professionnelles', j.qualites)}
    ${detailSection('Avantages et compléments de salaire', j.avantages)}
    ${j.source === 'Adzuna' ? `<p class="detail-attr">${adzunaAttribution()}</p>` : j.source === 'France Travail' ? `<p class="detail-attr">Source : France Travail${j.updated ? `, offre mise à jour le ${esc(fmtDate(j.updated))}` : ''}. Réutilisation soumise à la <a href="${FT_LICENCE_URL}" target="_blank" rel="noopener">licence de réutilisation des offres d’emploi de France Travail</a>.</p>` : ''}
    <p class="detail-note">${icon('info')}<span>TalentPulse n’envoie pas votre candidature : vous postulez directement sur ${esc(site)}. L’onglet « Suivi » de Mon espace est un aide-mémoire ${State.user ? 'synchronisé avec votre compte' : 'enregistré sur cet appareil'}.</span></p>`;

  $('#detailCta').innerHTML = `
    ${j.url ? `<a class="btn btn-primary btn-lg btn-view" id="detailView" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">Voir l’offre sur ${esc(site)} ${ICONS.external}<span class="sr-only">(nouvel onglet)</span></a>` : ''}
    <button class="btn btn-outline btn-lg" id="detailTrack" type="button" aria-pressed="${tracked}">${trackBtnLabel(tracked)}</button>
    <button class="btn btn-ghost btn-lg" id="detailLettre" type="button">${icon('document')} <span class="lbl-long">Préparer ma lettre</span><span class="lbl-short">Ma lettre</span></button>`;

  const panel = $('#detail');
  lastFocusBeforeDetail = document.activeElement;
  panel.classList.add('open');
  panel.removeAttribute('inert');
  $('#detailOverlay').classList.add('open');
  $('#detailScroll').scrollTop = 0;
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#detailBack')?.focus(), 50);
  refreshDetailSaveBtn();
  on($('#detailLettre'), 'click', () => {
    closeDetail();
    goToPage('lettre');
    $('#lettrePoste').value = j.title;
    $('#lettreEntreprise').value = j.company || '';
    State.lettreOffre = { title: clip(j.title, 200), company: clip(j.company, 160), desc: clip(j.desc, 4000) };
  });
  on($('#detailTrack'), 'click', () => toggleTrack(id));
  on($('#detailView'), 'click', () => historyAdd(j, 'viewed'));
}

function closeDetail({ syncRoute = true, restoreFocus = true } = {}) {
  const panel = $('#detail');
  const wasOpen = panel.classList.contains('open');
  panel.classList.remove('open');
  panel.setAttribute('inert', '');
  $('#detailOverlay')?.classList.remove('open');
  document.body.classList.remove('no-scroll');
  State.currentJobId = null;
  if (syncRoute && window.location.pathname.startsWith('/offre/')) {
    const fallback = State.lastSearch && (State.lastSearch.kw || State.lastSearch.city) ? searchPath(State.lastSearch) : '/offres/emploi';
    window.history.replaceState({ talentpulse: true }, '', fallback);
    updatePageMeta('Offres d’emploi — TalentPulse', 'Recherchez parmi les offres France Travail et Adzuna avec TalentPulse.', fallback);
  }
  if (wasOpen && restoreFocus && lastFocusBeforeDetail && document.contains(lastFocusBeforeDetail)) lastFocusBeforeDetail.focus();
}

function refreshDetailSaveBtn() {
  const id = State.currentJobId;
  const btn = $('#detailSave');
  if (!btn) return;
  const saved = State.saved.has(id);
  btn.classList.toggle('saved', saved);
  btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  btn.setAttribute('aria-label', saved ? 'Retirer des favoris' : 'Ajouter aux favoris');
  btn.innerHTML = SVG_BOOKMARK(saved);
}

// ─── SUIVI (anciennement « Postuler ») ─────────────────────────────
// Aucune candidature n'est envoyée : on ajoute l'offre au tableau de suivi local.
function toggleTrack(id) {
  const job = findJob(id);
  if (!job) return;
  if (State.applied.has(id)) {
    State.applied.delete(id);
    kanbanDelete(id, { silent: true });
    toast('Offre retirée de votre suivi');
  } else {
    State.applied.add(id);
    rememberJob(job);
    kanbanAdd(job, 'todo');
    historyAdd(job, 'todo');
    toast('Ajoutée à votre suivi (colonne « À postuler »)', 'ok');
  }
  syncState();
  const btn = $('#detailTrack');
  if (btn) { const t = State.applied.has(id); btn.innerHTML = trackBtnLabel(t); btn.setAttribute('aria-pressed', String(t)); }
  if ($('#page-jobs').classList.contains('active')) renderJobs();
}
// ─── 8. LETTRE ────────────────────────────────────────────────────
function renderLettreMode() {
  const note = $('#lettreModeNote');
  if (!note) return;
  note.className = FEATURES.aiLetter ? 'notice notice-brand' : 'notice';
  note.innerHTML = FEATURES.aiLetter
    ? `${ICONS.sparkles}<span><strong>Rédaction assistée par IA.</strong> Le texte est généré à partir de vos informations uniquement : relisez-le, vérifiez chaque affirmation et personnalisez-le avant envoi.</span>`
    : `${ICONS.info}<span><span class="soon-badge">IA bientôt</span> En attendant, TalentPulse génère une trame classique, à relire et adapter.</span>`;
  $('#lettreGen').textContent = FEATURES.aiLetter ? 'Générer ma lettre avec l’IA' : 'Générer ma trame de lettre';
}

async function generateLettre() {
  const poste = $('#lettrePoste').value.trim();
  const ent   = $('#lettreEntreprise').value.trim();
  const atouts = $('#lettreAtouts').value.trim();
  if (!poste || !ent) { toast('Indiquez le poste et l’entreprise', 'err'); (!poste ? $('#lettrePoste') : $('#lettreEntreprise')).focus(); return; }
  if (!FEATURES.aiLetter) {
    showLettreResult(localLettre(poste, ent, atouts), 'template');
    toast('Trame générée : relisez-la et personnalisez-la avant envoi.', 'ok');
    return;
  }
  const btn = $('#lettreGen');
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Rédaction en cours…';
  btn.disabled = true;
  const offre = State.lettreOffre && State.lettreOffre.title === poste ? State.lettreOffre : undefined;
  try {
    const data = await apiFetch('/api/lettre', { method: 'POST', auth: true, timeout: 30000, body: { poste: clip(poste, 160), entreprise: clip(ent, 160), atouts: clip(atouts, 1500), profile: profilePayload(), offre } });
    if (!data.lettre) throw new ApiError('Réponse vide.', 'server');
    showLettreResult(data.lettre, data.source === 'ai' ? 'ai' : 'template');
    if (data.notice) toast(data.notice, 'err');
  } catch (err) {
    showLettreResult(localLettre(poste, ent, atouts), 'template');
    toast(err.status === 429 ? err.message : 'Service IA indisponible : trame classique générée.', 'err');
  }
  btn.disabled = false;
  renderLettreMode();
}

function localLettre(poste, ent, atouts) {
  const p = State.profile || {};
  const signature = [p.prenom || State.user?.prenom || '', p.nom || ''].filter(Boolean).join(' ') || '[Prénom Nom]';
  return `Madame, Monsieur,

Votre annonce pour le poste de ${poste} au sein de ${ent} a retenu toute mon attention. [Expliquez en une phrase ce qui vous attire dans cette entreprise ou ce poste.]

${atouts ? `Mes atouts pour ce poste : ${atouts}.` : '[Présentez en deux ou trois phrases votre expérience et vos compétences en lien avec l’annonce.]'}

Je serais heureux(se) d'échanger avec vous sur la manière dont mon profil peut contribuer à vos projets. Je me tiens à votre disposition pour un entretien à votre convenance.

Dans l'attente de votre retour, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

${signature}`;
}
function showLettreResult(text, source) {
  $('#lettreResult').textContent = text;
  $('#lettreResult').classList.remove('hide');
  $('#lettreActions').classList.remove('hide');
  $('#lettreEmpty').classList.add('hide');
  $('#lettreSource').innerHTML = source === 'ai' ? `<span class="tag tag-brand">${icon('sparkles')} Rédigée par IA, à relire</span>` : '<span class="tag">Modèle à personnaliser</span>';
}

function copyLettre() {
  navigator.clipboard.writeText($('#lettreResult').textContent).then(
    () => toast('Lettre copiée'),
    () => toast('Erreur de copie')
  );
}

function resetLettre() {
  $('#lettrePoste').value = '';
  $('#lettreEntreprise').value = '';
  $('#lettreAtouts').value = '';
  $('#lettreResult').classList.add('hide');
  $('#lettreActions').classList.add('hide');
  $('#lettreEmpty').classList.remove('hide');
  $('#lettreSource').innerHTML = '';
  State.lettreOffre = null;
}

// ─── 9. CONSEILS ──────────────────────────────────────────────────
let conseilsRendered = false;
function renderConseils() {
  if (conseilsRendered) return;
  conseilsRendered = true;
  $('#conseilsGrid').innerHTML = CONSEILS.map((c, i) => `
    <button class="conseil" type="button" data-i="${i}">
      <span class="conseil-icon" aria-hidden="true">${ICONS[c.icon]}</span>
      <span class="conseil-title">${esc(c.title)}</span>
      <span class="conseil-sub">${esc(c.body)}</span>
      <span class="conseil-more" aria-hidden="true">Lire le conseil →</span>
    </button>`).join('');
  $$('#conseilsGrid .conseil').forEach(el => on(el, 'click', () => {
    const c = CONSEILS[+el.dataset.i];
    openLegalModal(c.title, `<p>${esc(c.body)}</p>`);
  }));
}

// ─── 10. CATEGORIES (home) ────────────────────────────────────────
let catsRendered = false;
// Photo métier (StockSnap, CC0 : voir /img/CREDITS.md) : AVIF puis WebP, 360/640 px, chargement différé
const catPhoto = n => `<picture class="cat-photo" aria-hidden="true"><source type="image/avif" srcset="/img/metier-${n}-360.avif 360w, /img/metier-${n}-640.avif 640w" sizes="(min-width: 1200px) 270px, (min-width: 768px) 23vw, 46vw"><source type="image/webp" srcset="/img/metier-${n}-360.webp 360w, /img/metier-${n}-640.webp 640w" sizes="(min-width: 1200px) 270px, (min-width: 768px) 23vw, 46vw"><img src="/img/metier-${n}-360.webp" alt="" width="640" height="800" loading="lazy" decoding="async"></picture>`;
function renderCategories() {
  if (catsRendered) return;
  catsRendered = true;
  $('#categoriesGrid').innerHTML = CATEGORIES.map(c => `
    <a class="cat-card" href="${searchPath({ kw: c.q })}" data-q="${esc(c.q)}">
      ${catPhoto(c.img)}
      <span class="cat-go" aria-hidden="true">${ICONS.arrowUpRight}</span>
      <span class="cat-icon" aria-hidden="true">${ICONS[c.icon]}</span>
      <span class="cat-name">${esc(c.name)}</span>
      <span class="cat-count">${esc(c.sub)}</span>
    </a>`).join('');
  $$('#categoriesGrid .cat-card').forEach(el => on(el, 'click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    runSearch(el.dataset.q, '');
  }));
}

// ─── BANDEAU DÉFILANT ─────────────────────────────────────────────
// Infos utiles en continu : nombre d'offres en direct, dernières offres publiées, astuces.
// Pause au survol / au focus / par bouton (WCAG 2.2.2), immobile si « mouvement réduit ».
const Ticker = { count: null, offers: [], tips: null, started: false };
function renderTicker() {
  const track = $('#tickerTrack');
  if (!track) return;
  if (!Ticker.tips) Ticker.tips = [...track.children].filter(li => !li.hasAttribute('aria-hidden') && !li.dataset.live).map(li => li.outerHTML);
  const items = [];
  if (Ticker.count) items.push(`<li data-live="1"><svg class="i" aria-hidden="true"><use href="#i-trending-up"/></svg><span><span class="tk-num">${fmtCount(Ticker.count)}</span> offres disponibles en ce moment</span></li>`);
  const tips = Ticker.tips.slice();
  Ticker.offers.slice(0, 6).forEach((o, i) => {
    items.push(`<li data-live="1"><svg class="i" aria-hidden="true"><use href="#i-briefcase-business"/></svg><span><b>Nouvelle offre</b> · ${esc(o.title)}${o.city ? ` <span class="tk-mut">· ${esc(o.city)}</span>` : ''}</span></li>`);
    if (i % 2 === 1 && tips.length) items.push(tips.shift());
  });
  items.push(...tips);
  const html = items.join('');
  // Deux copies pour une boucle sans à-coup ; la copie est masquée aux lecteurs d'écran
  track.innerHTML = html + html.replace(/<li( data-live="1")?>/g, '<li aria-hidden="true">');
  requestAnimationFrame(() => {
    const w = track.scrollWidth / 2;
    track.style.setProperty('--tk-dur', Math.max(30, Math.round(w / 45)) + 's'); // ~45 px/s, lisible
  });
}
function initTicker() {
  const t = $('#ticker');
  if (!t || Ticker.started) return;
  Ticker.started = true;
  renderTicker();
  // Mouvement réduit : le bandeau devient une bande défilable à la main, donc atteignable au clavier
  const vp = $('.ticker-viewport', t), rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncVp = () => { if (rm.matches) { vp.tabIndex = 0; vp.setAttribute('role', 'group'); vp.setAttribute('aria-label', 'Informations (faites défiler horizontalement)'); } else { ['tabindex', 'role', 'aria-label'].forEach(a => vp.removeAttribute(a)); } };
  if (vp) { syncVp(); rm.addEventListener?.('change', syncVp); }
  const btn = $('#tickerToggle');
  on(btn, 'click', () => {
    const paused = t.classList.toggle('paused');
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', paused ? 'Reprendre le défilement du bandeau' : 'Mettre en pause le bandeau défilant');
  });
  // Dernières offres : après le chargement, sans retarder l'affichage
  const later = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
  later(async () => {
    try {
      const data = await apiFetch(`${API}?light=1&tri=date&source=ft`, { timeout: 10000 });
      Ticker.offers = (data.resultats || []).filter(o => o.title).map(o => ({ title: o.title.length > 70 ? o.title.slice(0, 68) + '…' : o.title, city: o.city || '' }));
      if (Ticker.offers.length) renderTicker();
    } catch { /* bandeau limité aux astuces */ }
  }, { timeout: 4000 });
}

let liveCountRequested = false;
async function loadLiveCount() {
  const el = $('#liveJobCount');
  // Uniquement quand l'accueil est affiché, et une seule fois par visite.
  if (!el || liveCountRequested) return;
  liveCountRequested = true;
  try {
    const data = await apiFetch(`${API}?count=1`, { timeout: 10000 });
    if (!data.total) throw new Error('no total');
    el.textContent = fmtCount(data.total);
    Ticker.count = data.total; renderTicker();
    const lbl = el.parentElement;
    if (lbl && data.totals) lbl.title = Object.entries(data.totals).map(([k, v]) => `${k === 'ft' ? 'France Travail' : 'Adzuna'} : ${fmtCount(v)}`).join(' · ');
  } catch {
    // Pas de chiffre inventé : on masque simplement la statistique.
    $('#liveJobStat')?.classList.add('hide');
  }
}
// ─── 11. PROFILE (« Mon espace », fonctionne sans compte) ─────────
function renderSyncPill() {
  const pill = $('#syncPill');
  if (!pill) return;
  const u = State.user;
  if (u) {
    const err = syncStatus === 'error', busy = syncStatus === 'syncing';
    pill.className = 'sync-pill' + (err ? '' : ' on');
    pill.innerHTML = `${err ? ICONS.alert : ICONS.cloud}${err ? 'Synchronisation en attente' : busy ? 'Synchronisation…' : 'Synchronisé'}`;
  } else {
    pill.className = 'sync-pill';
    pill.innerHTML = `${ICONS.device}Sur cet appareil uniquement`;
  }
}

function renderVerifyBanner() {
  const slot = $('#verifySlot');
  if (!slot) return;
  const u = State.user;
  const show = !!(u && FEATURES.accountEmails && u.emailVerified === false);
  slot.innerHTML = show ? `<div class="verify-banner" role="status">${ICONS.alert}<span><strong>Adresse e-mail à confirmer.</strong> Ouvrez le lien reçu par e-mail pour activer les alertes par e-mail et pouvoir récupérer votre compte.</span><button class="btn btn-outline btn-sm" type="button" id="resendVerifyBtn">Renvoyer l’e-mail</button></div>` : '';
  on($('#resendVerifyBtn'), 'click', e => resendVerification(e.currentTarget));
}
function renderAccountBox() {
  renderVerifyBanner();
  const box = $('#accountBox');
  if (!box) return;
  const u = State.user;
  if (u) {
    const since = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
    box.innerHTML = `<h2>Mon compte</h2>
      <div class="prof-display-row"><span class="k">E-mail</span><span class="v">${esc(u.email)}${FEATURES.accountEmails && u.emailVerified ? ' <span class="tag tag-ok">Confirmée</span>' : ''}</span></div>
      ${since ? `<div class="prof-display-row"><span class="k">Membre depuis</span><span class="v">${esc(since)}</span></div>` : ''}
      <div class="account-actions" style="margin-top:var(--sp-4)">
        <button class="btn btn-outline btn-block" id="signOutBtn" type="button">Se déconnecter</button>
        <button class="btn btn-danger btn-block" id="deleteAccountBtn" type="button">Supprimer mon compte</button>
      </div>`;
    on($('#signOutBtn'), 'click', signOut);

    on($('#deleteAccountBtn'), 'click', openDeleteAccount);
  } else if (FEATURES.auth) {
    box.innerHTML = `<h2>Synchroniser mon espace</h2>
      <p style="font-size:var(--fs-sm);margin-bottom:var(--sp-4)">Créez un compte gratuit pour retrouver vos favoris, votre suivi et vos recherches sur tous vos appareils. Les données de cet appareil seront importées automatiquement.</p>
      <a class="btn btn-primary btn-block" href="/connexion" id="accountCta">Créer un compte ou se connecter</a>`;
    on($('#accountCta'), 'click', e => { e.preventDefault(); goToPage('login'); switchAuthTab('up'); });
  } else {
    box.innerHTML = `<h2>Compte <span class="soon-badge">Bientôt disponible</span></h2>
      <p style="font-size:var(--fs-sm)">Pas besoin de compte : votre profil, vos favoris et votre suivi sont enregistrés dans ce navigateur. Les comptes permettront bientôt de les synchroniser entre vos appareils.</p>`;
  }
}

function renderProfile() {
  const u = State.user;
  const p = State.profile;
  const first = p.prenom || u?.prenom || '';
  const dispName = first ? first + (p.nom ? ' ' + p.nom : '') : 'Mon espace';
  $('#profAvatar').innerHTML = first[0] ? esc(first[0].toUpperCase()) : '<svg class="i" aria-hidden="true"><use href="#i-user"/></svg>';
  $('#profName').textContent = dispName;
  $('#profEmail').textContent = [p.title, u?.email].filter(Boolean).join(' · ') || 'Votre tableau de bord de recherche d’emploi';
  $('#statSaved').textContent = State.saved.size;
  $('#statApplied').textContent = State.applied.size;
  $('#statViewed').textContent = State.viewed.size;
  refreshAuthUI();
  renderSyncPill();
  renderAccountBox();
  renderProfileInfo();

  const savedJobs = [...State.saved].map(findJob).filter(Boolean);
  const sl = $('#savedList');
  if (savedJobs.length === 0) {
    sl.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS.bookmark}</div><div class="empty-title">Aucun favori pour le moment</div><p>Cliquez sur l’icône signet d’une offre pour la retrouver ici.</p><div class="empty-actions"><a class="btn btn-primary" href="/offres/emploi" data-nav="jobs">Parcourir les offres</a></div></div>`;
    bindNavLinks(sl);
  } else {
    sl.innerHTML = savedJobs.map(jobCard).join('');
    bindJobCards(sl, { onSave: renderProfile });
  }
  const active = $('.ptab.active')?.dataset.ptab;
  if (active === 'pipeline') renderKanban();
  if (active === 'alertes') renderAlerts();
}

function renderProfileInfo() {
  const p = State.profile;
  const u = State.user;
  const cvSkills = (State.cv?.skills || []).join(', ');
  const rows = [
    ['Prénom', p.prenom || u?.prenom || '—'],
    ['Nom', p.nom || '—'],
    ...(u ? [['Email', u.email]] : []),
    ['Titre', p.title || '—'],
    ['Ville', p.city || '—'],
    ['Contrat recherché', p.contract || 'Indifférent'],
    ['Compétences (profil)', p.skills || '—'],
    ['Compétences (CV)', cvSkills || '—'],
  ];
  $('#profDisplay').innerHTML = rows.map(([k, v]) =>
    `<div class="prof-display-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('');
}

function openProfileEdit() {
  const p = State.profile;
  const u = State.user;
  $('#pfPrenom').value = p.prenom || u?.prenom || '';
  $('#pfNom').value = p.nom || '';
  $('#pfTitle').value = p.title || '';
  $('#pfCity').value = p.city || '';
  $('#pfContract').value = p.contract || '';
  $('#pfSkills').value = p.skills || '';
  $('#profDisplay').classList.add('hide');
  $('#profForm').classList.remove('hide');
  $('#profEditToggle').textContent = '';
  $('#pfPrenom').focus();
}

function closeProfileEdit() {
  $('#profDisplay').classList.remove('hide');
  $('#profForm').classList.add('hide');
  $('#profEditToggle').textContent = 'Modifier';
}

function saveProfileForm(e) {
  e.preventDefault();
  State.profile = {
    prenom:   $('#pfPrenom').value.trim(),
    nom:      $('#pfNom').value.trim(),
    title:    $('#pfTitle').value.trim(),
    city:     $('#pfCity').value.trim(),
    contract: $('#pfContract').value,
    skills:   $('#pfSkills').value.trim(),
  };
  syncProfile();
  if (State.profile.prenom && State.user) {
    State.user.prenom = State.profile.prenom;
    safeSet('tp_user', State.user);
    refreshAuthUI();
  }
  remote('/api/me/profile', { method: 'PUT', body: profilePayload() });
  closeProfileEdit();
  renderProfile();
  toast('Profil mis à jour', 'ok');
}

function clearLocalData() {
  if (!window.confirm(State.user ? 'Effacer les données de cet appareil ? Vous serez déconnecté ; les données de votre compte ne sont pas supprimées (utilisez « Supprimer mon compte » pour cela).' : 'Effacer définitivement votre profil, vos favoris, votre suivi, votre CV et vos recherches enregistrés sur cet appareil ?')) return;
  if (State.user && FEATURES.auth) apiFetch('/api/auth/logout', { method: 'POST', auth: true, timeout: 6000 }).catch(() => {});
  try {
    Object.keys(localStorage).filter(k => k.startsWith('tp_')).forEach(k => localStorage.removeItem(k));
  } catch {}
  State.user = null;
  State.profile = { prenom:'', nom:'', title:'', city:'', skills:'', contract:'' };
  State.saved = new Set(); State.applied = new Set(); State.viewed = new Set();
  State.kanban = {}; State.history = []; State.cv = null; State.alerts = []; State.searches = []; State.jobCache = {};
  State.filters = defaultFilters();
  updateFavBadge();
  refreshAuthUI();
  toast('Toutes vos données locales ont été effacées.', 'ok');
  if ($('#page-profile').classList.contains('active')) { renderProfile(); switchPTab('infos'); }
}
// ─── 12. MODALS ───────────────────────────────────────────────────
let lastFocusBeforeModal = null;
function openLegalModal(title, html) {
  lastFocusBeforeModal = document.activeElement;
  $('#legalTitle').textContent = title;
  $('#legalBody').innerHTML = frTypo(html);
  $('#legalModal').classList.add('open');
  setTimeout(() => $('#legalModal .modal-close')?.focus(), 30);
}
function openLegal(key) {
  const c = LEGAL_CONTENT[key];
  if (!c) return;
  openLegalModal(c.title, c.body);
}
function closeModal(id) {
  $('#' + id).classList.remove('open');
  if (lastFocusBeforeModal && document.contains(lastFocusBeforeModal)) lastFocusBeforeModal.focus();
}

// ─── 13. SEARCH ───────────────────────────────────────────────────
function closeAllAutocomplete() {
  $$('.ac-list.show').forEach(l => l.classList.remove('show'));
  $$('[role="combobox"]').forEach(i => i.setAttribute('aria-expanded', 'false'));
}

function runSearch(kwArg, cityArg) {
  closeAllAutocomplete();
  const kw = (kwArg !== undefined ? kwArg : $('#searchKw').value).trim();
  const city = (cityArg !== undefined ? cityArg : $('#searchCity').value).trim();
  $('#searchKw').value = kw;
  $('#searchCity').value = city;
  State.lastSearch = { kw, city };
  syncSearchRoute({ kw, city });
  showPage('jobs', { load: false }); // pas de chargement « générique » : la recherche part juste après
  loadJobs({ kw, city });
  const btn = $('#saveSearchBtn');
  if (btn) btn.style.display = (kw || city) ? 'inline-flex' : 'none';
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────
// Lieux : toutes les communes de France (geo.api.gouv.fr, en direct) + départements, régions et
// arrondissements de Paris/Lyon/Marseille (référentiel local /assets/geo-fr.js, instantané).
// Métiers : liste locale instantanée + appellations ROME de France Travail (/api/suggest).
const GEO = window.TP_GEO;
const expandSaint = t => String(t).replace(/\b(ste|st)\b\.?/gi, m => (/^ste/i.test(m) ? 'Sainte' : 'Saint'));
const geoMemo = new Map();
async function geoFetch(path, signal) {
  if (geoMemo.has(path)) return geoMemo.get(path);
  const r = await fetch('https://geo.api.gouv.fr' + path, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('geo ' + r.status);
  const data = await r.json();
  if (geoMemo.size > 200) geoMemo.clear();
  geoMemo.set(path, data);
  return data;
}
const TYPE_LABEL = { commune: 'Ville', arrondissement: 'Arrondissement', departement: 'Département', region: 'Région', metier: 'Métier' };
const TYPE_ICON = { commune: 'location', arrondissement: 'location', departement: 'map', region: 'globe', metier: 'briefcase' };
ICONS.map = '<svg class="i" aria-hidden="true"><use href="#i-map"/></svg>';
ICONS.globe = '<svg class="i" aria-hidden="true"><use href="#i-globe"/></svg>';

function placeItem(p) {
  if (p.type === 'arrondissement') return { type: p.type, label: p.label, value: p.display, sub: `${p.city} · ${p.cp}` };
  if (p.type === 'departement') return { type: p.type, label: p.label, value: p.label, sub: `${p.code} · ${GEO.regionName(p.region)}` };
  return { type: 'region', label: p.label, value: p.label, sub: 'Toute la région' };
}
const PLM_INSEE = { '75056': 'tous les arrondissements', '69123': 'tous les arrondissements', '13055': 'tous les arrondissements' };
function communeItem(c) {
  const dep = GEO.depByCode(c.codeDepartement);
  const cps = c.codesPostaux || [];
  const plm = PLM_INSEE[c.code];
  return {
    type: 'commune', label: c.nom,
    // Le département lève les homonymies (Saint-Denis 93 / 974) et voyage dans l'URL : /offres/…/saint-denis-93
    value: plm ? c.nom : `${c.nom} (${c.codeDepartement})`,
    sub: [dep ? `${dep.label} (${dep.code})` : c.codeDepartement, plm || (cps.length === 1 ? cps[0] : cps.length ? `${cps[0]}…` : '')].filter(Boolean).join(' · '),
  };
}
async function suggestLieux(q, signal) {
  const t = q.trim(), n = GEO.norm(t);
  const local = GEO.suggestPlaces(t, 6).map(placeItem);
  let communes = [];
  try {
    const f = 'fields=nom,code,codesPostaux,codeDepartement,population';
    if (/^\d{5}$/.test(n)) communes = await geoFetch(`/communes?codePostal=${n}&${f}`, signal);
    else if (n.length >= 2 && !/^\d+$/.test(n)) communes = await geoFetch(`/communes?nom=${encodeURIComponent(expandSaint(t))}&boost=population&${f}&limit=8`, signal);
  } catch (e) { if (e.name === 'AbortError') throw e; }
  const items = (communes || []).map(c => ({ ...communeItem(c), pop: c.population || 0 }));
  // Classement unique : exact > début du nom > reste ; à égalité, le lieu le plus « grand » d'abord
  // (Marseille avant la Marne, le Val-d'Oise avant Valence, Seine-Saint-Denis avant Saintry-sur-Seine)
  const WEIGHT = { region: 1e6, departement: 3e5, arrondissement: 5e5 };
  const isCp = /^\d{5}$/.test(n);
  const score = it => {
    if (isCp) return it.type === 'arrondissement' ? 0 : 1; // 75015 -> Paris 15e avant Paris
    const k = GEO.norm(it.label);
    if (k === n || GEO.norm(it.value) === n) return it.type === 'commune' && it.pop < 10000 ? 1 : 0; // Évry (89) ne passe pas devant Évry-Courcouronnes
    return k.startsWith(n) ? 1 : 2;
  };
  const all = [...local, ...items].map((it, i) => ({ it, s: score(it), w: it.pop ?? WEIGHT[it.type] ?? 0, i }))
    .sort((a, b) => a.s - b.s || b.w - a.w || a.i - b.i).map(x => x.it);
  const seen = new Set();
  return all.filter(it => { const k = it.type + '|' + it.value; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}

// Intitulé -> terme de recherche (« Serveur / Serveuse » -> « Serveur », « Gouvernant(e) » -> « Gouvernant »)
const searchTerm = label => String(label).replace(/\s*\/\s*[^\s,]+/g, '').replace(/\((e|ne|se|euse|trice|ère)\)/gi, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
function rankMetiers(list, q, limit) {
  const n = GEO.norm(q), words = n.split(' ').filter(Boolean);
  if (!words.length) return [];
  return list.map(label => [label, GEO.norm(label)]).filter(([, k]) => words.every(w => k.includes(w)))
    .map(([label, k]) => [k.startsWith(n) ? 0 : k.split(' ').some(w => w.startsWith(words[0])) ? 1 : 2, k.length, label])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(x => x[2]);
}
const metierItem = label => ({ type: 'metier', label, value: searchTerm(label), sub: '' });
function suggestMetiersLocal(q) { return rankMetiers(window.TP_METIERS || [], q, 8).map(metierItem); }
async function suggestMetiersRemote(q, signal) {
  const data = await fetch(`/api/suggest?type=metier&q=${encodeURIComponent(q)}`, { signal, headers: { Accept: 'application/json' } }).then(r => (r.ok ? r.json() : null)).catch(e => { if (e.name === 'AbortError') throw e; return null; });
  return data && Array.isArray(data.items) ? data.items.map(i => metierItem(i.label)) : [];
}

function highlight(label, q) {
  // Surligne la partie saisie, sans tenir compte des accents ni de la casse
  const n = GEO.norm(q);
  if (!n) return esc(label);
  const plain = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'`]/g, ' ');
  const flat = plain.replace(/[^a-z0-9]/g, ' ');
  if (label.length !== plain.length) return esc(label);
  let i = flat.indexOf(n), len = n.length;
  if (i < 0) { i = flat.indexOf(n.split(' ')[0]); len = n.split(' ')[0].length; }
  if (i < 0) return esc(label);
  return esc(label.slice(0, i)) + '<mark>' + esc(label.slice(i, i + len)) + '</mark>' + esc(label.slice(i + len));
}

function setupAutocomplete(inputId, listId, kind) {
  const input = $('#' + inputId);
  const list = $('#' + listId);
  if (!input || !list) return;
  let active = -1, seq = 0, timer = null, ctrl = null, current = [];
  const close = () => { list.classList.remove('show'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const choose = it => {
    input.value = it.value;
    close();
    input.dispatchEvent(new CustomEvent('tp:pick', { detail: it }));
  };

  function render(items, q) {
    current = items;
    if (!items.length || document.activeElement !== input) { close(); return; }
    // Valeur déjà choisie telle quelle (ex. après un clic) : inutile de masquer le bouton Rechercher.
    // « ile de france » tapé à la main reste proposé, pour confirmer « Île-de-France · Région ».
    if (items.length === 1 && items[0].value === q) { close(); return; }
    list.innerHTML = items.map((it, i) =>
      `<div class="ac-item" role="option" aria-selected="false" id="${listId}-opt-${i}" data-i="${i}">${ICONS[TYPE_ICON[it.type]] || ICONS.search}<span class="ac-main"><span class="ac-label">${highlight(it.label, q)}</span>${it.sub ? `<span class="ac-sub">${esc(it.sub)}</span>` : ''}</span>${kind === 'lieu' ? `<span class="ac-type">${TYPE_LABEL[it.type]}</span>` : ''}</div>`).join('');
    list.classList.add('show');
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    $$('.ac-item', list).forEach(el => on(el, 'mousedown', e => {
      e.preventDefault(); // garde le focus dans le champ
      choose(current[Number(el.dataset.i)]);
    }));
  }

  on(input, 'input', () => {
    const q = input.value.trim();
    const my = ++seq;
    clearTimeout(timer);
    if (ctrl) ctrl.abort();
    if (q.length < (kind === 'lieu' ? 1 : 2)) { close(); return; }
    // 1) Résultats locaux immédiats, 2) résultats distants après une courte pause de frappe
    const localItems = kind === 'lieu' ? GEO.suggestPlaces(q, 6).map(placeItem) : suggestMetiersLocal(q);
    if (localItems.length) render(localItems, q); else close(); // pas de liste périmée pendant le chargement
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        let items;
        if (kind === 'lieu') items = await suggestLieux(q, ctrl.signal);
        else {
          const remote = await suggestMetiersRemote(q, ctrl.signal);
          const seen = new Set();
          items = [...localItems, ...remote].filter(it => { const k = GEO.norm(it.value); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
        }
        if (my === seq) render(items, q);
      } catch { /* annulé : une saisie plus récente a pris le relais */ }
    }, kind === 'lieu' ? 160 : 220);
  });
  on(input, 'keydown', e => {
    if (e.key === 'Escape') { if (list.classList.contains('show')) { e.stopPropagation(); close(); } return; }
    if (e.key === 'Tab') { close(); return; }
    const items = $$('.ac-item', list);
    if (!items.length || !list.classList.contains('show')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(current[active]); return; }
    else if (e.key === 'Enter') { close(); return; }
    else return;
    items.forEach((it, i) => { it.classList.toggle('active', i === active); it.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
    items[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', items[active].id);
  });
  on(input, 'blur', () => setTimeout(close, 120));
  // Mobile : remonte le champ sous l'en-tête pour que le clavier ne masque pas les suggestions
  on(input, 'focus', () => {
    if (!window.matchMedia('(max-width: 767px)').matches || input.closest('.filter-drawer, .results-top')) return;
    setTimeout(() => {
      const top = input.getBoundingClientRect().top + window.scrollY - ($('.site-header')?.offsetHeight || 64) - 16;
      if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 250);
  });
}
// ═══ PROFILE TABS ═══
function switchPTab(tab) {
  $$('.ptab').forEach(t => { const on = t.dataset.ptab === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  $$('.ptab').forEach(t => t.setAttribute('tabindex', t.dataset.ptab === tab ? '0' : '-1'));
  $$('.ptab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
  if (tab === 'pipeline') renderKanban();
  if (tab === 'historique') renderHistory();
  if (tab === 'cv') renderCV();
  if (tab === 'alertes') renderAlerts();
}

// ═══ FEATURE 1 : KANBAN PIPELINE ═══
const KCOLS = [
  { key: 'todo',      label: 'À postuler',   color: '#64748B' },
  { key: 'applied',   label: 'J’ai postulé', color: '#2563EB' },
  { key: 'interview', label: 'Entretien',    color: '#D97706' },
  { key: 'offer',     label: 'Offre',        color: '#059669' },
  { key: 'rejected',  label: 'Refusé',       color: '#DC2626' },
];

function kanbanAdd(job, col = 'todo') {
  if (!State.kanban[col]) State.kanban[col] = [];
  // éviter doublons across colonnes
  KCOLS.forEach(c => {
    if (State.kanban[c.key]) State.kanban[c.key] = State.kanban[c.key].filter(k => k.id !== job.id);
  });
  State.kanban[col].push({ id: job.id, title: job.title, company: job.company || '', url: job.url || '' });
  safeSet('tp_kanban', State.kanban);
  if (validJobId(job.id)) remote('/api/me/pipeline', { method: 'PUT', body: { jobId: job.id, status: col, position: State.kanban[col].length - 1, job: jobSnapshot(job) } });
  renderKanban();
}

function kanbanMove(id, toCol) {
  let card = null;
  KCOLS.forEach(c => {
    if (State.kanban[c.key]) {
      const f = State.kanban[c.key].find(k => k.id === id);
      if (f) card = f;
      State.kanban[c.key] = State.kanban[c.key].filter(k => k.id !== id);
    }
  });
  if (card) {
    if (!State.kanban[toCol]) State.kanban[toCol] = [];
    State.kanban[toCol].push(card);
    if (validJobId(id)) remote('/api/me/pipeline', { method: 'PUT', body: { jobId: id, status: toCol, position: State.kanban[toCol].length - 1, job: {} } });
    const h = State.history.find(x => x.id === id);
    if (h) { h.status = toCol; safeSet('tp_history', State.history); }
    const label = KCOLS.find(c => c.key === toCol)?.label;
    announce(`Déplacée vers « ${label} »`);
  }
  safeSet('tp_kanban', State.kanban);
  renderKanban();
}

function kanbanDelete(id, { silent = false } = {}) {
  KCOLS.forEach(c => {
    if (State.kanban[c.key]) State.kanban[c.key] = State.kanban[c.key].filter(k => k.id !== id);
  });
  safeSet('tp_kanban', State.kanban);
  if (validJobId(id)) remote('/api/me/pipeline?jobId=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!silent) {
    State.applied.delete(id);
    syncState();
    toast('Retiré du suivi');
  }
  renderKanban();
}

function renderKanban() {
  const wrap = $('#kanban');
  if (!wrap) return;
  wrap.innerHTML = KCOLS.map(c => {
    const cards = State.kanban[c.key] || [];
    return `<section class="kcol" data-col="${c.key}" style="--kc:${c.color}" aria-label="${c.label} (${cards.length})">
      <div class="kcol-head"><h2 class="kcol-title">${c.label}</h2><span class="kcol-count" aria-hidden="true">${cards.length}</span></div>
      <div class="kcards" data-col="${c.key}">
        ${cards.length ? cards.map(k => kanbanCard(k, c.key)).join('') : `<div class="kempty">${c.key === 'todo' ? 'Ajoutez une offre depuis sa fiche' : 'Glissez une carte ici'}</div>`}
      </div>
    </section>`;
  }).join('');

  // Drag & drop
  $$('#kanban .kcard').forEach(card => {
    on(card, 'dragstart', e => { card.classList.add('dragging'); e.dataTransfer.setData('id', card.dataset.id); });
    on(card, 'dragend', () => card.classList.remove('dragging'));
  });
  $$('#kanban .kcol').forEach(col => {
    on(col, 'dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    on(col, 'dragleave', () => col.classList.remove('drag-over'));
    on(col, 'drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('id');
      if (id) kanbanMove(id, col.dataset.col);
    });
  });
  // Boutons mobiles (← →)
  $$('#kanban .kcard-btn').forEach(btn => on(btn, 'click', e => {
    e.stopPropagation();
    const { id, dir } = btn.dataset;
    if (dir === 'del') { kanbanDelete(id); return; }
    const cur = KCOLS.findIndex(c => (State.kanban[c.key] || []).some(k => k.id === id));
    const next = dir === 'next' ? cur + 1 : cur - 1;
    if (next >= 0 && next < KCOLS.length) kanbanMove(id, KCOLS[next].key);
  }));
}

function kanbanCard(k, col) {
  const idx = KCOLS.findIndex(c => c.key === col);
  const prev = KCOLS[idx - 1], next = KCOLS[idx + 1];
  return `<div class="kcard" draggable="true" data-id="${esc(k.id)}">
    <div class="kcard-title">${k.url ? `<a href="${esc(k.url)}" target="_blank" rel="noopener noreferrer">${esc(k.title)}<span class="sr-only"> (nouvel onglet)</span></a>` : esc(k.title)}</div>
    <div class="kcard-co">${esc(k.company || 'Entreprise non communiquée')}</div>
    <div class="kcard-actions">
      ${prev ? `<button class="kcard-btn" type="button" data-id="${esc(k.id)}" data-dir="prev" aria-label="Déplacer vers « ${prev.label} »">${ICONS.left}</button>` : ''}
      ${next ? `<button class="kcard-btn" type="button" data-id="${esc(k.id)}" data-dir="next" aria-label="Déplacer vers « ${next.label} »">${ICONS.right}</button>` : ''}
      <button class="kcard-btn" type="button" data-id="${esc(k.id)}" data-dir="del" aria-label="Retirer du suivi">${ICONS.x}</button>
    </div>
  </div>`;
}

// ═══ HISTORIQUE (aide-mémoire local) ═══
const HISTORY_STATUS = {
  viewed:    { label: 'Offre consultée', cls: '' },
  todo:      { label: 'À postuler', cls: '' },
  applied:   { label: 'Postulé', cls: 'hist-applied' },
  interview: { label: 'Entretien', cls: 'hist-interview' },
  offer:     { label: 'Offre reçue', cls: 'hist-offer' },
  rejected:  { label: 'Refusé', cls: 'hist-rejected' },
};
function historyAdd(job, status = 'todo') {
  const existing = State.history.find(h => h.id === job.id);
  if (existing) {
    if (status !== 'viewed' && existing.status === 'viewed') { existing.status = status; safeSet('tp_history', State.history); }
    return;
  }
  State.history.unshift({ id: job.id, title: job.title, company: job.company, url: job.url || '', status, date: Date.now() });
  State.history = State.history.slice(0, 200);
  safeSet('tp_history', State.history);
}

function historySetStatus(id, status) {
  const h = State.history.find(x => x.id === id);
  if (h) { h.status = status; safeSet('tp_history', State.history); renderHistory(); }
}

function renderHistory() {
  const wrap = $('#histList');
  if (!wrap) return;
  if (!State.history.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS.clipboard}</div><div class="empty-title">Aucun historique pour le moment</div><p>Les offres que vous ouvrez sur le site d’origine ou ajoutez à votre suivi apparaîtront ici.</p></div>`;
    return;
  }
  wrap.innerHTML = State.history.map(h => {
    const s = HISTORY_STATUS[h.status] || HISTORY_STATUS.todo;
    const d = new Date(h.date).toLocaleDateString('fr-FR');
    return `<div class="hist-item">
      <div class="hist-info">
        <div class="hist-title">${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.title)}<span class="sr-only"> (nouvel onglet)</span></a>` : esc(h.title)}</div>
        <div class="hist-co">${esc(h.company || 'Entreprise non communiquée')} · ${d}</div>
      </div>
      <label class="sr-only" for="hist-${esc(h.id)}">Statut</label>
      <select class="form-input hist-status ${s.cls}" id="hist-${esc(h.id)}" data-id="${esc(h.id)}">
        ${Object.entries(HISTORY_STATUS).map(([k, v]) => `<option value="${k}" ${k === h.status ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  $$('#histList select').forEach(sel => on(sel, 'change', () => historySetStatus(sel.dataset.id, sel.value)));
}

// ═══ CV : import et analyse locale (PDF texte ou TXT) ═══
const PDFJS_VERSION = '4.10.38';
let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
      return lib;
    }).catch(err => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}

async function extractPdfText(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

async function handleCVFile(file) {
  if (!file) return;
  const name = file.name || 'cv';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);
  const isTxt = file.type === 'text/plain' || /\.txt$/i.test(name);
  if (!isPdf && !isTxt) { toast('Format non pris en charge : importez un PDF ou un fichier .txt', 'err'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Fichier trop volumineux (10 Mo maximum)', 'err'); return; }
  $('#cvResult').innerHTML = '<p class="muted" style="font-size:var(--fs-sm);margin-top:12px" role="status"><span class="spinner" aria-hidden="true"></span> Analyse du CV…</p>';
  let text = '';
  try {
    text = isPdf ? await extractPdfText(file) : await file.text();
  } catch (err) {
    console.warn('CV non lisible', err);
    text = '';
  }
  const skills = extractSkills(text);
  State.cv = { name, size: Math.round(file.size / 1024), date: Date.now(), skills, readable: text.trim().length > 30 };
  safeSet('tp_cv', State.cv);
  if (skills.length && !State.profile.skills) {
    State.profile.skills = skills.join(', ');
    syncProfile();
  }
  renderCV();
  renderProfileInfo();
  toast(skills.length ? `CV analysé : ${skills.length} compétence(s) détectée(s)` : 'CV importé, mais aucune compétence détectée', skills.length ? 'ok' : 'err');
}

const SKILL_DICT = ['javascript','python','java','react','vue','angular','node','php','sql','html','css',
  'typescript','docker','kubernetes','aws','azure','git','agile','scrum','excel','photoshop','figma',
  'marketing','seo','vente','comptabilité','gestion','management','anglais','espagnol','allemand','communication',
  'wordpress','salesforce','sap','linux','c++','c#','ruby','swift','kotlin','flutter','service client','caces','haccp','permis b'];

function extractSkills(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  // mots entiers uniquement (évite « go » dans « logistique »)
  return SKILL_DICT.filter(s => new RegExp('(^|[^a-z0-9à-ÿ])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9à-ÿ])', 'i').test(low))
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
}

function renderCV() {
  const wrap = $('#cvResult');
  if (!wrap) return;
  if (!State.cv) { wrap.innerHTML = ''; return; }
  const cv = State.cv;
  const unreadable = cv.readable === false;
  wrap.innerHTML = `
    <div class="cv-file">
      <div class="cv-file-icon" aria-hidden="true"><svg class="i" width="20" height="20" aria-hidden="true"><use href="#i-file-text"/></svg></div>
      <div class="cv-file-info">
        <div class="cv-file-name">${esc(cv.name)}</div>
        <div class="cv-file-meta">${cv.size} Ko · analysé le ${new Date(cv.date).toLocaleDateString('fr-FR')} · non conservé</div>
      </div>
      <button class="alert-del" id="cvDelete" type="button">Supprimer</button>
    </div>
    ${cv.skills.length ? `<div class="cv-tags"><span class="muted" style="font-size:var(--fs-xs);width:100%;margin-bottom:4px">Compétences détectées :</span>${cv.skills.map(s => `<span class="tag tag-brand">${esc(s)}</span>`).join('')}</div>`
      : `<p class="muted" style="font-size:var(--fs-sm);margin-top:12px">${unreadable ? 'Le texte de ce fichier n’a pas pu être lu (PDF scanné ou protégé ?).' : 'Aucune compétence reconnue automatiquement.'} Renseignez vos compétences dans l’onglet Infos.</p>`}`;
  on($('#cvDelete'), 'click', () => {
    State.cv = null;
    try { localStorage.removeItem('tp_cv'); } catch {}
    renderCV();
    renderProfileInfo();
    toast('CV supprimé');
  });
}

// ═══ RECHERCHES ENREGISTRÉES (ex-« alertes ») ═══
function alertDeliveryOn() { return !!(State.user && (FEATURES.emailAlerts || FEATURES.whatsappAlerts)); }

function renderAlertForm() {
  const chE = $('#alertChEmail'), chW = $('#alertChWa');
  if (!chE) return;
  const emailOn = !!(State.user && FEATURES.emailAlerts), waOn = !!(State.user && FEATURES.whatsappAlerts);
  chE.disabled = !emailOn; chW.disabled = !waOn;
  if (!emailOn) chE.checked = false;
  if (!waOn) { chW.checked = false; $('#alertWaWrap').classList.add('hide'); }
  $$('#alertChannels [data-soon]').forEach(b => {
    const k = b.dataset.soon, enabled = FEATURES[k];
    b.classList.toggle('hide', enabled && !!State.user);
    b.textContent = enabled ? 'Avec un compte' : 'Bientôt';
  });
  const freq = $('#alertFreqNote');
  if (freq) freq.textContent = (emailOn || waOn) ? 'Envoi une fois par jour (vers 8 h) lorsqu’il y a de nouvelles offres. Désabonnement en un clic.' : '';
}

function renderAlerts() {
  renderAlertForm();
  const intro = $('#alertIntro');
  if (intro) {
    intro.innerHTML = alertDeliveryOn()
      ? `<div class="notice notice-brand" style="margin-bottom:var(--sp-4)">${ICONS.bell}<span><strong>Alertes actives.</strong> Recevez chaque jour les nouvelles offres de vos recherches ${FEATURES.emailAlerts ? 'par email' : ''}${FEATURES.emailAlerts && FEATURES.whatsappAlerts ? ' ou ' : ''}${FEATURES.whatsappAlerts ? 'sur WhatsApp' : ''}.</span></div>`
      : `<div class="soon-card"><h2>${icon('bell')} Alertes par email et WhatsApp <span class="soon-badge">${(FEATURES.emailAlerts || FEATURES.whatsappAlerts) ? 'Avec un compte' : 'Bientôt'}</span></h2><p>${(FEATURES.emailAlerts || FEATURES.whatsappAlerts) ? 'Connectez-vous pour recevoir automatiquement les nouvelles offres de vos recherches.' : 'L’envoi automatique de nouvelles offres arrive bientôt. En attendant, enregistrez vos recherches : elles se relancent en un clic.'}</p></div>`;
  }
  const wrap = $('#alertList');
  if (!wrap) return;
  if (!State.alerts.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS.bell}</div><div class="empty-title">Aucune recherche enregistrée</div><p>Créez votre première recherche avec le formulaire, ou depuis la page de résultats.</p></div>`;
    return;
  }
  wrap.innerHTML = State.alerts.map((a, i) => {
    const ch = a.channels || [];
    return `<div class="alert-item">
      <button class="alert-info" type="button" data-run="${i}" style="text-align:left">
        <div class="alert-kw">${esc(a.kw || a.city)}</div>
        <div class="alert-meta">${a.city && a.kw ? esc(a.city) + ' · ' : ''}${a.id ? 'enregistrée dans votre compte' : 'sur cet appareil'} · relancer la recherche</div>
        ${ch.length ? `<div class="alert-channels">${ch.includes('email') ? `<span class="tag tag-ok">${icon('mail')} Email</span>` : ''}${ch.includes('whatsapp') ? `<span class="tag tag-ok">${icon('phone')} WhatsApp</span>` : ''}</div>` : ''}
      </button>
      <button class="alert-del" type="button" data-i="${i}" aria-label="Supprimer la recherche ${esc(a.kw || a.city)}">Supprimer</button>
    </div>`;
  }).join('');
  $$('#alertList .alert-del').forEach(el => on(el, 'click', () => {
    const [a] = State.alerts.splice(+el.dataset.i, 1);
    safeSet('tp_alerts', State.alerts);
    if (a && a.id) remote('/api/me/alerts?id=' + encodeURIComponent(a.id), { method: 'DELETE' });
    renderAlerts();
    toast('Recherche supprimée');
  }));
  $$('#alertList [data-run]').forEach(el => on(el, 'click', () => {
    const a = State.alerts[+el.dataset.run];
    runSearch(a.kw, a.city || '');
  }));
}

async function createAlert(e) {
  e.preventDefault();
  const kw = $('#alertKw').value.trim();
  if (!kw) { toast('Indiquez au moins un mot-clé', 'err'); $('#alertKw').focus(); return; }
  const channels = [];
  if ($('#alertChEmail').checked && !$('#alertChEmail').disabled) channels.push('email');
  if ($('#alertChWa').checked && !$('#alertChWa').disabled) channels.push('whatsapp');
  const whatsappTo = channels.includes('whatsapp') ? $('#alertWaTo').value.replace(/[\s.-]/g, '') : '';
  if (channels.includes('whatsapp') && !/^\+[1-9]\d{7,14}$/.test(whatsappTo)) { toast('Numéro WhatsApp au format international, ex. +33612345678', 'err'); $('#alertWaTo').focus(); return; }
  const alert = { kw, city: $('#alertCity').value.trim(), channels, whatsappTo, created: Date.now() };
  if (remoteOn()) {
    const data = await remote('/api/me/alerts', { method: 'POST', body: alertPayload(alert) });
    if (!data || !data.alert) return;
    alert.id = data.alert.id;
  } else if (State.alerts.length >= 20) { toast('Limite de 20 recherches enregistrées atteinte', 'err'); return; }
  State.alerts.unshift(alert);
  safeSet('tp_alerts', State.alerts);
  $('#alertForm').reset();
  $('#alertWaWrap').classList.add('hide');
  renderAlerts();
  toast(channels.length ? 'Alerte créée : vous recevrez les nouvelles offres chaque jour.' : State.user ? 'Recherche enregistrée dans votre compte.' : 'Recherche enregistrée sur cet appareil.', 'ok');
}

// ═══ FEATURE 7 : RECHERCHE SAUVEGARDÉE ═══
function saveCurrentSearch() {
  const s = State.lastSearch;
  if (!s || (!s.kw && !s.city)) { toast("Effectuez d'abord une recherche"); return; }
  const label = [s.kw, s.city].filter(Boolean).join(' · ');
  if (State.searches.some(x => x.label === label)) { toast('Recherche déjà enregistrée'); return; }
  State.searches.unshift({ label, kw: s.kw, city: s.city });
  State.searches = State.searches.slice(0, 8);
  safeSet('tp_searches', State.searches);
  renderSavedSearches();
  // Connecté : la recherche devient aussi une recherche enregistrée du compte (base des alertes)
  if (remoteOn() && !State.alerts.some(a => a.kw === (s.kw || '') && (a.city || '') === (s.city || ''))) {
    const alert = { kw: s.kw || '', city: s.city || '', channels: [], created: Date.now() };
    remote('/api/me/alerts', { method: 'POST', body: alertPayload(alert) }).then(d => { if (d && d.alert) { alert.id = d.alert.id; State.alerts.unshift(alert); safeSet('tp_alerts', State.alerts); } });
  }
  toast(remoteOn() ? 'Recherche enregistrée dans votre compte. Activez une alerte dans Mon espace.' : 'Recherche enregistrée', 'ok');
}

function renderSavedSearches() {
  const wrap = $('#savedSearches');
  if (!wrap) return;
  if (!State.searches.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div style="margin:0 0 12px"><span class="muted" style="font-size:var(--fs-sm);margin-right:8px">Mes recherches :</span>' + State.searches.map((s, i) =>
    `<span class="ssearch"><button type="button" data-i="${i}" style="font-weight:600">${esc(s.label)}</button><button type="button" class="ssearch-del" data-del="${i}" aria-label="Supprimer la recherche ${esc(s.label)}">×</button></span>`).join('') + '</div>';
  $$('#savedSearches [data-del]').forEach(el => on(el, 'click', () => {
    State.searches.splice(+el.dataset.del, 1);
    safeSet('tp_searches', State.searches);
    renderSavedSearches();
  }));
  $$('#savedSearches [data-i]').forEach(el => on(el, 'click', () => {
    const s = State.searches[+el.dataset.i];
    runSearch(s.kw || '', s.city || '');
  }));
}
// ─── FILTRES (appliqués côté serveur) ───────────────────────────────
const CONTRACT_TYPES = [
  { key: 'CDI', label: 'CDI' }, { key: 'CDD', label: 'CDD' }, { key: 'Interim', label: 'Intérim' },
  { key: 'Alternance', label: 'Alternance' }, { key: 'Stage', label: 'Stage' },
];
function defaultFilters() {
  return { experience: '', niveauEtudes: '', datePosted: '', tempsPlein: '', salaireMin: '' };
}

function reloadWithFilters() {
  const s = State.lastSearch || {};
  loadJobs({ kw: s.kw, city: s.city });
}

function setContractFilter(val, { reload = true } = {}) {
  State.filter = val;
  $$('#jobsBar .chip').forEach(c => { const on = c.dataset.filter === val; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  renderContractChecklist();
  renderActiveFilterChips();
  if (reload) reloadWithFilters();
}

function renderContractChecklist() {
  const wrap = $('#filterContractChips');
  if (!wrap) return;
  wrap.innerHTML = CONTRACT_TYPES.map(c => `
    <label class="filter-check-row ${State.filter === c.key ? 'checked' : ''}">
      <input type="checkbox" data-fcontract="${c.key}" ${State.filter === c.key ? 'checked' : ''}>
      <span>${c.label}</span>
    </label>`).join('');
  $$('#filterContractChips input').forEach(input => on(input, 'change', () => {
    const val = input.dataset.fcontract;
    setContractFilter(State.filter === val ? 'all' : val);
  }));
}

const isDesktop = () => window.matchMedia('(min-width:1024px)').matches;
function syncFilterDrawerA11y() {
  const d = $('#filterDrawer');
  if (!d) return;
  if (isDesktop() || d.classList.contains('open')) d.removeAttribute('inert'); else d.setAttribute('inert', '');
}

function fillFilterForm() {
  renderContractChecklist();
  $('#fExperience').value   = State.filters.experience || '';
  $('#fNiveauEtudes').value = State.filters.niveauEtudes || '';
  $('#fTempsPlein').value   = State.filters.tempsPlein || '';
  $('#fSalaire').value      = State.filters.salaireMin || '';
  $('#filterLocation').value = (State.lastSearch && State.lastSearch.city) || '';
  const radio = document.querySelector(`input[name="fDatePostedR"][value="${State.filters.datePosted || ''}"]`);
  if (radio) radio.checked = true;
}

function openFilterDrawer() {
  fillFilterForm();
  const d = $('#filterDrawer');
  d.classList.add('open');
  d.removeAttribute('inert');
  $('#filterOverlay').classList.add('open');
  $('#openFilterBtn').setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
  setTimeout(() => $('#filterClose')?.focus(), 50);
}
function closeFilterDrawer() {
  const d = $('#filterDrawer');
  const wasOpen = d.classList.contains('open');
  d.classList.remove('open');
  $('#filterOverlay').classList.remove('open');
  $('#openFilterBtn').setAttribute('aria-expanded', 'false');
  if (!$('#detail').classList.contains('open')) document.body.classList.remove('no-scroll');
  syncFilterDrawerA11y();
  if (wasOpen && !isDesktop()) $('#openFilterBtn')?.focus();
}

function applyFiltersFromDrawer() {
  const dateRadio = document.querySelector('input[name="fDatePostedR"]:checked');
  State.filters = {
    experience:   $('#fExperience').value,
    niveauEtudes: $('#fNiveauEtudes').value,
    datePosted:   dateRadio ? dateRadio.value : '',
    tempsPlein:   $('#fTempsPlein').value,
    salaireMin:   $('#fSalaire').value,
  };
  safeSet('tp_filters', State.filters);
  const loc = $('#filterLocation').value.trim();
  const s = State.lastSearch || { kw: '', city: '' };
  closeFilterDrawer();
  renderActiveFilterChips();
  if (loc !== (s.city || '')) {
    runSearch(s.kw || '', loc);
  } else {
    reloadWithFilters();
  }
}

function resetFilters() {
  State.filters = defaultFilters();
  safeSet('tp_filters', State.filters);
  fillFilterForm();
  setContractFilter('all', { reload: false });
  renderActiveFilterChips();
  reloadWithFilters();
  toast('Filtres réinitialisés');
}

const FILTER_LABELS = {
  experience: v => ({ debutant: 'Débutant accepté', '1': 'Expérience < 1 an', '2': 'Expérience 1 à 3 ans', '3': 'Expérience > 3 ans' }[v] || v),
  niveauEtudes: v => ({ NV5: 'CAP, BEP', NV4: 'Bac', NV3: 'Bac+2', NV2: 'Bac+3/4', NV1: 'Bac+5 et plus' }[v] || v),
  datePosted: v => DATE_LABELS[v] || v,
  tempsPlein: v => v === 'plein' ? 'Temps plein' : 'Temps partiel',
  salaireMin: v => `≥ ${Number(v).toLocaleString('fr-FR')} €/an`,
};

function renderActiveFilterChips() {
  const wrap = $('#activeFilterChips');
  if (!wrap) return;
  const chips = [];
  Object.entries(State.filters).forEach(([k, v]) => {
    if (v && FILTER_LABELS[k]) chips.push({ key: k, label: FILTER_LABELS[k](v) });
  });
  wrap.innerHTML = chips.map(c => `<span class="fchip">${esc(c.label)} <button type="button" class="x" data-rm="${c.key}" aria-label="Retirer le filtre ${esc(c.label)}">×</button></span>`).join('');
  const count = $('#filterCount');
  if (count) {
    const n = chips.length + (State.filter !== 'all' ? 1 : 0);
    count.textContent = n;
    count.classList.toggle('hide', n === 0);
  }
  $$('#activeFilterChips .x').forEach(el => on(el, 'click', () => {
    State.filters[el.dataset.rm] = '';
    safeSet('tp_filters', State.filters);
    renderActiveFilterChips();
    reloadWithFilters();
  }));
}
// ═══ FEATURE : EXPORT PDF ═══
function exportPDF() {
  const p = State.profile, u = State.user || { prenom: '', email: '' };
  const win = window.open('', '_blank');
  if (!win) { toast('Autorisez les popups pour exporter'); return; }
  const skills = (p.skills || '').split(',').map(s => s.trim()).filter(Boolean);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossier ${esc(p.prenom || u.prenom)}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#0F172A;line-height:1.6}
    .head{border-bottom:3px solid #FF6A00;padding-bottom:16px;margin-bottom:24px}
    h1{font-size:1.8rem;margin:0 0 4px}
    .title{color:#C2410C;font-weight:600;font-size:1.1rem}
    .meta{color:#64748B;font-size:.9rem;margin-top:6px}
    h2{font-size:1.1rem;border-left:4px solid #FF6A00;padding-left:10px;margin:24px 0 10px}
    .skills{display:flex;flex-wrap:wrap;gap:8px}
    .skill{background:#FFF4EE;color:#E04E00;padding:5px 12px;border-radius:99px;font-size:.85rem;font-weight:600}
    .stats{display:flex;gap:24px;margin-top:8px}
    .stat b{font-size:1.4rem;color:#C2410C}
    .foot{margin-top:40px;padding-top:16px;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:.8rem;text-align:center}
    @media print{body{margin:0}}
  
  
</style></head><body>
  <div class="head">
    <h1>${esc((p.prenom || u.prenom) + ' ' + (p.nom || ''))}</h1>
    ${p.title ? `<div class="title">${esc(p.title)}</div>` : ''}
    <div class="meta">${[u.email, p.city].filter(Boolean).map(esc).join(' · ')}</div>
  </div>
  ${skills.length ? `<h2>Compétences</h2><div class="skills">${skills.map(s => `<span class="skill">${esc(s)}</span>`).join('')}</div>` : ''}
  <h2>Activité de recherche</h2>
  <div class="stats">
    <div class="stat"><b>${State.saved.size}</b><br>Favoris</div>
    <div class="stat"><b>${State.applied.size}</b><br>Offres suivies</div>
    <div class="stat"><b>${State.history.length}</b><br>Suivis</div>
  </div>
  ${State.history.length ? `<h2>Offres suivies</h2>${State.history.slice(0, 10).map(h => `<p>• <b>${esc(h.title)}</b> — ${esc(h.company)}</p>`).join('')}` : ''}
  <div class="foot">Dossier généré par TalentPulse · ${new Date().toLocaleDateString('fr-FR')}</div>
  </body></html>`;
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 300);
  toast('Ouverture du PDF…');
}

// ═══ FEATURE : PARTAGE D'OFFRE ═══
function shareJob(id) {
  const j = findJob(id);
  if (!j) return;
  const text = `Offre : ${j.title}${j.company ? ' chez ' + j.company : ''}${j.city ? ' à ' + j.city : ''}`;
  const url = SITE + '/offre/' + encodeURIComponent(j.id);
  if (navigator.share) {
    navigator.share({ title: j.title, text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' — ' + url).then(() => toast('Lien copié', 'ok'), () => window.open(`https://wa.me/?text=${encodeURIComponent(text + ' — ' + url)}`, '_blank', 'noopener'));
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' — ' + url)}`, '_blank', 'noopener');
  }
}


// ─── 14. DARK MODE ────────────────────────────────────────────────
function applyDark() {
  document.body.classList.toggle('dark', State.dark);
  const t = $('#darkToggle');
  if (t) { t.setAttribute('aria-pressed', State.dark ? 'true' : 'false'); t.setAttribute('aria-label', State.dark ? 'Désactiver le mode sombre' : 'Activer le mode sombre'); }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', State.dark ? '#0B1120' : '#FFFFFF');
}
function toggleDark() {
  State.dark = !State.dark;
  try { localStorage.setItem('tp_dark', State.dark ? '1' : '0'); } catch {}
  applyDark();
}
// ─── 15. INIT ─────────────────────────────────────────────────────
function bindNavLinks(root = document) {
  // Liens internes : navigation SPA sans rechargement (les href restent valides pour l'accessibilité / le SEO)
  $$('[data-nav]', root).forEach(el => on(el, 'click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    closeDrawer();
    goToPage(el.dataset.nav);
    if (el.dataset.ptab) setTimeout(() => switchPTab(el.dataset.ptab), 0);
  }));
  $$('[data-legal]', root).forEach(el => on(el, 'click', e => { e.preventDefault(); closeDrawer(); openLegal(el.dataset.legal); }));
}

let liveRegion = null;
function announce(msg) {
  if (!liveRegion) { liveRegion = document.createElement('div'); liveRegion.className = 'sr-only'; liveRegion.setAttribute('aria-live', 'polite'); document.body.appendChild(liveRegion); }
  liveRegion.textContent = '';
  setTimeout(() => { liveRegion.textContent = msg; }, 30);
}

function onFeaturesReady() {
  refreshAuthUI();
  refreshAuthForms();
  renderLettreMode();
  if ($('#page-profile').classList.contains('active')) renderProfile();
  if ($('#page-legal').classList.contains('active') && LEGAL_PAGES[window.location.pathname]) showLegalPage(window.location.pathname);
}

function init() {
  try { localStorage.removeItem('tp_accounts'); localStorage.removeItem('tp_whatsapp'); localStorage.removeItem('tp_wa_seen'); } catch {}

  applyDark();
  refreshAuthUI();
  updateFavBadge();
  renderCategories();
  renderLettreMode();
  if ($('#page-home')?.classList.contains('active')) { loadLiveCount(); initTicker(); }
  loadFeatures().then(() => { onFeaturesReady(); return bootstrapAccount(); }).then(onFeaturesReady);

  window.addEventListener('offline', () => toast('Connexion perdue. Certaines fonctions sont indisponibles.', 'err'));
  window.addEventListener('online',  () => toast('Connexion rétablie.', 'ok'));

  // Navbar
  on($('#logo'), 'click', e => { e.preventDefault(); navigate('/'); });
  on($('#navLogin'), 'click', e => { e.preventDefault(); goToPage('login'); switchAuthTab('in'); });
  on($('#navUser'), 'click', () => goToPage('profile'));
  on($('#navBurger'), 'click', openDrawer);
  on($('#navFavBtn'), 'click', () => { goToPage('profile'); setTimeout(() => switchPTab('favoris'), 0); });

  // Drawer
  on($('#drawerClose'),   'click', closeDrawer);
  on($('#drawerOverlay'), 'click', closeDrawer);
  on($('#drawerLogin'),   'click', e => { e.preventDefault(); goToPage('login'); switchAuthTab('in'); });
  bindNavLinks();

  // Liens vers les pages légales (footer, menu, contenus injectés)
  on(document, 'click', e => {
    const a = e.target.closest('[data-route]');
    if (a) { e.preventDefault(); closeDrawer(); $$('.modal-overlay.open').forEach(m => m.classList.remove('open')); navigate(a.dataset.route); return; }
    const clr = e.target.closest('[data-action="clear-data"]');
    if (clr) { e.preventDefault(); clearLocalData(); }
    const exp = e.target.closest('[data-action="export-data"]');
    if (exp) { e.preventDefault(); exportData(); }
  });

  // Search
  on($('#searchForm'), 'submit', e => { e.preventDefault(); runSearch(); });
  setupAutocomplete('searchKw', 'acKw', 'metier');
  setupAutocomplete('searchCity', 'acCity', 'lieu');
  setupAutocomplete('filterLocation', 'acFilterLoc', 'lieu');
  setupAutocomplete('rsKw', 'acRsKw', 'metier');
  setupAutocomplete('rsCity', 'acRsCity', 'lieu');
  on($('#rsForm'), 'submit', e => { e.preventDefault(); runSearch($('#rsKw').value, $('#rsCity').value); });
  // Recherches populaires (accueil, pied de page)
  $$('[data-pop-kw]').forEach(a => on(a, 'click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    runSearch(a.dataset.popKw, a.dataset.popCity || '');
  }));

  // Contrats (rechargement serveur)
  $$('#jobsBar .chip').forEach(el => on(el, 'click', () => setContractFilter(el.dataset.filter)));

  // Tri
  on($('#sortSelect'), 'change', e => {
    const prev = State.sort;
    State.sort = e.target.value;
    // Pertinence / date : tri serveur ; compatibilité / salaire : tri des offres déjà affichées
    if (prev === 'recent' || State.sort === 'recent') reloadWithFilters();
    else renderJobs();
  });

  // Detail
  on($('#detailBack'), 'click', () => closeDetail());
  on($('#detailOverlay'), 'click', () => closeDetail());
  on($('#detailShare'), 'click', () => State.currentJobId && shareJob(State.currentJobId));
  on($('#detailSave'), 'click', () => State.currentJobId && toggleSave(State.currentJobId));

  // Auth forms
  $$('.auth-tab').forEach(t => on(t, 'click', () => switchAuthTab(t.dataset.tab)));
  on($('#formIn'), 'submit', doSignIn);
  on($('#formForgot'), 'submit', doForgot);
  on($('#formReset'), 'submit', doReset);
  on($('#forgotBtn'), 'click', () => showForgot(true));
  on($('#forgotBack'), 'click', () => showForgot(false));
  on($('#formUp'), 'submit', doSignUp);
  setupLiveValidation();
  on($('#clearDataBtn'), 'click', clearLocalData);
  on($('#exportDataBtn'), 'click', exportData);
  on($('#alertChWa'), 'change', e => $('#alertWaWrap').classList.toggle('hide', !e.target.checked));

  // Profile edit
  on($('#profEditToggle'), 'click', () => {
    if ($('#profForm').classList.contains('hide')) openProfileEdit();
    else closeProfileEdit();
  });
  on($('#profForm'), 'submit', saveProfileForm);
  on($('#profCancel'), 'click', closeProfileEdit);

  // Profile tabs
  $$('.ptab').forEach(t => on(t, 'click', () => switchPTab(t.dataset.ptab)));
  on($('#ptabs'), 'keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = $$('.ptab'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    switchPTab(tabs[n].dataset.ptab);
    tabs[n].focus();
  });
  switchPTab('infos');

  // CV upload
  const cvDrop = $('#cvDrop'), cvInput = $('#cvInput');
  on(cvDrop, 'click', () => cvInput.click());
  on(cvDrop, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cvInput.click(); } });
  on(cvInput, 'change', e => { handleCVFile(e.target.files[0]); e.target.value = ''; });
  on(cvDrop, 'dragover', e => { e.preventDefault(); cvDrop.classList.add('over'); });
  on(cvDrop, 'dragleave', () => cvDrop.classList.remove('over'));
  on(cvDrop, 'drop', e => {
    e.preventDefault(); cvDrop.classList.remove('over');
    handleCVFile(e.dataTransfer.files[0]);
  });

  // Recherches enregistrées
  on($('#alertForm'), 'submit', createAlert);
  on($('#saveSearchBtn'), 'click', saveCurrentSearch);

  // Export PDF
  on($('#exportPdf'), 'click', exportPDF);

  // Filter drawer
  on($('#openFilterBtn'), 'click', openFilterDrawer);
  on($('#filterClose'), 'click', closeFilterDrawer);
  on($('#filterOverlay'), 'click', closeFilterDrawer);
  on($('#filterApply'), 'click', applyFiltersFromDrawer);
  on($('#filterReset'), 'click', resetFilters);
  on($('#filterResetLink'), 'click', resetFilters);
  on($('#filterMoreToggle'), 'click', () => {
    const open = $('#filterMore').classList.toggle('open');
    $('#filterMoreToggle').classList.toggle('open', open);
    $('#filterMoreToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.matchMedia('(min-width:1024px)').addEventListener('change', syncFilterDrawerA11y);
  fillFilterForm();
  syncFilterDrawerA11y();

  // Lettre
  on($('#lettreGen'),   'click', generateLettre);
  on($('#lettreCopy'),  'click', copyLettre);
  on($('#lettreReset'), 'click', resetLettre);

  // Generic modal close
  $$('[data-close]').forEach(el => on(el, 'click', () => closeModal(el.dataset.close)));
  $$('.modal-overlay').forEach(o => on(o, 'click', e => { if (e.target === o) closeModal(o.id); }));

  // Dark mode toggle
  on($('#darkToggle'), 'click', toggleDark);

  // URL routes
  window.addEventListener('popstate', handleRoute);

  // Escape : ferme dans l'ordre listes de suggestions > modale > détail > filtres > menu
  on(document, 'keydown', e => {
    if (e.key !== 'Escape') return;
    if ($$('.ac-list.show').length) { closeAllAutocomplete(); return; }
    const modal = $('.modal-overlay.open');
    if (modal) { closeModal(modal.id); return; }
    if ($('#detail').classList.contains('open')) { closeDetail(); return; }
    if ($('#filterDrawer').classList.contains('open') && !isDesktop()) { closeFilterDrawer(); return; }
    closeDrawer();
  });
  // Clic en dehors : ferme les suggestions
  on(document, 'pointerdown', e => { if (!e.target.closest('.search-field')) closeAllAutocomplete(); });
}

function start() { init(); handleRoute(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

})();
