/**
 * POST /api/sites-pro — enregistre une demande « site pro ».
 * Aucun e-mail n'est envoyé. Champ piège `website` et limite de débit.
 * JSON : { ok: true }. Formulaire HTML : redirection 303 vers /sites-pro.
 */
import { api, sendJson, readJson, allowMethods, assertSameOrigin, clientIp, HttpError } from '../lib/http.js';
import { features } from '../lib/env.js';
import { parse, siteLeadSchema } from '../lib/validate.js';
import { enforce, fingerprint } from '../lib/ratelimit.js';
import { db } from '../lib/db.js';

const IP_LIMIT = 8;
const IP_WINDOW = 600;
const MAIL_LIMIT = 3;
const MAIL_WINDOW = 86400;
const UNAVAILABLE = 'Le formulaire est momentanément indisponible. Réessayez plus tard.';

function isForm(req) {
  return /^application\/x-www-form-urlencoded\b/i.test(String(req.headers?.['content-type'] || ''));
}

async function readStream(req, max) {
  if (typeof req.on !== 'function') return '';
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large'));
        req.destroy?.();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readInput(req) {
  const ct = String(req.headers?.['content-type'] || '');
  if (/^application\/json\b/i.test(ct)) return readJson(req);
  if (/^application\/x-www-form-urlencoded\b/i.test(ct)) {
    let raw = req.body;
    if (raw == null) raw = await readStream(req, 16000);
    if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
    if (typeof raw !== 'string') throw new HttpError(400, 'Formulaire illisible.', 'invalid_body');
    if (raw.length > 16000) throw new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large');
    const out = {};
    for (const [k, v] of new URLSearchParams(raw)) if (!(k in out)) out[k] = v;
    return out;
  }
  throw new HttpError(415, 'Format de requête non pris en charge.', 'unsupported_media_type');
}

function trapFilled(raw) {
  if (!raw || typeof raw !== 'object') return false;
  for (const key of ['website', 'company_url', 'fax']) {
    const v = raw[key];
    if (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false) return true;
  }
  return false;
}

function redirect(res, query) {
  res.setHeader('Location', '/sites-pro?' + query);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.status(303).end();
  return true;
}

export default api(async (req, res) => {
  allowMethods(req, res, ['POST']);
  assertSameOrigin(req);
  const form = isForm(req);
  const raw = await readInput(req);

  const limited = async (rules, message) => {
    try {
      await enforce(rules, message);
    } catch (e) {
      if (e instanceof HttpError) {
        if (form && e.status === 429) return redirect(res, 'erreur=limite');
        throw e;
      }
      console.error('[sites-pro] limite indisponible');
      if (form) return redirect(res, 'erreur=indisponible');
      throw new HttpError(503, UNAVAILABLE, 'unavailable');
    }
    return null;
  };

  if (await limited(
    [{ key: 'sitepro-ip:' + fingerprint('ip', clientIp(req)), limit: IP_LIMIT, windowSec: IP_WINDOW }],
    'Trop de demandes. Réessayez dans quelques minutes.'
  )) return;

  if (trapFilled(raw)) {
    if (form) return redirect(res, 'envoye=1');
    return sendJson(res, 200, { ok: true });
  }

  let data;
  try {
    data = parse(siteLeadSchema, raw);
  } catch (e) {
    if (form && e instanceof HttpError) return redirect(res, 'erreur=validation');
    throw e;
  }

  if (!features().db) {
    if (form) return redirect(res, 'erreur=indisponible');
    throw new HttpError(503, UNAVAILABLE, 'feature_disabled');
  }

  if (await limited(
    [{ key: 'sitepro-mail:' + fingerprint('email', data.email), limit: MAIL_LIMIT, windowSec: MAIL_WINDOW }],
    'Trop de demandes pour cette adresse. Réessayez demain.'
  )) return;

  try {
    await db().query(
      `insert into site_leads (name, email, activity, message, plan) values ($1, $2, $3, $4, $5)`,
      [data.name, data.email, data.activity, data.message, data.plan]
    );
  } catch {
    console.error('[sites-pro] enregistrement impossible');
    if (form) return redirect(res, 'erreur=indisponible');
    throw new HttpError(503, UNAVAILABLE, 'unavailable');
  }
  return form ? redirect(res, 'envoye=1') : sendJson(res, 200, { ok: true });
});
