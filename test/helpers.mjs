import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../lib/db.js';
import { _resetMemory } from '../lib/ratelimit.js';

export const ENV_BASE = {
  DATABASE_URL: 'postgres://test@local/test',
  AUTH_SECRET: 'test-secret-'.padEnd(48, 'x'),
};

export function setEnv(vars) {
  for (const k of ['DATABASE_URL', 'AUTH_SECRET', 'AI_GATEWAY_API_KEY', 'AI_LETTER_ENABLED', 'VERCEL', 'CRON_SECRET', 'RESEND_API_KEY', 'ALERTS_FROM_EMAIL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_CONTENT_SID', 'APP_ORIGIN']) delete process.env[k];
  Object.assign(process.env, vars);
}

/** Base Postgres réelle en mémoire (PGlite = Postgres compilé en WASM) avec le schéma de production. */
export async function freshDb() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const adapter = { pg, query: async (text, params = []) => (await pg.query(text, params)).rows };
  setDb(adapter);
  _resetMemory();
  return adapter;
}

/** Simule l'objet requête/réponse des fonctions Node.js de Vercel. */
export async function call(handler, { method = 'GET', query = {}, body, headers = {}, cookies } = {}) {
  const h = { host: 'talentpulse.test', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.7', ...headers };
  if (method !== 'GET' && !('origin' in headers)) h.origin = 'https://talentpulse.test';
  if (body !== undefined && !('content-type' in headers)) h['content-type'] = 'application/json';
  if (cookies) h.cookie = cookies;
  const req = { method, query, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), url: '/test' };
  return new Promise((resolve, reject) => {
    const headersOut = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headersOut[k.toLowerCase()] = v; },
      getHeader(k) { return headersOut[k.toLowerCase()]; },
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(b)), headers: headersOut, cookie: cookieFrom(headersOut) }); return this; },
      send(b) { resolve({ status: this.statusCode, text: String(b), headers: headersOut, cookie: cookieFrom(headersOut) }); return this; },
      end(b) { resolve({ status: this.statusCode, text: b ? String(b) : '', headers: headersOut, cookie: cookieFrom(headersOut) }); return this; },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function cookieFrom(h) {
  const sc = h['set-cookie'];
  if (!sc) return null;
  const list = Array.isArray(sc) ? sc : [sc];
  const last = list[list.length - 1];
  return { raw: last, pair: last.split(';')[0], cleared: /Max-Age=0/.test(last) };
}
