/**
 * Authentification email + mot de passe.
 * - Empreinte argon2id (paramètres OWASP : m=19 Mio, t=2, p=1).
 * - Session = jeton aléatoire 256 bits dans un cookie httpOnly, Secure, SameSite=Lax, signé HMAC (AUTH_SECRET).
 *   Seule l'empreinte SHA-256 du jeton est stockée en base : une fuite de la table sessions ne permet pas d'usurper une session.
 */
import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { db } from './db.js';
import { features } from './env.js';
import { HttpError, parseCookies, serializeCookie, appendSetCookie, isSecureRequest } from './http.js';

export const SESSION_DAYS = 30;
const RENEW_BELOW_DAYS = 15;
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$WUsMAcFARovsoyI1r0bcWw$wSxJOhhJL5t140mL7CJG5mG2ZNmUnw6fCGHioFicUf4';

export const hashPassword = (p) => hash(p, ARGON);
export async function verifyPassword(stored, p) {
  try { return await verify(stored || DUMMY_HASH, p); } catch { return false; }
}
/** Vérification à temps constant même si l'utilisateur n'existe pas (limite l'énumération par chronométrage). */
export async function verifyDummy(p) { await verifyPassword(DUMMY_HASH, p); return false; }

const secret = () => String(process.env.AUTH_SECRET || '');
const sign = (token) => crypto.createHmac('sha256', secret()).update(token).digest('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function cookieName(req) { return isSecureRequest(req) ? '__Host-tp_session' : 'tp_session'; }

function readToken(req) {
  const c = parseCookies(req);
  const raw = c['__Host-tp_session'] || c.tp_session;
  if (!raw) return null;
  const i = raw.lastIndexOf('.');
  if (i < 10) return null;
  const token = raw.slice(0, i), mac = raw.slice(i + 1);
  const expected = sign(token);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return token;
}

export function requireAuthFeature() {
  if (!features().auth) throw new HttpError(503, 'Les comptes ne sont pas encore disponibles.', 'feature_disabled');
}

export async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db().query('insert into sessions (id, user_id, expires_at, user_agent) values ($1, $2, $3, $4)',
    [sha256(token), userId, expires.toISOString(), String(req.headers?.['user-agent'] || '').slice(0, 200)]);
  appendSetCookie(res, serializeCookie(cookieName(req), `${token}.${sign(token)}`, { maxAge: SESSION_DAYS * 86400, secure: isSecureRequest(req) }));
}

export function clearSessionCookie(req, res) {
  const secure = isSecureRequest(req);
  appendSetCookie(res, serializeCookie(cookieName(req), '', { maxAge: 0, secure }));
}

export async function destroySession(req, res) {
  const token = readToken(req);
  if (token && features().auth) await db().query('delete from sessions where id = $1', [sha256(token)]);
  clearSessionCookie(req, res);
}

export function publicUser(u) {
  return { id: u.id, email: u.email, prenom: u.prenom || '', profile: u.profile || {}, createdAt: u.created_at, emailVerified: !!u.email_verified_at };
}

// ── Jetons à usage unique (réinitialisation du mot de passe, vérification d'adresse) ──
// Lien = jeton aléatoire 256 bits + signature HMAC liée à l'usage ; seule l'empreinte SHA-256 est en base.
export const TOKEN_TTL = { reset: 3600, verify: 48 * 3600 };
const signFor = (purpose, token) => crypto.createHmac('sha256', secret()).update(purpose + ':' + token).digest('base64url').slice(0, 32);

export async function issueToken(userId, purpose) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TOKEN_TTL[purpose] * 1000);
  // Un seul lien valide à la fois par usage : les précédents sont invalidés
  await db().query('update auth_tokens set used_at = now() where user_id = $1 and purpose = $2 and used_at is null', [userId, purpose]);
  await db().query('insert into auth_tokens (id, user_id, purpose, expires_at) values ($1, $2, $3, $4)', [sha256(token), userId, purpose, expires.toISOString()]);
  return `${token}.${signFor(purpose, token)}`;
}

/** Consomme le jeton (usage unique, atomique). Renvoie l'identifiant utilisateur ou lève une erreur 400. */
export async function consumeToken(raw, purpose) {
  const bad = () => new HttpError(400, purpose === 'reset' ? 'Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.' : 'Ce lien de vérification est invalide ou a expiré.', 'invalid_token');
  const s = String(raw || '');
  const i = s.lastIndexOf('.');
  if (i < 20) throw bad();
  const token = s.slice(0, i), mac = s.slice(i + 1), expected = signFor(purpose, token);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw bad();
  const rows = await db().query(
    `update auth_tokens set used_at = now()
      where id = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id`, [sha256(token), purpose]);
  if (!rows.length) throw bad();
  return rows[0].user_id;
}

/** Après un changement de mot de passe : toutes les sessions existantes sont fermées. */
export async function revokeAllSessions(userId) {
  await db().query('delete from sessions where user_id = $1', [userId]);
}

/** Renvoie l'utilisateur connecté ou null. Prolonge la session si elle expire bientôt. */
export async function currentUser(req, res) {
  if (!features().auth) return null;
  const token = readToken(req);
  if (!token) return null;
  const id = sha256(token);
  const rows = await db().query(
    `select u.id, u.email, u.prenom, u.profile, u.created_at, u.email_verified_at, s.expires_at
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`, [id]);
  if (!rows.length) { if (res) clearSessionCookie(req, res); return null; }
  const u = rows[0];
  if (res && new Date(u.expires_at).getTime() - Date.now() < RENEW_BELOW_DAYS * 864e5) {
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    await db().query('update sessions set expires_at = $2 where id = $1', [id, expires.toISOString()]);
    appendSetCookie(res, serializeCookie(cookieName(req), `${token}.${sign(token)}`, { maxAge: SESSION_DAYS * 86400, secure: isSecureRequest(req) }));
  }
  return u;
}

export async function requireUser(req, res) {
  requireAuthFeature();
  const u = await currentUser(req, res);
  if (!u) throw new HttpError(401, 'Connectez-vous pour accéder à cette fonctionnalité.', 'unauthenticated');
  return u;
}
