/** Utilitaires HTTP communs aux fonctions /api (Vercel Node.js runtime). */
export class HttpError extends Error {
  constructor(status, message, code = 'error', extra) {
    super(message);
    this.status = status; this.code = code; this.extra = extra;
  }
}

export function sendJson(res, status, body, { cache = 'no-store' } = {}) {
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

const MAX_BODY = 64 * 1024;
export async function readJson(req) {
  const ct = String(req.headers?.['content-type'] || '');
  if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, 'Format de requête non pris en charge (JSON attendu).', 'unsupported_media_type');
  let b = req.body;
  if (b === undefined || b === null) {
    if (typeof req.on !== 'function') return {};
    b = await new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large')); req.destroy?.(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    if (b.length > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large');
    if (!b.trim()) return {};
    try { return JSON.parse(b); } catch { throw new HttpError(400, 'JSON invalide.', 'invalid_json'); }
  }
  return b;
}

export function parseCookies(req) {
  const out = {};
  String(req.headers?.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore */ } }
  });
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = true, sameSite = 'Lax', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (maxAge === 0) c += '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function appendSetCookie(res, cookie) {
  const prev = res.getHeader?.('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function isSecureRequest(req) {
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto) return proto === 'https';
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

export function clientIp(req) {
  const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.headers?.['x-real-ip'] || '') || req.socket?.remoteAddress || 'unknown';
}

/**
 * Protection CSRF : cookies SameSite=Lax + vérification de l'origine pour toute requête qui modifie des données.
 * Accepte l'hôte de la requête et APP_ORIGIN (liste séparée par des virgules).
 */
export function assertSameOrigin(req) {
  const m = String(req.method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').toLowerCase();
  const allowed = new Set(String(process.env.APP_ORIGIN || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const origin = String(req.headers?.origin || '');
  const check = (u) => { try { const x = new URL(u); return x.host.toLowerCase() === host || allowed.has(x.origin.toLowerCase()); } catch { return false; } };
  if (origin) { if (origin !== 'null' && check(origin)) return; throw new HttpError(403, 'Origine de la requête refusée.', 'bad_origin'); }
  const site = String(req.headers?.['sec-fetch-site'] || '');
  if (site === 'same-origin' || site === 'none') return;
  const ref = String(req.headers?.referer || '');
  if (ref && check(ref)) return;
  throw new HttpError(403, 'Origine de la requête refusée.', 'bad_origin');
}

export function allowMethods(req, res, methods) {
  const m = String(req.method || 'GET').toUpperCase();
  if (!methods.includes(m)) {
    res.setHeader('Allow', methods.join(', '));
    throw new HttpError(405, 'Méthode non autorisée.', 'method_not_allowed');
  }
  return m;
}

/** Enveloppe commune : en-têtes de sécurité, erreurs normalisées { error: { code, message } }. */
export function api(fn) {
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      return await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 429 && e.extra?.retryAfter) res.setHeader('Retry-After', String(e.extra.retryAfter));
        return sendJson(res, e.status, { error: { code: e.code, message: e.message, ...(e.extra?.fields ? { fields: e.extra.fields } : {}) } });
      }
      console.error('[api]', req.method, req.url, e);
      return sendJson(res, 500, { error: { code: 'internal', message: 'Erreur interne. Réessayez dans un instant.' } });
    }
  };
}
