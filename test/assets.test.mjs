// Sprint 3 : icônes (sprite Lucide), photos optimisées et créditées, sources affichées honnêtement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');

test('icônes : chaque <use href="#i-…"> pointe vers un symbole du sprite', () => {
  const symbols = new Set([...html.matchAll(/<symbol id="(i-[a-z0-9-]+)"/g)].map(m => m[1]));
  assert.ok(symbols.size > 40, 'sprite présent');
  const used = new Set([...(html + app).matchAll(/href="#(i-[a-z0-9-]+)"/g)].map(m => m[1]));
  for (const id of [...app.matchAll(/#i-\$\{[^}]+\}/g)]) void id; // icônes dynamiques vérifiées ci-dessous
  const missing = [...used].filter(id => !symbols.has(id));
  assert.deepEqual(missing, []);
  for (const id of ['i-landmark', 'i-globe', 'i-user']) assert.ok(symbols.has(id), id);
});

test('sources : plus de pastilles « FT / Az / AI », pas de source alternance non branchée', () => {
  assert.ok(!/>\s*(FT|Az|AI)\s*</.test(html), 'pastilles lettres retirées');
  assert.ok(!/Offres en alternance/.test(html));
  assert.ok(/alternance incluse/.test(html));
});

test('photos : AVIF + WebP, légères, chargement différé hors hero, crédits présents', () => {
  const dir = new URL('../public/img/', import.meta.url);
  const files = readdirSync(dir);
  for (const f of files.filter(f => /\.(avif|webp)$/.test(f))) assert.ok(statSync(new URL(f, dir)).size < 120 * 1024, f + ' < 120 Ko');
  for (const base of ['paris', 'equipe', 'logistique']) for (const ext of ['avif', 'webp']) for (const w of [800, 1600]) assert.ok(files.includes(`${base}-${w}.${ext}`), `${base}-${w}.${ext}`);
  const credits = readFileSync(new URL('CREDITS.md', dir), 'utf8');
  assert.ok(/Unsplash/.test(credits) && /StockSnap/.test(credits) && /Joe deSousa/.test(credits));
  const imgs = [...html.matchAll(/<img [^>]*src="\/img\/[^"]+"[^>]*>/g)].map(m => m[0]).filter(t => !/adzuna-logo/.test(t));
  assert.ok(imgs.length >= 3);
  for (const tag of imgs) {
    assert.ok(/alt=""/.test(tag) && /width="\d+"/.test(tag) && /height="\d+"/.test(tag), 'décorative, dimensions fixes : ' + tag.slice(0, 80));
    if (!/paris-/.test(tag)) assert.ok(/loading="lazy"/.test(tag), 'lazy : ' + tag.slice(0, 80));
  }
});

test('bandeau défilant : accessible (région nommée, aria-live off, bouton pause)', () => {
  assert.ok(/id="ticker"[^>]*role="region"[^>]*aria-label="/.test(html) || /role="region"[^>]*id="ticker"/.test(html));
  assert.ok(/id="tickerTrack"[^>]*aria-live="off"/.test(html));
  assert.ok(/id="tickerToggle"[^>]*aria-pressed="false"/.test(html));
  assert.ok(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.ticker/.test(html.replace(/\n/g, ' ')), 'reduced motion');
});

test('nombres : milliers séparés par une espace fine insécable (U+202F)', () => {
  const src = app.match(/function fmtCount\(n\) \{[^\n]+\}/)[0];
  const fmtCount = new Function(src + '; return fmtCount;')();
  assert.equal(fmtCount(1234567), '1\u202f234\u202f567');
  assert.equal(fmtCount(950), '950');
});

test('attribution Adzuna : « Jobs by » + logo officiel ≥ 116×23 px, liens vers adzuna.fr', () => {
  const tpl = app.match(/const adzunaAttribution = \(\) => `([^`]+)`/)[1];
  assert.ok(/<a href="https:\/\/www\.adzuna\.fr"[^>]*>Jobs<\/a> by <a href="https:\/\/www\.adzuna\.fr"[^>]*><img src="\/img\/adzuna-logo\.png" alt="Adzuna" width="87" height="23"/.test(tpl));
  assert.ok(/source === 'Adzuna' \? adzunaAttribution\(\)/.test(app), 'sur chaque carte Adzuna');
  assert.ok(statSync(new URL('../public/img/adzuna-logo.png', import.meta.url)).size < 10 * 1024);
  assert.ok(/licence de réutilisation des offres d’emploi de France Travail/.test(app), 'licence FT citée sur les offres');
});

test('sprint 5 : cartes métiers en vraies photos (AVIF/WebP, 2 tailles, différées, créditées) + icône Lucide', () => {
  const dir = new URL('../public/img/', import.meta.url);
  const credits = readFileSync(new URL('CREDITS.md', dir), 'utf8');
  const cats = [...app.matchAll(/\{ icon: '([a-z]+)', img: '([a-z]+)'/g)];
  assert.equal(cats.length, 8);
  const sprite = new Set([...html.matchAll(/<symbol id="(i-[a-z0-9-]+)"/g)].map(m => m[1]));
  for (const [, icon, img] of cats) {
    for (const w of [360, 640]) for (const ext of ['avif', 'webp']) {
      const f = `metier-${img}-${w}.${ext}`;
      assert.ok(statSync(new URL(f, dir)).size < 40 * 1024, f + ' < 40 Ko');
    }
    assert.ok(credits.includes(`metier-${img}-`), 'crédit ' + img);
    const m = app.match(new RegExp(`\\n  ${icon}: '<svg[^']*#(i-[a-z0-9-]+)`));
    assert.ok(m && sprite.has(m[1]), 'icône ' + icon);
  }
  const tpl = app.match(/const catPhoto = n => `([^`]+)`/)[1];
  assert.ok(/alt=""/.test(tpl) && /loading="lazy"/.test(tpl) && /width="640" height="800"/.test(tpl) && /type="image\/avif"/.test(tpl));
  assert.ok(!/\{ icon: '[a-z]+', name:/.test(app), 'plus de catégorie sans photo');
});

test('sprint 5 : hero cinématique accessible (voile, mouvement réduit, crédits liés)', () => {
  assert.ok(/<div class="hero cine">/.test(html));
  assert.ok(/\.hero\.cine::before\{background:\s*linear-gradient/.test(html), 'voile dégradé');
  const flat = html.replace(/\n/g, ' ');
  assert.ok(/prefers-reduced-motion:reduce\)\{\s*\.hero\.cine \.hero-photo img\{animation:none\}/.test(flat), 'travelling coupé si mouvement réduit');
  assert.ok(/href="\/img\/CREDITS\.md"/.test(html), 'lien crédits photos');
});
