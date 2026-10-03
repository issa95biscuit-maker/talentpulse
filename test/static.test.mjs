// Garde-fous sur le front statique : CSP cohérente avec le HTML, dev-server fidèle à Vercel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startDevServer } from '../scripts/dev-server.mjs';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;

test('chaque script en ligne de index.html est autorisé par une empreinte CSP', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/type="application\/ld\+json"/.test(m[1]));
  assert.ok(inline.length >= 1, 'script de thème attendu');
  for (const m of inline) {
    const h = createHash('sha256').update(m[2]).digest('base64');
    assert.ok(csp.includes(`'sha256-${h}'`), `empreinte manquante dans la CSP : sha256-${h}`);
  }
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), "script-src ne doit pas contenir 'unsafe-inline'");
  assert.ok(!/\son[a-z]+="/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'aucun gestionnaire on*= en ligne');
});

test('dev-server : réécritures SPA, en-têtes de sécurité, compression, police en cache long', async () => {
  const server = await startDevServer({ port: 0, quiet: true });
  const base = `http://localhost:${server.address().port}`;
  try {
    const r = await fetch(base + '/offres/serveur/lyon', { headers: { 'accept-encoding': 'br' } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await r.text(), /<h1/);
    const f = await fetch(base + '/fonts/inter-latin-var.woff2');
    assert.equal(f.status, 200);
    assert.match(f.headers.get('cache-control'), /immutable/);
    const h = await (await fetch(base + '/api/health')).json();
    assert.equal(h.ok, true);
    assert.equal(typeof h.features.auth, 'boolean');
  } finally { server.close(); }
});
