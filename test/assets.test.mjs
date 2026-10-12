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
  for (const base of ['hero', 'equipe', 'logistique']) for (const ext of ['avif', 'webp']) for (const w of [800, 1600]) assert.ok(files.includes(`${base}-${w}.${ext}`), `${base}-${w}.${ext}`);
  const credits = readFileSync(new URL('CREDITS.md', dir), 'utf8');
  assert.ok(/Unsplash/.test(credits) && /Alex Kotliarskyi/.test(credits));
  const imgs = [...html.matchAll(/<img [^>]*src="\/img\/[^"]+"[^>]*>/g)].map(m => m[0]);
  assert.ok(imgs.length >= 3);
  for (const tag of imgs) {
    assert.ok(/alt=""/.test(tag) && /width="\d+"/.test(tag) && /height="\d+"/.test(tag), 'décorative, dimensions fixes : ' + tag.slice(0, 80));
    if (!/hero-/.test(tag)) assert.ok(/loading="lazy"/.test(tag), 'lazy : ' + tag.slice(0, 80));
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
