#!/usr/bin/env node
/**
 * Serveur de développement local (sans Vercel CLI ni compte) :
 *   - sert public/ avec les rewrites et en-têtes de vercel.json ;
 *   - exécute les fonctions api/ (y compris les routes dynamiques [action] / [resource]).
 *
 *   npm run dev              → utilise les variables d'environnement présentes (aucune = mode local, comme en prod sans clés)
 *   npm run dev -- --demo    → base Postgres en mémoire (PGlite) + AUTH_SECRET éphémère : comptes testables en local
 *
 * Options : PORT (défaut 3000), DEV_JOBS_UPSTREAM=https://… (relaie /api/jobs vers un déploiement existant
 * quand les clés France Travail / Adzuna ne sont pas disponibles en local).
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// Routes API : chemin → [fichier, paramètre dynamique éventuel]
const API_ROUTES = [
  [/^\/api\/auth\/([a-z-]+)$/, 'api/auth/[action].js', 'action'],
  [/^\/api\/me\/([a-z-]+)$/, 'api/me/[resource].js', 'resource'],
  [/^\/api\/cron\/alerts$/, 'api/cron/alerts.js'],
  [/^\/api\/(health|jobs|lettre|suggest|unsubscribe)$/, null],
];

function patternToRegex(source) {
  // Sous-ensemble de path-to-regexp utilisé par vercel.json : /:path*, :param, (.*)
  const esc = source.replace(/\(\.\*\)/g, '\u0000').replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\/:path\*/g, '(?:/.*)?').replace(/:([a-z]+)\*/gi, '.*').replace(/:([a-z]+)/gi, '[^/]+').replace(/\u0000/g, '.*') + '$');
}

function decorate(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(b)); return res; };
  res.send = b => { res.end(typeof b === 'string' || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
  return res;
}

export async function startDevServer({ port = Number(process.env.PORT || 3000), demo = process.argv.includes('--demo'), quiet = false } = {}) {
  const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  const rewrites = (vercel.rewrites || []).map(r => ({ re: patternToRegex(r.source), dest: r.destination }));
  const headerRules = (vercel.headers || []).map(h => ({ re: patternToRegex(h.source), headers: h.headers }));

  if (demo) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { setDb } = await import('../lib/db.js');
    const pg = new PGlite();
    await pg.exec(await readFile(path.join(ROOT, 'db/schema.sql'), 'utf8'));
    setDb({ query: async (text, params = []) => (await pg.query(text, params)).rows });
    process.env.DATABASE_URL ||= 'postgres://demo@pglite/demo';
    process.env.AUTH_SECRET ||= randomBytes(48).toString('base64'); // éphémère, régénéré à chaque démarrage
    if (!quiet) console.log('[dev] mode démo : Postgres en mémoire (PGlite), comptes activés');
  }

  const cache = new Map();
  async function loadHandler(file) {
    if (!cache.has(file)) cache.set(file, import(pathToFileURL(path.join(ROOT, file)).href).then(m => m.default));
    return cache.get(file);
  }

  const server = http.createServer(async (req, res) => {
    decorate(res);
    const u = new URL(req.url, 'http://localhost');
    try {
      if (u.pathname.startsWith('/api/')) {
        if (u.pathname === '/api/jobs' && process.env.DEV_JOBS_UPSTREAM && !process.env.FT_CLIENT_ID) {
          const r = await fetch(process.env.DEV_JOBS_UPSTREAM.replace(/\/$/, '') + '/api/jobs' + u.search);
          res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
          return res.end(Buffer.from(await r.arrayBuffer()));
        }
        for (const [re, file, param] of API_ROUTES) {
          const m = re.exec(u.pathname);
          if (!m) continue;
          const handler = await loadHandler(file || `api/${m[1]}.js`);
          req.query = Object.fromEntries(u.searchParams);
          if (param) req.query[param] = m[1];
          return await handler(req, res);
        }
        return res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue.' } });
      }
      let rel = decodeURIComponent(u.pathname);
      let file = path.join(PUBLIC, rel);
      if (!file.startsWith(PUBLIC)) return res.status(403).end('Forbidden');
      let st = await stat(file).catch(() => null);
      if (st && st.isDirectory()) { file = path.join(file, 'index.html'); st = await stat(file).catch(() => null); }
      if (!st) {
        const rw = rewrites.find(r => r.re.test(rel));
        if (!rw) return res.status(404).end('404 — introuvable');
        rel = rw.dest; file = path.join(PUBLIC, rw.dest);
      }
      for (const h of headerRules) if (h.re.test(u.pathname)) h.headers.forEach(({ key, value }) => res.setHeader(key, value));
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
      // Comme Vercel : compression brotli/gzip des ressources texte.
      const ext = path.extname(file);
      const ae = String(req.headers['accept-encoding'] || '');
      if (['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.webmanifest'].includes(ext) && /\b(br|gzip)\b/.test(ae)) {
        const br = /\bbr\b/.test(ae);
        res.setHeader('content-encoding', br ? 'br' : 'gzip');
        res.setHeader('vary', 'Accept-Encoding');
        return createReadStream(file).pipe(br ? zlib.createBrotliCompress() : zlib.createGzip()).pipe(res);
      }
      createReadStream(file).pipe(res);
    } catch (err) {
      console.error('[dev]', err);
      if (!res.headersSent) res.status(500).json({ error: { code: 'internal', message: 'Erreur interne (dev).' } });
    }
  });
  await new Promise(r => server.listen(port, r));
  if (!quiet) console.log(`[dev] http://localhost:${port}`);
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) startDevServer();
