/**
 * /api/auth/register  POST { email, password, prenom?, consent: true }
 * /api/auth/login     POST { email, password }
 * /api/auth/logout    POST
 * /api/auth/me        GET  -> { user | null, features }
 * /api/auth/delete    POST { password }  — suppression définitive du compte et de toutes ses données (RGPD, art. 17)
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, clientIp, HttpError } from '../../lib/http.js';
import { db } from '../../lib/db.js';
import { features } from '../../lib/env.js';
import { parse, registerSchema, loginSchema, deleteSchema } from '../../lib/validate.js';
import { enforce, fingerprint } from '../../lib/ratelimit.js';
import { hashPassword, verifyPassword, verifyDummy, createSession, destroySession, clearSessionCookie, currentUser, requireUser, requireAuthFeature, publicUser } from '../../lib/auth.js';

const MIN = 60;

async function register(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAuthFeature();
  const ip = fingerprint('ip', clientIp(req));
  await enforce([{ key: 'reg:' + ip, limit: 10, windowSec: 60 * MIN }], 'Trop de créations de compte depuis cette connexion. Réessayez plus tard.');
  const body = parse(registerSchema, await readJson(req));
  const passwordHash = await hashPassword(body.password);
  const rows = await db().query(
    `insert into users (email, password_hash, prenom) values ($1, $2, $3)
     on conflict ((lower(email))) do nothing
     returning id, email, prenom, profile, created_at`, [body.email, passwordHash, body.prenom]);
  if (!rows.length) throw new HttpError(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.', 'email_taken');
  await createSession(req, res, rows[0].id);
  return sendJson(res, 201, { user: publicUser(rows[0]) });
}

async function login(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAuthFeature();
  const body = parse(loginSchema, await readJson(req));
  await enforce([
    { key: 'login-ip:' + fingerprint('ip', clientIp(req)), limit: 30, windowSec: 15 * MIN },
    { key: 'login-email:' + fingerprint('email', body.email), limit: 8, windowSec: 15 * MIN },
  ]);
  const rows = await db().query('select id, email, prenom, profile, created_at, password_hash from users where lower(email) = $1', [body.email]);
  const ok = rows.length ? await verifyPassword(rows[0].password_hash, body.password) : await verifyDummy(body.password);
  if (!ok) throw new HttpError(401, 'Email ou mot de passe incorrect.', 'invalid_credentials');
  await db().query('update users set last_login_at = now() where id = $1', [rows[0].id]);
  await createSession(req, res, rows[0].id);
  return sendJson(res, 200, { user: publicUser(rows[0]) });
}

async function logout(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  if (features().auth) await destroySession(req, res); else clearSessionCookie(req, res);
  return sendJson(res, 200, { ok: true });
}

async function me(req, res) {
  allowMethods(req, res, ['GET']);
  const user = await currentUser(req, res);
  return sendJson(res, 200, { user: user ? publicUser(user) : null, features: features() });
}

async function remove(req, res) {
  allowMethods(req, res, ['POST', 'DELETE']);
  assertSameOrigin(req);
  const user = await requireUser(req, res);
  await enforce([{ key: 'delete:' + user.id, limit: 5, windowSec: 15 * MIN }]);
  const body = parse(deleteSchema, await readJson(req));
  const rows = await db().query('select password_hash from users where id = $1', [user.id]);
  if (!rows.length || !(await verifyPassword(rows[0].password_hash, body.password))) throw new HttpError(401, 'Mot de passe incorrect.', 'invalid_credentials');
  // ON DELETE CASCADE : sessions, favoris, suivi, alertes et historique d'envoi sont supprimés avec le compte.
  await db().query('delete from users where id = $1', [user.id]);
  clearSessionCookie(req, res);
  return sendJson(res, 200, { ok: true, deleted: true });
}

const ACTIONS = { register, login, logout, me, delete: remove };

export default api(async (req, res) => {
  const action = String(req.query?.action || '');
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) throw new HttpError(404, 'Route inconnue.', 'not_found');
  return fn(req, res);
});
