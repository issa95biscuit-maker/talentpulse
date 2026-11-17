// Régressions d'affichage mesurées en production (nov. 2026) : textes coupés, cascade mobile, contraste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const notFound = await readFile(new URL('../public/404.html', import.meta.url), 'utf8');
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('les intitulés, entreprises et salaires ne sont plus tronqués par le CSS', () => {
  assert.ok(!/-webkit-line-clamp/.test(style), 'line-clamp encore présent');
  assert.ok(!/\.job-sub>span\{[^}]*text-overflow:\s*ellipsis/.test(style));
  assert.ok(!/\.job-amount[^{]*\{[^}]*text-overflow:\s*ellipsis/.test(style));
  assert.ok(!/\.job-amount \.note\{[^}]*display:\s*none/.test(style), 'la précision de salaire est masquée');
  assert.ok(!/#jobsSourcesLine\{[^}]*display:\s*none/.test(style));
  assert.ok(!/\.logo-text\{[^}]*display:\s*none/.test(style));
  assert.ok(!/\.hb-extra\{[^}]*display:\s*none/.test(style));
  assert.ok(!/\.ticker-tag-txt\{[^}]*display:\s*none/.test(style));
  assert.ok(!/\.mini-col b\{[^}]*text-overflow:\s*ellipsis/.test(style));
});

test('sous 380 px la barre d’actions de la fiche passe sur une colonne, après la règle à deux colonnes', () => {
  const two = style.lastIndexOf('.detail-cta{grid-template-columns:1fr 1fr}');
  const one = style.lastIndexOf('.detail-cta{grid-template-columns:1fr}');
  assert.ok(two > 0 && one > two, 'la règle 1fr 1fr écrase encore la colonne unique');
  const tail = style.slice(one);
  assert.match(tail, /\.lbl-long\{display:inline\}/);
  assert.match(tail, /\.lbl-short\{display:none\}/);
});

test('les boutons orange restent assez foncés pour le blanc (WCAG AA)', () => {
  assert.ok(!/#D1500F|#F26B1D|#F97316/.test(style), 'dégradé trop clair encore présent');
  assert.match(style, /\.btn-primary\{background:linear-gradient\(180deg,#C2410C,#9A3412\)/);
  assert.match(style, /\.job-apply:hover\{background:linear-gradient\(180deg,#9A3412 0%,#7C2D12 100%\)\}/);
  assert.ok(!/#EA580C/.test(notFound), 'survol 404 trop clair');
  assert.match(notFound, /--btn-h:#9A3412/);
  assert.match(notFound, /outline:3px solid #C2410C/);
});

test('encart compact de la fiche : une colonne sous 480 px, texte non coupé, couleurs déjà conformes', () => {
  const block = style.slice(style.indexOf('.market-compact{'), style.indexOf('.seo-links{'));
  assert.ok(block.includes('.market-compact{'), 'règles compactes présentes');
  assert.match(block, /@media\(max-width:479px\)\{[\s\S]*\.market-compact \.market-grid\{grid-template-columns:1fr\}/);
  assert.ok(!/text-overflow:\s*ellipsis|white-space:\s*nowrap|-webkit-line-clamp/.test(block), block);
  assert.match(block, /\.market-compare\{[^}]*color:var\(--text\)/);
  assert.match(block, /\.market-base\{[^}]*color:var\(--text-2\)/);
  assert.ok(!/#(?:94A3B8|9CA3AF|A1A1AA|CBD5E1)/i.test(block), 'gris trop clair');
});

test('le focus d’une carte d’offre n’est pas un anneau à 30 % d’opacité', () => {
  assert.ok(!/color-mix\(in srgb,var\(--focus\) 2[80]%/.test(style));
  assert.match(style, /\.job:focus-within\{[^}]*0 0 0 4px var\(--focus\)/);
});
