/**
 * POST /api/lettre { poste, entreprise?, atouts?, profile?, offre? }
 * Génère une lettre via Vercel AI Gateway (modèle AI_MODEL, par défaut économique).
 * Limites : 5 / heure par connexion anonyme, 20 / jour par compte. En cas d'échec : modèle local.
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, clientIp, HttpError } from '../lib/http.js';
import { features } from '../lib/env.js';
import { parse, lettreSchema } from '../lib/validate.js';
import { enforce, fingerprint } from '../lib/ratelimit.js';
import { currentUser } from '../lib/auth.js';
import { generateLettre, localTemplate } from '../lib/lettre.js';

export default api(async (req, res) => {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  if (!features().aiLetter) throw new HttpError(503, 'La rédaction assistée par IA arrive bientôt.', 'feature_disabled');
  const user = await currentUser(req, res).catch(() => null);
  const msg = 'Limite de lettres générées atteinte. Utilisez le modèle ou réessayez plus tard.';
  if (user) await enforce([{ key: 'lettre-u:' + user.id, limit: 20, windowSec: 86400 }], msg);
  else await enforce([{ key: 'lettre-ip:' + fingerprint('ip', clientIp(req)), limit: 5, windowSec: 3600 }], msg);
  const input = parse(lettreSchema, await readJson(req));
  try {
    const lettre = await generateLettre(input);
    return sendJson(res, 200, { lettre, source: 'ai' });
  } catch (e) {
    console.error('[lettre] IA indisponible :', e?.message);
    return sendJson(res, 200, { lettre: localTemplate(input), source: 'template', notice: 'Le service IA est momentanément indisponible : voici un modèle à personnaliser.' });
  }
});
