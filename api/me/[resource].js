/**
 * Données du compte connecté (cookie de session requis).
 *   /api/me/favorites  GET | POST { jobId, job } | DELETE ?jobId=
 *   /api/me/pipeline   GET | PUT { jobId, status, position?, notes?, job } | DELETE ?jobId=
 *   /api/me/alerts     GET | POST { label?, query, channels?, whatsappTo? } | PATCH ?id= {…} | DELETE ?id=
 *   /api/me/profile    GET | PUT { prenom, nom, title, city, skills, contract }
 *   /api/me/sync       POST { favorites, pipeline, alerts, profile } — fusionne les données locales au 1er login
 *   /api/me/export     GET  — export JSON de toutes les données (RGPD, portabilité)
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, HttpError } from '../../lib/http.js';
import { requireUser, publicUser } from '../../lib/auth.js';
import { features } from '../../lib/env.js';
import { enforce } from '../../lib/ratelimit.js';
import { parse, favoriteSchema, pipelineSchema, alertSchema, alertPatchSchema, profileSchema, syncSchema, jobId as jobIdSchema } from '../../lib/validate.js';
import * as data from '../../lib/userdata.js';
import { z } from 'zod';

const uuid = z.uuid({ message: 'Identifiant invalide.' });
const qp = (req, k) => String(req.query?.[k] || '');

function alertsDelivery() {
  const f = features();
  return { email: f.emailAlerts, whatsapp: f.whatsappAlerts };
}

const RESOURCES = {
  async favorites(req, res, user) {
    const m = allowMethods(req, res, ['GET', 'POST', 'DELETE']);
    if (m === 'GET') return sendJson(res, 200, { favorites: await data.listFavorites(user.id) });
    if (m === 'POST') return sendJson(res, 200, { favorite: await data.upsertFavorite(user.id, parse(favoriteSchema, await readJson(req))) });
    return sendJson(res, 200, { deleted: await data.deleteFavorite(user.id, parse(jobIdSchema, qp(req, 'jobId'))) });
  },
  async pipeline(req, res, user) {
    const m = allowMethods(req, res, ['GET', 'PUT', 'POST', 'DELETE']);
    if (m === 'GET') return sendJson(res, 200, { pipeline: await data.listPipeline(user.id) });
    if (m === 'PUT' || m === 'POST') return sendJson(res, 200, { item: await data.upsertPipeline(user.id, parse(pipelineSchema, await readJson(req))) });
    return sendJson(res, 200, { deleted: await data.deletePipeline(user.id, parse(jobIdSchema, qp(req, 'jobId'))) });
  },
  async alerts(req, res, user) {
    const m = allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE']);
    if (m === 'GET') return sendJson(res, 200, { alerts: await data.listAlerts(user.id), delivery: alertsDelivery() });
    if (m === 'POST') return sendJson(res, 201, { alert: await data.createAlert(user.id, parse(alertSchema, await readJson(req))), delivery: alertsDelivery() });
    const id = parse(uuid, qp(req, 'id'));
    if (m === 'PATCH') return sendJson(res, 200, { alert: await data.updateAlert(user.id, id, parse(alertPatchSchema, await readJson(req))) });
    return sendJson(res, 200, { deleted: await data.deleteAlert(user.id, id) });
  },
  async profile(req, res, user) {
    const m = allowMethods(req, res, ['GET', 'PUT']);
    if (m === 'GET') return sendJson(res, 200, { user: publicUser(user) });
    return sendJson(res, 200, { user: publicUser(await data.updateProfile(user.id, parse(profileSchema, await readJson(req)))) });
  },
  async sync(req, res, user) {
    allowMethods(req, res, ['POST']);
    await enforce([{ key: 'sync:' + user.id, limit: 20, windowSec: 3600 }]);
    const merged = await data.mergeLocalData(user.id, parse(syncSchema, await readJson(req)));
    return sendJson(res, 200, { ...merged, user: publicUser(merged.user || user), delivery: alertsDelivery() });
  },
  async export(req, res, user) {
    allowMethods(req, res, ['GET']);
    const all = await data.allUserData(user.id);
    res.setHeader('Content-Disposition', 'attachment; filename="talentpulse-mes-donnees.json"');
    return sendJson(res, 200, { exportedAt: new Date().toISOString(), user: publicUser(user), ...all });
  },
};

export default api(async (req, res) => {
  const name = qp(req, 'resource');
  const fn = Object.prototype.hasOwnProperty.call(RESOURCES, name) ? RESOURCES[name] : null;
  if (!fn) throw new HttpError(404, 'Route inconnue.', 'not_found');
  assertSameOrigin(req);
  const user = await requireUser(req, res);
  return fn(req, res, user);
});
