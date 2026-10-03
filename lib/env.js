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
  return { db, auth, sync: auth, savedSearches: auth, aiLetter, emailAlerts, whatsappAlerts, cron };
}

export function env(k, d = '') { return val(k) || d; }

export const AI_MODEL_DEFAULT = 'google/gemini-3.1-flash-lite';
