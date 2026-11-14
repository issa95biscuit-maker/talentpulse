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
    const cgu = await fetch(base + '/cgu');
    const cguHtml = await cgu.text();
    assert.equal(cgu.status, 200);
    assert.match(cguHtml, /<title>Conditions générales d’utilisation — TalentPulse<\/title>/);
    assert.match(cguHtml, /<link rel="canonical" href="https:\/\/talentpulse-topaz\.vercel\.app\/cgu">/);
    assert.doesNotMatch(cguHtml, /<title>TalentPulse — Toutes les offres/);
    assert.doesNotMatch(cguHtml, /<h1 class="hero-title" id="homeTitle">/);
    assert.match(cguHtml, /<h1 id="legalPageTitle">Conditions Générales d’Utilisation<\/h1>/);
    assert.match(cguHtml, /<section class="page active" id="page-legal"/);
    const login = await fetch(base + '/connexion');
    const loginHtml = await login.text();
    assert.match(loginHtml, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(loginHtml, /<link rel="canonical" href="https:\/\/talentpulse-topaz\.vercel\.app\/connexion">/);
    assert.equal(login.headers.get('x-robots-tag'), 'noindex, nofollow');
    const f = await fetch(base + '/fonts/inter-latin-var.woff2');
    assert.equal(f.status, 200);
    assert.match(f.headers.get('cache-control'), /immutable/);
    const h = await (await fetch(base + '/api/health')).json();
    assert.equal(h.ok, true);
    assert.equal(typeof h.features.auth, 'boolean');
  } finally { server.close(); }
});

test('pied de page et fiche : sources citées, pas de promesse de doublons, détail fermé inerte', async () => {
  assert.ok(!/Doublons supprimés/.test(html), 'pas de mention « Doublons supprimés »');
  assert.match(html, /Choisir le Service Public/);
  assert.match(html, /id="detail"[^>]*\bhidden\b/);
  assert.match(html, /id="detail"[^>]*\binert\b/);
  assert.match(html, /\.detail\[hidden\]\{display:none !important\}/);
  const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /timeout: 8000/);
  assert.match(app, /Compte créé/);
  assert.match(app, /Contrat non communiqué/);
  assert.match(app, /Salaire non communiqué/);
  assert.match(app, /lieu non reconnu/);
  assert.ok(!/Les comptes TalentPulse arrivent bientôt\.' \}/.test(app), 'meta connexion ne promet plus les comptes');
  assert.ok(vercel.rewrites.some(r => r.source === '/offre/:id' && r.destination.includes('offre=:id')));
});

test('accueil : un seul h1, les vues masquées sont en h2', () => {
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1 class="hero-title" id="homeTitle">/);
  for (const id of ['jobsHeader', 'lettreTitle', 'conseilsTitle', 'profName', 'linkTitle', 'authTitle']) {
    assert.match(html, new RegExp(`<h2[^>]*\\bid="${id}"`), id);
    assert.ok(!new RegExp(`<h1[^>]*\\bid="${id}"`).test(html), id);
  }
});

test('recherche : sélecteur de distance 0/5/10/20/50 km, défaut 10', async () => {
  for (const id of ['searchDistance', 'rsDistance', 'filterDistance']) {
    const re = new RegExp(`<select[^>]*\\bid="${id}"[\\s\\S]*?<\\/select>`);
    const m = html.match(re);
    assert.ok(m, id + ' présent');
    const block = m[0];
    assert.match(block, /<option value="0">Ville exacte<\/option>/);
    assert.match(block, /<option value="5">5 km<\/option>/);
    assert.match(block, /<option value="10" selected>10 km<\/option>/);
    assert.match(block, /<option value="20">20 km<\/option>/);
    assert.match(block, /<option value="50">50 km<\/option>/);
  }
  const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /qs\.set\('distance', String\(parseDistance\(params\.distance\)\)\)/);
  assert.match(app, /path \+ '\?distance=' \+ d/);
});

test('fonctions en fra1, pages SEO routées vers le rendu serveur', () => {
  assert.deepEqual(vercel.regions, ['fra1']);
  assert.equal(vercel.functions['api/cron/alerts.js'].maxDuration, 60);
  assert.equal(vercel.functions['api/cron/alerts.js'].includeFiles, 'lib/data/**');
  assert.equal(vercel.functions['api/lettre.js'].maxDuration, 30);
  assert.equal(vercel.functions['api/seo.js'].includeFiles, 'public/index.html,lib/data/**');
  assert.equal(vercel.functions['api/jobs.js'].includeFiles, 'lib/data/**');
  assert.equal(vercel.functions['api/jobs.js'].maxDuration, 15);
  for (const path of ['/cgu', '/contact', '/a-propos', '/mentions-legales', '/confidentialite', '/connexion', '/mon-espace']) {
    const rw = vercel.rewrites.find(r => r.source === path);
    assert.equal(rw && rw.destination, '/api/seo?page=' + path.slice(1), path);
  }
});

test('footer et drawer : À propos, Contact et CGU pointent vers de vraies pages', () => {
  assert.ok(!/data-legal=/.test(html), 'plus de data-legal');
  for (const path of ['/a-propos', '/contact', '/cgu']) {
    assert.ok(html.includes(`href="${path}"`), path + ' présent');
  }
  const rewrites = vercel.rewrites.map(r => r.source);
  for (const path of ['/a-propos', '/contact', '/cgu']) {
    assert.ok(rewrites.includes(path), 'rewrite Vercel ' + path);
  }
});

test('SSR lettre/conseils, pages légales partagées, 404 et détails d’affichage', async () => {
  assert.ok(vercel.rewrites.some(r => r.source === '/lettre' && r.destination.includes('page=lettre')));
  assert.ok(vercel.rewrites.some(r => r.source === '/conseils' && r.destination.includes('page=conseils')));
  assert.match(html, /<script src="\/assets\/legal-pages\.js\?v=\d+" defer>/);
  assert.match(html, /id="liveJobStat"[^>]*\bhide\b|class="trust-item hide" id="liveJobStat"/);
  assert.match(html, /\.auth-foot a\{[^}]*white-space:nowrap/);
  assert.match(html, /\.ticker-track\{[^}]*padding:0 0 0 24px/);
  const notFound = await readFile(new URL('../public/404.html', import.meta.url), 'utf8');
  assert.match(notFound, /<meta name="description" content="Cette page n’existe pas/);
});
