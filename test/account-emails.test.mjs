// Sprint 4 : vérification d'adresse et mot de passe oublié (PGlite + Resend simulé).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ENV_BASE, setEnv, freshDb, call } from './helpers.mjs';
import auth from '../api/auth/[action].js';
import { features } from '../lib/env.js';

const MAIL_ENV = { ...ENV_BASE, RESEND_API_KEY: 're_test', AUTH_FROM_EMAIL: 'TalentPulse <compte@talentpulse.test>', APP_URL: 'https://preview.talentpulse.test' };
let pg, mails;
beforeEach(async () => {
  setEnv(MAIL_ENV);
  pg = await freshDb();
  mails = [];
  global.fetch = async (url, o) => {
    if (String(url).includes('api.resend.com')) { mails.push(JSON.parse(o.body)); return new Response('{"id":"em_1"}', { status: 200 }); }
    throw new Error('réseau inattendu ' + url);
  };
});
const post = (action, body, cookies, headers) => call(auth, { method: 'POST', query: { action }, body, cookies, headers });
const tokenFrom = mail => decodeURIComponent(mail.text.match(/#t=([^\s]+)/)[1]);
const register = (email = 'lea@example.fr') => post('register', { email, password: 'un-mot-de-passe-long', prenom: 'Léa', consent: true });

test('fonction masquée sans Resend : routes 503, aucun e-mail, inscription intacte', async () => {
  setEnv(ENV_BASE);
  assert.equal(features().accountEmails, false);
  const r = await register();
  assert.equal(r.status, 201); assert.equal(r.body.verificationSent, false); assert.equal(mails.length, 0);
  assert.equal((await post('forgot', { email: 'lea@example.fr' })).status, 503);
  assert.equal((await post('reset', { token: 'x'.repeat(30), password: 'nouveau-mot-de-passe' })).status, 503);
  const me = await call(auth, { query: { action: 'me' }, cookies: r.cookie.pair });
  assert.equal(me.body.features.accountEmails, false);
});

test('inscription : e-mail de vérification (lien #t=, 48 h), vérification à usage unique', async () => {
  const r = await register();
  assert.equal(r.status, 201); assert.equal(r.body.verificationSent, true); assert.equal(r.body.user.emailVerified, false);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.deepEqual(m.to, ['lea@example.fr']); assert.equal(m.from, 'TalentPulse <compte@talentpulse.test>');
  assert.match(m.subject, /Confirmez votre adresse/);
  assert.match(m.text, /^Bonjour Léa,/);
  assert.match(m.text, /https:\/\/preview\.talentpulse\.test\/verifier-email#t=/);
  const token = tokenFrom(m);
  const stored = await pg.query('select id, purpose, expires_at from auth_tokens');
  assert.equal(stored.length, 1); assert.ok(!stored[0].id.includes(token.split('.')[0]), 'seule l’empreinte est stockée');
  const ttl = (new Date(stored[0].expires_at) - Date.now()) / 3600e3; assert.ok(ttl > 47 && ttl <= 48);
  const v = await post('verify', { token });
  assert.equal(v.status, 200); assert.equal(v.body.user.emailVerified, true);
  assert.equal((await post('verify', { token })).status, 400, 'jeton déjà utilisé');
  const me = await call(auth, { query: { action: 'me' }, cookies: r.cookie.pair });
  assert.equal(me.body.user.emailVerified, true);
});

test('vérification : jeton falsifié, signature d’un autre usage, renvoi limité', async () => {
  const r = await register();
  const token = tokenFrom(mails[0]);
  const [raw] = token.split('.');
  assert.equal((await post('verify', { token: raw + '.' + 'A'.repeat(32) })).status, 400, 'signature invalide');
  assert.equal((await post('reset', { token, password: 'nouveau-mot-de-passe' })).status, 400, 'jeton de vérification refusé pour une réinitialisation');
  for (let i = 0; i < 3; i++) assert.equal((await post('resend-verification', {}, r.cookie.pair)).status, 200);
  assert.equal((await post('resend-verification', {}, r.cookie.pair)).status, 429);
  assert.equal((await post('verify', { token })).status, 400, 'un nouveau lien invalide le précédent');
  assert.equal((await post('verify', { token: tokenFrom(mails.at(-1)) })).status, 200);
  assert.equal((await post('resend-verification', {})).status, 401, 'connexion requise');
});

test('mot de passe oublié : réponse identique, lien 1 h, usage unique, sessions fermées', async () => {
  const r = await register();
  mails.length = 0;
  const unknown = await post('forgot', { email: 'personne@example.fr' });
  const known = await post('forgot', { email: 'LEA@example.fr' });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200);
  assert.equal(unknown.body.message, known.body.message, 'pas d’énumération des comptes');
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /Réinitialisez votre mot de passe/);
  assert.match(mails[0].text, /\/nouveau-mot-de-passe#t=/); assert.match(mails[0].text, /1 heure/);
  const row = (await pg.query(`select expires_at from auth_tokens where purpose = 'reset'`))[0];
  const ttl = (new Date(row.expires_at) - Date.now()) / 60e3; assert.ok(ttl > 59 && ttl <= 60, 'expire en 1 h');
  const token = tokenFrom(mails[0]);
  assert.equal((await post('reset', { token, password: 'court' })).status, 400, 'mot de passe trop court');
  const ok = await post('reset', { token, password: 'nouveau-mot-de-passe-solide' });
  assert.equal(ok.status, 200); assert.ok(ok.cookie && !ok.cookie.cleared, 'reconnecté');
  assert.equal(ok.body.user.emailVerified, true, 'le lien prouve la possession de l’adresse');
  assert.equal((await post('reset', { token, password: 'encore-un-autre-mdp' })).status, 400, 'usage unique');
  const old = await call(auth, { query: { action: 'me' }, cookies: r.cookie.pair });
  assert.equal(old.body.user, null, 'ancienne session fermée');
  assert.equal((await post('login', { email: 'lea@example.fr', password: 'un-mot-de-passe-long' })).status, 401);
  assert.equal((await post('login', { email: 'lea@example.fr', password: 'nouveau-mot-de-passe-solide' })).status, 200);
});

test('mot de passe oublié : lien expiré refusé, nouvelle demande invalide l’ancienne, limitation', async () => {
  await register();
  mails.length = 0;
  await post('forgot', { email: 'lea@example.fr' });
  const t1 = tokenFrom(mails[0]);
  await pg.query(`update auth_tokens set expires_at = now() - interval '1 minute' where purpose = 'reset'`);
  assert.equal((await post('reset', { token: t1, password: 'nouveau-mot-de-passe-solide' })).status, 400, 'expiré');
  await post('forgot', { email: 'lea@example.fr' });
  await post('forgot', { email: 'lea@example.fr' });
  const t2 = tokenFrom(mails[1]), t3 = tokenFrom(mails[2]);
  assert.equal((await post('reset', { token: t2, password: 'nouveau-mot-de-passe-solide' })).status, 400, 'remplacé par le lien suivant');
  assert.equal((await post('forgot', { email: 'lea@example.fr' })).status, 429, '3 demandes par heure et par adresse');
  assert.equal((await post('reset', { token: t3, password: 'nouveau-mot-de-passe-solide' })).status, 200);
});

test('liens : jamais construits depuis l’en-tête Host', async () => {
  setEnv({ ...MAIL_ENV, APP_URL: '' , VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'talentpulse-git-sprint-4-seo-comptes-talentpulse.vercel.app' });
  await post('register', { email: 'x@example.fr', password: 'un-mot-de-passe-long', consent: true }, undefined, { host: 'evil.example', origin: 'https://evil.example' });
  assert.ok(mails.length === 0 || !/evil/.test(mails[0].text));
  mails.length = 0;
  await post('forgot', { email: 'lea@example.fr' }).catch(() => {});
  await register('y@example.fr');
  assert.match(mails.at(-1).text, /https:\/\/talentpulse-git-sprint-4-seo-comptes-talentpulse\.vercel\.app\/verifier-email#t=/);
  delete process.env.VERCEL_ENV; delete process.env.VERCEL_BRANCH_URL;
});

test('alertes : e-mails envoyés uniquement aux adresses vérifiées', async () => {
  const { runAlerts } = await import('../lib/alerts-runner.js');
  setEnv({ ...MAIL_ENV, CRON_SECRET: 's'.repeat(24), ALERTS_FROM_EMAIL: 'a@b.fr' });
  const me = (await import('../api/me/[resource].js')).default;
  const r = await register();
  await call(me, { cookies: r.cookie.pair, method: 'POST', query: { resource: 'alerts' }, body: { query: { kw: 'x' }, channels: ['email'] } });
  mails.length = 0;
  const search = async () => ({ body: { resultats: [{ id: 'ft_1', title: 'T', url: 'https://x.fr' }] } });
  let s = await runAlerts({ search });
  assert.equal(s.sent.email, 0); assert.equal(mails.length, 0);
  await pg.query('update users set email_verified_at = now()');
  await pg.query('update alerts set last_run_at = null');
  s = await runAlerts({ search });
  assert.equal(s.sent.email, 1);
});
