/**
 * /api/billing/status    GET  (connecté) -> { enabled, plan, planUntil, canManage, prices, limits }
 * /api/billing/checkout  POST (connecté) { interval: 'month' | 'year' } -> { url } (Stripe Checkout)
 * /api/billing/portal    POST (connecté) -> { url } (portail client Stripe : facture, carte, résiliation)
 * /api/billing/webhook   POST (Stripe, signé) -> { received: true }
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, HttpError } from '../../lib/http.js';
import { env, features } from '../../lib/env.js';
import { requireUser } from '../../lib/auth.js';
import { enforce } from '../../lib/ratelimit.js';
import { billingStatus, createCheckout, createPortal, verifySignature, handleEvent } from '../../lib/billing.js';

const MAX_WEBHOOK = 512 * 1024;

/** Corps brut, indispensable à la vérification de signature. Sur Vercel, req.body n'est jamais lu (flux intact). */
async function rawBody(req) {
  if (typeof req.on === 'function') {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_WEBHOOK) { reject(new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large')); req.destroy?.(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  const b = req.body;
  return Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : JSON.stringify(b ?? {});
}

const ACTIONS = {
  async status(req, res) {
    allowMethods(req, res, ['GET']);
    const user = await requireUser(req, res);
    return sendJson(res, 200, await billingStatus(user));
  },
  async checkout(req, res) {
    allowMethods(req, res, ['POST']);
    assertSameOrigin(req);
    const user = await requireUser(req, res);
    await enforce([{ key: 'checkout:' + user.id, limit: 10, windowSec: 3600 }]);
    const { interval } = await readJson(req);
    return sendJson(res, 200, { url: await createCheckout(user, interval === 'year' ? 'year' : 'month') });
  },
  async portal(req, res) {
    allowMethods(req, res, ['POST']);
    assertSameOrigin(req);
    const user = await requireUser(req, res);
    await enforce([{ key: 'portal:' + user.id, limit: 20, windowSec: 3600 }]);
    return sendJson(res, 200, { url: await createPortal(user) });
  },
  async webhook(req, res) {
    allowMethods(req, res, ['POST']);
    if (!features().billing) throw new HttpError(503, 'Facturation non configurée.', 'feature_disabled');
    const raw = await rawBody(req);
    if (!verifySignature(raw, req.headers?.['stripe-signature'], env('STRIPE_WEBHOOK_SECRET'))) throw new HttpError(400, 'Signature invalide.', 'bad_signature');
    let event;
    try { event = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON invalide.', 'invalid_json'); }
    if (!event?.id || !event?.type) throw new HttpError(400, 'Événement invalide.', 'invalid_event');
    await handleEvent(event);
    return sendJson(res, 200, { received: true });
  },
};

export default api(async (req, res) => {
  const name = String(req.query?.action || '');
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : null;
  if (!fn) throw new HttpError(404, 'Route inconnue.', 'not_found');
  return fn(req, res);
});
