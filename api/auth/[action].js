/**
 * /api/auth/register  POST { email, password, prenom?, consent: true }
 * /api/auth/login     POST { email, password }
 * /api/auth/logout    POST
 * /api/auth/me        GET  -> { user | null, features }
 * /api/auth/delete    POST { password }  — suppression définitive du compte et de toutes ses données (RGPD, art. 17)
 * /api/auth/forgot    POST { email }     — envoie un lien de réinitialisation (1 h, usage unique) ; réponse identique que le compte existe ou non
 * /api/auth/reset     POST { token, password } — nouveau mot de passe, ferme toutes les sessions puis connecte
 * /api/auth/verify    POST { token }     — confirme l'adresse e-mail
 * /api/auth/resend-verification POST (connecté) — renvoie le lien de vérification
 * Ces quatre routes n'existent que si les e-mails de compte sont configurés (RESEND_API_KEY + expéditeur).
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, clientIp, HttpError } from '../../lib/http.js';
import { db } from '../../lib/db.js';
import { features } from '../../lib/env.js';
import { parse, registerSchema, loginSchema, deleteSchema, forgotSchema, resetSchema, tokenSchema } from '../../lib/validate.js';
import { env } from '../../lib/env.js';
import { sendEmail, renderAccountEmail, siteUrl } from '../../lib/notify.js';
import { enforce, fingerprint } from '../../lib/ratelimit.js';
import { hashPassword, verifyPassword, verifyDummy, createSession, destroySession, clearSessionCookie, currentUser, requireUser, requireAuthFeature, publicUser, issueToken, consumeToken, revokeAllSessions } from '../../lib/auth.js';

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
  // Lien de vérification : un échec d'envoi ne bloque pas l'inscription (renvoi possible depuis Mon espace)
  let verificationSent = false;
  if (features().accountEmails) verificationSent = await sendAccountEmail('verify', rows[0]).then(() => true, e => { console.error('[auth] verify mail', e.message); return false; });
  return sendJson(res, 201, { user: publicUser(rows[0]), verificationSent });
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
  const rows = await db().query('select id, email, prenom, profile, created_at, email_verified_at, password_hash from users where lower(email) = $1', [body.email]);
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

// ── E-mails de compte ──
function requireAccountEmails() {
  requireAuthFeature();
  if (!features().accountEmails) throw new HttpError(503, 'Cette fonctionnalité n’est pas encore disponible.', 'feature_disabled');
}
async function sendAccountEmail(kind, user) {
  const token = await issueToken(user.id, kind);
  const link = `${siteUrl()}/${kind === 'reset' ? 'nouveau-mot-de-passe' : 'verifier-email'}#t=${encodeURIComponent(token)}`;
  const from = env('AUTH_FROM_EMAIL') || env('ALERTS_FROM_EMAIL');
  await sendEmail({ to: user.email, from, ...renderAccountEmail(kind, { prenom: user.prenom, link }) });
}

const FORGOT_MSG = 'Si un compte existe avec cette adresse, un e-mail contenant un lien de réinitialisation vient d’être envoyé. Pensez à vérifier vos courriers indésirables.';
async function forgot(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAccountEmails();
  const body = parse(forgotSchema, await readJson(req));
  await enforce([
    { key: 'forgot-ip:' + fingerprint('ip', clientIp(req)), limit: 10, windowSec: 60 * MIN },
    { key: 'forgot-email:' + fingerprint('email', body.email), limit: 3, windowSec: 60 * MIN },
  ], 'Trop de demandes. Réessayez dans une heure.');
  const rows = await db().query('select id, email, prenom from users where lower(email) = $1', [body.email]);
  // Même réponse (et temps comparable) que l'adresse existe ou non : pas d'énumération des comptes
  if (rows.length) await sendAccountEmail('reset', rows[0]).catch(e => console.error('[auth] reset mail', e.message));
  else await new Promise(r => setTimeout(r, 150 + Math.random() * 150));
  return sendJson(res, 200, { ok: true, message: FORGOT_MSG });
}

async function reset(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAccountEmails();
  await enforce([{ key: 'reset-ip:' + fingerprint('ip', clientIp(req)), limit: 10, windowSec: 15 * MIN }]);
  const body = parse(resetSchema, await readJson(req));
  const userId = await consumeToken(body.token, 'reset');
  const passwordHash = await hashPassword(body.password);
  // Recevoir le lien prouve aussi la possession de l'adresse
  const rows = await db().query(
    `update users set password_hash = $2, updated_at = now(), email_verified_at = coalesce(email_verified_at, now())
      where id = $1 returning id, email, prenom, profile, created_at, email_verified_at`, [userId, passwordHash]);
  await revokeAllSessions(userId);
  await createSession(req, res, userId);
  return sendJson(res, 200, { ok: true, user: publicUser(rows[0]) });
}

async function verify(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAccountEmails();
  await enforce([{ key: 'verify-ip:' + fingerprint('ip', clientIp(req)), limit: 20, windowSec: 15 * MIN }]);
  const body = parse(tokenSchema, await readJson(req));
  const userId = await consumeToken(body.token, 'verify');
  const rows = await db().query(
    'update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1 returning id, email, prenom, profile, created_at, email_verified_at', [userId]);
  return sendJson(res, 200, { ok: true, user: publicUser(rows[0]) });
}

async function resendVerification(req, res) {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  requireAccountEmails();
  const user = await requireUser(req, res);
  if (user.email_verified_at) return sendJson(res, 200, { ok: true, alreadyVerified: true });
  await enforce([{ key: 'resend-verify:' + user.id, limit: 3, windowSec: 60 * MIN }], 'Trop d’envois. Réessayez dans une heure.');
  await sendAccountEmail('verify', user);
  return sendJson(res, 200, { ok: true });
}

const ACTIONS = { register, login, logout, me, delete: remove, forgot, reset, verify, 'resend-verification': resendVerification };

export default api(async (req, res) => {
  const action = String(req.query?.action || '');
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) throw new HttpError(404, 'Route inconnue.', 'not_found');
  return fn(req, res);
});
