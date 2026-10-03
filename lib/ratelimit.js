/**
 * Limitation de débit à fenêtre fixe, partagée entre instances via Postgres.
 * Sans base de données : repli en mémoire (au mieux par instance).
 * Les clés sont des empreintes HMAC : aucune IP ni email n'est stocké en clair.
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { features } from './env.js';
import { HttpError } from './http.js';

const memory = new Map();

export function fingerprint(...parts) {
  const secret = String(process.env.AUTH_SECRET || 'talentpulse-rate-limit');
  return crypto.createHmac('sha256', secret).update(parts.join('|')).digest('base64url').slice(0, 32);
}

export async function hit(key, windowSec) {
  if (features().db) {
    const rows = await db().query(
      `insert into rate_limits (key, window_start, count)
       values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       on conflict (key, window_start) do update set count = rate_limits.count + 1
       returning count`, [key, windowSec]);
    if (Math.random() < 0.02) db().query(`delete from rate_limits where window_start < now() - interval '2 days'`).catch(() => {});
    return Number(rows[0].count);
  }
  const w = Math.floor(Date.now() / 1000 / windowSec);
  const k = key + ':' + w;
  const n = (memory.get(k) || 0) + 1;
  memory.set(k, n);
  if (memory.size > 5000) for (const old of memory.keys()) { if (!old.endsWith(':' + w)) memory.delete(old); }
  return n;
}

/** Lève une 429 si la limite est dépassée. rules = [{ key, limit, windowSec }] */
export async function enforce(rules, message = 'Trop de tentatives. Réessayez dans quelques minutes.') {
  for (const r of rules) {
    const n = await hit(r.key, r.windowSec);
    if (n > r.limit) throw new HttpError(429, message, 'rate_limited', { retryAfter: r.windowSec });
  }
}

export function _resetMemory() { memory.clear(); }
