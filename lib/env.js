/**
 * Drapeaux de fonctionnalités : chaque fonction s'active uniquement si ses variables existent.
 * Déployer sans aucune clé laisse le site fonctionner comme aujourd'hui (recherche + espace local).
 */
const val = k => String(process.env[k] || '').trim();
const has = k => val(k) !== '';

export function features() {
  const db = has('DATABASE_URL');
  const auth = db && val('AUTH_SECRET').length >= 32;
  const cron = has('CRON_SECRET');
  // IA : clé AI Gateway explicite, ou OIDC Vercel avec activation volontaire (évite toute facturation surprise).
  const aiLetter = has('AI_GATEWAY_API_KEY') || (val('VERCEL') === '1' && val('AI_LETTER_ENABLED') === '1');
  const emailAlerts = auth && cron && has('RESEND_API_KEY') && has('ALERTS_FROM_EMAIL');
  const whatsappAlerts = auth && cron && has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_FROM');
  // E-mails de compte (vérification d'adresse, mot de passe oublié) : Resend + expéditeur
  const accountEmails = auth && has('RESEND_API_KEY') && (has('AUTH_FROM_EMAIL') || has('ALERTS_FROM_EMAIL') || has('APPLY_FROM_EMAIL'));
  // Envoi réel d'une candidature au recruteur (offres France Travail publiant un e-mail) : expéditeur dédié obligatoire,
  // sur un domaine VÉRIFIÉ dans Resend. Sans APPLY_FROM_EMAIL, le site propose seulement le dossier prêt à envoyer.
  const applyEmail = auth && has('RESEND_API_KEY') && has('APPLY_FROM_EMAIL');
  return { db, auth, sync: auth, savedSearches: auth, aiLetter, emailAlerts, whatsappAlerts, cron, accountEmails, applyEmail };
}

export function env(k, d = '') { return val(k) || d; }

/** Informations publiques de l'éditeur (mentions légales) : uniquement des données destinées à être affichées. */
export function legalInfo() {
  const out = {};
  const map = { editor: 'LEGAL_EDITOR', status: 'LEGAL_STATUS', address: 'LEGAL_ADDRESS', siren: 'LEGAL_SIREN', director: 'LEGAL_DIRECTOR', contactEmail: 'CONTACT_EMAIL' };
  for (const [k, v] of Object.entries(map)) { const x = val(v).slice(0, 300); if (x) out[k] = x; }
  return out;
}

export const AI_MODEL_DEFAULT = 'google/gemini-3.1-flash-lite';
