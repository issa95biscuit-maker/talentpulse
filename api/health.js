/** GET /api/health — état du service et fonctionnalités activées (aucune valeur secrète n'est exposée). */
import { api, sendJson, allowMethods } from '../lib/http.js';
import { features } from '../lib/env.js';

export default api(async (req, res) => {
  allowMethods(req, res, ['GET', 'HEAD']);
  const f = features();
  return sendJson(res, 200, {
    ok: true,
    features: { auth: f.auth, sync: f.sync, savedSearches: f.savedSearches, aiLetter: f.aiLetter, emailAlerts: f.emailAlerts, whatsappAlerts: f.whatsappAlerts, accountEmails: f.accountEmails },
    version: String(process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  }, { cache: 'public, max-age=0, s-maxage=60' });
});
