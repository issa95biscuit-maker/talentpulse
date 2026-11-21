import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshDb, call, setEnv, ENV_BASE } from './helpers.mjs';
import auth from '../api/auth/[action].js';
import me from '../api/me/[resource].js';
import billing from '../api/billing/[action].js';
import { _setStripeFetch, verifySignature, limitsFor, proUserIds, LIMITS } from '../lib/billing.js';

const STRIPE = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y', APP_URL: 'https://talentpulse.test' };
let cookie, pg, userId, stripeCalls;
const B = (action, opts = {}) => call(billing, { cookies: cookie, ...opts, query: { action } });
const M = (resource, opts = {}) => call(me, { cookies: cookie, ...opts, query: { resource, ...(opts.query || {}) } });

function signed(event, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(event);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${sig}`, origin: 'https://evil.example' } };
}
const subEvent = (id, type, sub) => ({ id, type, data: { object: { object: 'subscription', customer: 'cus_1', metadata: { user_id: userId }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] }, ...sub } } });

async function setup(env) {
  setEnv({ ...ENV_BASE, ...env }); pg = await freshDb();
  stripeCalls = [];
  _setStripeFetch(async (url, init) => {
    stripeCalls.push({ url, body: init.body ? new URLSearchParams(init.body) : null, idem: init.headers['Idempotency-Key'] });
    if (url.endsWith('/customers')) return Response.json({ id: 'cus_1' });
    if (url.endsWith('/checkout/sessions')) return Response.json({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    if (url.endsWith('/billing_portal/sessions')) return Response.json({ url: 'https://billing.stripe.com/p/1' });
    if (url.includes('/subscriptions/')) return Response.json({ id: 'sub_1', status: 'active', customer: 'cus_1', metadata: {}, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] } });
    return Response.json({ error: { message: 'inconnu' } }, { status: 404 });
  });
  const r = await call(auth, { method: 'POST', query: { action: 'register' }, body: { email: 'lea@example.fr', password: 'un-mot-de-passe-long', prenom: 'Léa', consent: true } });
  cookie = r.cookie.pair;
  userId = (await pg.query('select id from users'))[0].id;
}

beforeEach(() => setup(STRIPE));

test('facturation non configurée : limites historiques, aucune route payante', async () => {
  await setup({});
  assert.deepEqual(await limitsFor({ id: userId }), LIMITS.legacy);
  assert.equal((await B('status')).body.enabled, false);
  assert.equal((await B('checkout', { method: 'POST', body: { interval: 'month' } })).status, 503);
  assert.equal(await proUserIds([userId]), null);
  for (let i = 0; i < 5; i++) assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'metier' + i } } })).status, 201);
});

test('compte gratuit : 3 alertes, WhatsApp réservé au Pro, invitation à passer Pro', async () => {
  const s = await B('status');
  assert.equal(s.body.plan, 'free'); assert.equal(s.body.limits.alerts, 3);
  for (let i = 0; i < 3; i++) assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'metier' + i } } })).status, 201);
  const over = await M('alerts', { method: 'POST', body: { query: { kw: 'de trop' } } });
  assert.equal(over.status, 409); assert.equal(over.body.error.upgrade, true);
  const wa = await M('alerts', { method: 'POST', body: { query: { kw: 'x' }, channels: ['whatsapp'], whatsappTo: '+33612345678' } });
  assert.equal(wa.status, 403); assert.equal(wa.body.error.code, 'pro_required');
});

test('checkout : client Stripe créé une seule fois, session d’abonnement, non connecté refusé', async () => {
  assert.equal((await call(billing, { method: 'POST', query: { action: 'checkout' }, body: { interval: 'month' } })).status, 401);
  const r = await B('checkout', { method: 'POST', body: { interval: 'year' } });
  assert.equal(r.status, 200); assert.equal(r.body.url, 'https://checkout.stripe.com/c/cs_1');
  const cs = stripeCalls.find(c => c.url.endsWith('/checkout/sessions')).body;
  assert.equal(cs.get('mode'), 'subscription'); assert.equal(cs.get('line_items[0][price]'), 'price_y');
  assert.equal(cs.get('client_reference_id'), userId); assert.equal(cs.get('subscription_data[metadata][user_id]'), userId);
  await B('checkout', { method: 'POST', body: { interval: 'month' } });
  assert.equal(stripeCalls.filter(c => c.url.endsWith('/customers')).length, 1, 'client réutilisé');
  assert.equal((await pg.query('select stripe_customer_id from users'))[0].stripe_customer_id, 'cus_1');
});

test('webhook : signature obligatoire, activation Pro, idempotence, résiliation', async () => {
  const ev = subEvent('evt_1', 'customer.subscription.created', { id: 'sub_1', status: 'active' });
  const bad = signed(ev, 'whsec_autre');
  assert.equal((await call(billing, { ...bad, query: { action: 'webhook' } })).status, 400);
  const old = signed(ev, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await call(billing, { ...old, query: { action: 'webhook' } })).status, 400, 'rejeu ancien refusé');

  assert.equal((await call(billing, { ...signed(ev), query: { action: 'webhook' } })).status, 200);
  let s = await B('status');
  assert.equal(s.body.plan, 'pro'); assert.equal(s.body.limits.alerts, 20); assert.equal(s.body.canManage, true);
  assert.deepEqual([...await proUserIds([userId])], [userId]);
  assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'x' }, channels: ['whatsapp'], whatsappTo: '+33612345678' } })).status, 201);
  assert.equal((await B('checkout', { method: 'POST', body: { interval: 'month' } })).status, 409, 'déjà Pro');
  assert.equal((await B('portal', { method: 'POST' })).body.url, 'https://billing.stripe.com/p/1');

  // Événement tardif d'un ancien abonnement : ignoré
  await call(billing, { ...signed(subEvent('evt_2', 'customer.subscription.deleted', { id: 'sub_ancien', status: 'canceled' })), query: { action: 'webhook' } });
  assert.equal((await B('status')).body.plan, 'pro');

  const del = subEvent('evt_3', 'customer.subscription.deleted', { id: 'sub_1', status: 'canceled' });
  await call(billing, { ...signed(del), query: { action: 'webhook' } });
  assert.equal((await B('status')).body.plan, 'free');
  // Même identifiant d'événement renvoyé par Stripe : sans effet
  await pg.query(`update users set plan = 'pro'`);
  await call(billing, { ...signed(del), query: { action: 'webhook' } });
  assert.equal((await pg.query('select plan from users'))[0].plan, 'pro');
});

test('webhook checkout.session.completed : relit l’abonnement et active le Pro', async () => {
  await B('checkout', { method: 'POST', body: { interval: 'month' } });
  const ev = { id: 'evt_cs', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', client_reference_id: userId } } };
  assert.equal((await call(billing, { ...signed(ev), query: { action: 'webhook' } })).status, 200);
  assert.equal((await B('status')).body.plan, 'pro');
});

test('abonnement expiré (fin de période + grâce dépassée) : retour au gratuit', async () => {
  await pg.query(`update users set plan = 'pro', plan_until = now() - interval '1 hour'`);
  assert.equal((await B('status')).body.plan, 'free');
});

test('verifySignature : plusieurs v1 acceptés, en-tête malformé refusé', () => {
  const t = Math.floor(Date.now() / 1000), raw = '{"a":1}';
  const good = crypto.createHmac('sha256', 's').update(`${t}.${raw}`).digest('hex');
  assert.equal(verifySignature(raw, `t=${t},v1=abc,v1=${good}`, 's'), true);
  assert.equal(verifySignature(raw, 'n_importe_quoi', 's'), false);
  assert.equal(verifySignature(raw, `t=${t},v1=${good}`, ''), false);
});
