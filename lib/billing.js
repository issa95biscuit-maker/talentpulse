/**
 * Abonnement TalentPulse Pro via Stripe (API REST en fetch direct, sans SDK).
 * Source unique pour savoir ce qu'un compte a le droit de faire : limitsFor(user).
 * Sans configuration Stripe (features().billing = false), tout le monde garde les limites actuelles.
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { features, env } from './env.js';
import { HttpError } from './http.js';
import { siteUrl } from './notify.js';

export const LIMITS = {
  free: { plan: 'free', alerts: 3, lettresPerDay: 3, whatsapp: false },
  pro: { plan: 'pro', alerts: 20, lettresPerDay: 50, whatsapp: true },
  // Facturation désactivée : limites historiques du site, rien ne change pour les comptes existants.
  legacy: { plan: 'free', alerts: 20, lettresPerDay: 20, whatsapp: true },
};
const GRACE_MS = 3 * 864e5; // délai de grâce après la fin de période (échec de paiement, retard de webhook)
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

let ready = null;
/** Migration à la volée (idempotente), comme ensureApplications : aucune étape manuelle obligatoire. */
export function ensureBilling() {
  ready ||= (async () => {
    for (const q of [
      `alter table users add column if not exists plan text not null default 'free'`,
      `alter table users add column if not exists plan_until timestamptz`,
      `alter table users add column if not exists stripe_customer_id text`,
      `alter table users add column if not exists stripe_subscription_id text`,
      `create unique index if not exists users_stripe_customer_idx on users (stripe_customer_id) where stripe_customer_id is not null`,
      `create table if not exists stripe_events (id text primary key, type text not null, received_at timestamptz not null default now())`,
      `insert into schema_migrations (version) values ('2026-11-21-billing') on conflict do nothing`,
    ]) await db().query(q);
  })().catch(e => { ready = null; throw e; });
  return ready;
}
export function _resetBilling() { ready = null; }

export function isPro(row, now = Date.now()) {
  return row?.plan === 'pro' && (!row.plan_until || new Date(row.plan_until).getTime() > now);
}

/** Charge plan / échéance du compte (null si pas connecté). */
export async function loadPlan(userId) {
  if (!userId || !features().billing) return null;
  await ensureBilling();
  const r = await db().query('select plan, plan_until, stripe_customer_id, stripe_subscription_id from users where id = $1', [userId]);
  return r[0] || null;
}

export async function limitsFor(user) {
  if (!features().billing) return LIMITS.legacy;
  if (!user) return LIMITS.free;
  return isPro(await loadPlan(user.id)) ? LIMITS.pro : LIMITS.free;
}

/** Ensemble des comptes Pro parmi une liste (cron des alertes). null = facturation désactivée. */
export async function proUserIds(ids) {
  if (!features().billing) return null;
  if (!ids.length) return new Set();
  await ensureBilling();
  const rows = await db().query('select id, plan, plan_until from users where id = any($1::uuid[])', [ids]);
  return new Set(rows.filter(r => isPro(r)).map(r => r.id));
}

export async function billingStatus(user) {
  const f = features();
  if (!f.billing) return { enabled: false, plan: 'free', limits: LIMITS.legacy };
  const row = await loadPlan(user.id);
  const pro = isPro(row);
  return {
    enabled: true,
    plan: pro ? 'pro' : 'free',
    planUntil: pro && row.plan_until ? new Date(row.plan_until).toISOString() : null,
    canManage: !!row?.stripe_customer_id,
    prices: { month: !!env('STRIPE_PRICE_MONTHLY'), year: !!env('STRIPE_PRICE_YEARLY') },
    limits: pro ? LIMITS.pro : LIMITS.free,
  };
}

// ── API Stripe ──
function flatten(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') flatten(v, key, out); else out.append(key, String(v));
  }
  return out;
}

export let stripeFetch = (url, init) => fetch(url, init);
export function _setStripeFetch(fn) { stripeFetch = fn; }

async function stripe(path, params, { method = 'POST', idempotencyKey } = {}) {
  const headers = { Authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const r = await stripeFetch('https://api.stripe.com/v1/' + path, { method, headers, body: params ? flatten(params).toString() : undefined, signal: AbortSignal.timeout(12000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[billing] Stripe', path, r.status, body?.error?.code || '', body?.error?.message || '');
    throw new HttpError(502, 'Le service de paiement est momentanément indisponible. Réessayez dans un instant.', 'billing_unavailable');
  }
  return body;
}

function requireBilling() {
  if (!features().billing) throw new HttpError(503, 'L’abonnement Pro arrive bientôt.', 'feature_disabled');
}

async function ensureCustomer(user, row) {
  if (row?.stripe_customer_id) return row.stripe_customer_id;
  const c = await stripe('customers', { email: user.email, name: user.prenom || undefined, metadata: { user_id: user.id } }, { idempotencyKey: 'tp-customer-' + user.id });
  // Si une requête concurrente a déjà enregistré un client, on garde le premier.
  const r = await db().query('update users set stripe_customer_id = coalesce(stripe_customer_id, $2) where id = $1 returning stripe_customer_id', [user.id, c.id]);
  return r[0]?.stripe_customer_id || c.id;
}

export const CGV_VERSION = '2026-11-21';

export async function createCheckout(user, interval, { acceptedCgv = false } = {}) {
  requireBilling();
  if (!acceptedCgv) throw new HttpError(400, 'Veuillez accepter les conditions générales de vente.', 'cgv_required');
  const price = interval === 'year' ? env('STRIPE_PRICE_YEARLY') : env('STRIPE_PRICE_MONTHLY');
  if (!price) throw new HttpError(400, 'Cette formule n’est pas disponible.', 'invalid_interval');
  const row = await loadPlan(user.id);
  if (isPro(row)) throw new HttpError(409, 'Votre abonnement Pro est déjà actif.', 'already_pro');
  const customer = await ensureCustomer(user, row);
  const base = siteUrl();
  const s = await stripe('checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: { 0: { price, quantity: 1 } },
    subscription_data: { metadata: { user_id: user.id, cgv_version: CGV_VERSION, cgv_accepted_at: new Date().toISOString() } },
    metadata: { user_id: user.id, cgv_version: CGV_VERSION },
    allow_promotion_codes: 'true',
    locale: 'fr',
    success_url: `${base}/mon-espace?pro=merci`,
    cancel_url: `${base}/tarifs?annule=1`,
  });
  return s.url;
}

export async function createPortal(user) {
  requireBilling();
  const row = await loadPlan(user.id);
  if (!row?.stripe_customer_id) throw new HttpError(404, 'Aucun abonnement à gérer.', 'no_subscription');
  const s = await stripe('billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${siteUrl()}/mon-espace` });
  return s.url;
}

// ── Webhook ──
/** Vérifie l'en-tête Stripe-Signature (HMAC-SHA256 de "t.corps", tolérance 5 min). */
export function verifySignature(raw, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  const parts = String(header || '').split(',').map(p => p.trim().split('='));
  const t = Number(parts.find(p => p[0] === 't')?.[1]);
  const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1] || '');
  if (!t || !sigs.length || !secret) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/** Fin de période : champ racine (API < 2025-03) ou porté par l'élément d'abonnement (API récentes). */
function periodEnd(sub) {
  const t = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  return t ? new Date(t * 1000 + GRACE_MS) : null;
}

async function applySubscription(sub) {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const userId = sub.metadata?.user_id || null;
  const rows = await db().query(
    'select id, stripe_subscription_id from users where stripe_customer_id = $1 or ($2::uuid is not null and id = $2::uuid) limit 1', [customer, userId]);
  if (!rows.length) { console.warn('[billing] abonnement sans compte', sub.id); return; }
  const u = rows[0];
  const active = ACTIVE.has(sub.status);
  // Un événement tardif sur un ancien abonnement ne doit pas écraser l'abonnement en cours.
  if (!active && u.stripe_subscription_id && u.stripe_subscription_id !== sub.id) return;
  if (active) {
    await db().query(
      `update users set plan = 'pro', plan_until = $2, stripe_subscription_id = $3, stripe_customer_id = coalesce(stripe_customer_id, $4), updated_at = now() where id = $1`,
      [u.id, periodEnd(sub)?.toISOString() || null, sub.id, customer]);
  } else {
    await db().query(`update users set plan = 'free', plan_until = null, updated_at = now() where id = $1`, [u.id]);
  }
}

export async function handleEvent(event) {
  await ensureBilling();
  const fresh = await db().query('insert into stripe_events (id, type) values ($1, $2) on conflict do nothing returning id', [event.id, event.type]);
  if (!fresh.length) return { duplicate: true };
  try {
    const o = event.data?.object || {};
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await applySubscription(o);
    } else if (event.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription) {
      // L'ordre des événements n'est pas garanti : on relit l'abonnement pour appliquer son état réel.
      const sub = await stripe('subscriptions/' + encodeURIComponent(typeof o.subscription === 'string' ? o.subscription : o.subscription.id), null, { method: 'GET' });
      if (!sub.metadata?.user_id && o.client_reference_id) sub.metadata = { ...sub.metadata, user_id: o.client_reference_id };
      await applySubscription(sub);
    }
    return { handled: true };
  } catch (e) {
    // Échec : on libère l'identifiant pour que Stripe puisse renvoyer l'événement.
    await db().query('delete from stripe_events where id = $1', [event.id]).catch(() => {});
    throw e;
  }
}
