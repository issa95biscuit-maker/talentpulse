import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, call, setEnv, ENV_BASE } from './helpers.mjs';
import auth from '../api/auth/[action].js';
import me from '../api/me/[resource].js';
import health from '../api/health.js';

const A = (action, opts = {}) => call(auth, { ...opts, query: { action, ...(opts.query || {}) } });
const user = { email: 'Paul.Martin@Example.fr', password: 'motdepasse-solide-42', prenom: 'Paul', consent: true };
let pg;
beforeEach(async () => { setEnv(ENV_BASE); pg = await freshDb(); });

test('health : fonctionnalités désactivées sans variables, activées avec', async () => {
  setEnv({});
  let r = await call(health);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.features, { auth: false, sync: false, savedSearches: false, aiLetter: false, emailAlerts: false, whatsappAlerts: false });
  setEnv({ ...ENV_BASE, CRON_SECRET: 'c'.repeat(20), RESEND_API_KEY: 're_x', ALERTS_FROM_EMAIL: 'a@b.fr', AI_GATEWAY_API_KEY: 'k' });
  r = await call(health);
  assert.equal(r.body.features.auth, true); assert.equal(r.body.features.emailAlerts, true); assert.equal(r.body.features.aiLetter, true); assert.equal(r.body.features.whatsappAlerts, false);
  assert.ok(!JSON.stringify(r.body).includes('re_x'), 'aucun secret exposé');
});

test('register : crée le compte, cookie de session sécurisé, mot de passe haché argon2id', async () => {
  const r = await A('register', { method: 'POST', body: user });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.email, 'paul.martin@example.fr');
  assert.equal(r.body.user.password_hash, undefined);
  assert.match(r.cookie.raw, /^__Host-tp_session=/);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(r.cookie.raw.includes(attr), attr);
  const [row] = await pg.query('select password_hash from users');
  assert.match(row.password_hash, /^\$argon2id\$/);
});

test('register : validation (email, longueur du mot de passe, consentement) et doublon', async () => {
  assert.equal((await A('register', { method: 'POST', body: { ...user, email: 'pas-un-email' } })).status, 400);
  const short = await A('register', { method: 'POST', body: { ...user, password: '123456789' } });
  assert.equal(short.status, 400); assert.match(short.body.error.message, /10 caractères/);
  assert.equal((await A('register', { method: 'POST', body: { ...user, consent: false } })).status, 400);
  assert.equal((await A('register', { method: 'POST', body: user })).status, 201);
  const dup = await A('register', { method: 'POST', body: { ...user, email: 'PAUL.martin@example.fr' } });
  assert.equal(dup.status, 409); assert.equal(dup.body.error.code, 'email_taken');
});

test('login / me / logout : cycle complet, cookie falsifié refusé', async () => {
  await A('register', { method: 'POST', body: user });
  const bad = await A('login', { method: 'POST', body: { email: user.email, password: 'mauvais-mot-de-passe' } });
  assert.equal(bad.status, 401); assert.equal(typeof bad.body.error.message, 'string');
  const unknown = await A('login', { method: 'POST', body: { email: 'inconnu@example.fr', password: 'peu-importe-123' } });
  assert.equal(unknown.status, 401); assert.equal(unknown.body.error.message, bad.body.error.message, 'même message : pas d’énumération');
  const ok = await A('login', { method: 'POST', body: { email: ' paul.martin@EXAMPLE.fr ', password: user.password } });
  assert.equal(ok.status, 200);
  const cookie = ok.cookie.pair;
  const m = await A('me', { cookies: cookie });
  assert.equal(m.body.user.email, 'paul.martin@example.fr');
  assert.equal(m.body.features.auth, true);
  const tampered = cookie.replace(/.$/, c => (c === 'a' ? 'b' : 'a'));
  assert.equal((await A('me', { cookies: tampered })).body.user, null);
  assert.equal((await A('me')).body.user, null);
  const out = await A('logout', { method: 'POST', cookies: cookie });
  assert.equal(out.status, 200); assert.ok(out.cookie.cleared);
  assert.equal((await A('me', { cookies: cookie })).body.user, null, 'session révoquée côté serveur');
  assert.equal((await pg.query('select count(*)::int n from sessions'))[0].n, 1, 'seule la session du register reste');
});

test('sécurité : origine étrangère 403, mauvais Content-Type 415, méthode 405, route inconnue 404', async () => {
  assert.equal((await A('register', { method: 'POST', body: user, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await A('register', { method: 'POST', body: 'email=a', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await A('login', { method: 'GET' })).status, 405);
  assert.equal((await A('nimporte')).status, 404);
  process.env.APP_ORIGIN = 'https://talentpulse.fr';
  assert.equal((await A('register', { method: 'POST', body: user, headers: { origin: 'https://talentpulse.fr' } })).status, 201);
});

test('limitation de débit : 9e tentative sur le même email -> 429 avec Retry-After', async () => {
  await A('register', { method: 'POST', body: user });
  for (let i = 0; i < 8; i++) assert.equal((await A('login', { method: 'POST', body: { email: user.email, password: 'faux-mot-de-passe-' + i } })).status, 401);
  const r = await A('login', { method: 'POST', body: { email: user.email, password: user.password } });
  assert.equal(r.status, 429); assert.ok(r.headers['retry-after']);
  const [row] = await pg.query('select count(*)::int n from rate_limits');
  assert.ok(row.n >= 2);
  assert.ok(!(await pg.query('select key from rate_limits')).some(x => /paul|203\.0/.test(x.key)), 'clés hachées');
});

test('fonctionnalité désactivée : 503 propre, sans base de données', async () => {
  setEnv({});
  const r = await A('register', { method: 'POST', body: user });
  assert.equal(r.status, 503); assert.equal(r.body.error.code, 'feature_disabled');
  assert.equal((await A('me')).body.user, null);
  assert.equal((await call(me, { query: { resource: 'favorites' } })).status, 503);
});

test('suppression du compte (RGPD) : mot de passe exigé, toutes les données effacées en cascade', async () => {
  const reg = await A('register', { method: 'POST', body: user });
  const cookie = reg.cookie.pair;
  await call(me, { method: 'POST', query: { resource: 'favorites' }, cookies: cookie, body: { jobId: 'ft_123', job: { title: 'Serveur' } } });
  await call(me, { method: 'POST', query: { resource: 'alerts' }, cookies: cookie, body: { query: { kw: 'serveur', city: 'Lyon' }, channels: ['email'] } });
  assert.equal((await A('delete', { method: 'POST', cookies: cookie, body: { password: 'mauvais-mdp-000' } })).status, 401);
  const del = await A('delete', { method: 'POST', cookies: cookie, body: { password: user.password } });
  assert.equal(del.status, 200); assert.ok(del.cookie.cleared);
  for (const t of ['users', 'sessions', 'favorites', 'alerts']) assert.equal((await pg.query(`select count(*)::int n from ${t}`))[0].n, 0, t);
  assert.equal((await A('me', { cookies: cookie })).body.user, null);
});
