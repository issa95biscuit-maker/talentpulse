import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCount, jobsCountScope, formatJobsCount, formatJobsMoreMeta } from '../lib/jobs-count.js';

const rueil = { type: 'commune', label: 'Rueil-Malmaison', display: 'Rueil-Malmaison', distance: 5 };
const rueilExact = { type: 'commune', label: 'Rueil-Malmaison', display: 'Rueil-Malmaison', distance: 0 };

test('formatCount : espace fine insécable', () => {
  assert.equal(formatCount(1234567), '1\u202f234\u202f567');
  assert.equal(formatCount(49), '49');
});

test('jobsCountScope : ville, rayon, département, région, France', () => {
  assert.equal(jobsCountScope({ location: rueil }), 'à moins de 5\u00a0km de Rueil-Malmaison');
  assert.equal(jobsCountScope({ location: rueilExact }), 'à Rueil-Malmaison');
  assert.equal(jobsCountScope({ location: { type: 'commune', display: 'Lyon', distance: 20 } }), 'à moins de 20\u00a0km de Lyon');
  assert.equal(jobsCountScope({ location: { type: 'arrondissement', label: '6e arrondissement de Lyon', display: 'Lyon 6e', distance: 3 } }), 'dans le 6e arrondissement de Lyon et les arrondissements voisins');
  assert.equal(jobsCountScope({ location: { type: 'departement', label: 'Hauts-de-Seine', code: '92' } }), 'dans le département Hauts-de-Seine');
  assert.equal(jobsCountScope({ location: { type: 'region', label: 'Île-de-France' } }), 'dans la région Île-de-France');
  assert.equal(jobsCountScope({}), 'en France');
  assert.equal(jobsCountScope({ city: 'Rueil-Malmaison', location: { type: 'unknown' } }), 'en France');
});

test('formatJobsCount : jamais de total brut, singulier/pluriel, 0, pagination', () => {
  assert.equal(
    formatJobsCount({ shown: 49, hasMore: true, location: rueil }),
    '49 premières offres à moins de 5\u00a0km de Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 49, hasMore: false, location: rueil }),
    '49 offres à moins de 5\u00a0km de Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 3, hasMore: false, location: rueilExact }),
    '3 offres à Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 3, hasMore: true, location: rueilExact }),
    '3 premières offres à Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 1, hasMore: false, location: rueilExact }),
    '1 offre à Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 1, hasMore: true, location: rueil }),
    'Plus d’une offre à moins de 5\u00a0km de Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 0, hasMore: false, location: rueil }),
    '0 offre à moins de 5\u00a0km de Rueil-Malmaison',
  );
  assert.equal(
    formatJobsCount({ shown: 0, loadError: true, location: rueil }),
    '',
  );
  assert.equal(
    formatJobsCount({ shown: 53, hasMore: true }),
    '53 premières offres en France',
  );
  assert.equal(
    formatJobsCount({ shown: 53, hasMore: false }),
    '53 offres en France',
  );
  assert.equal(
    formatJobsCount({ shown: 0, hasMore: false }),
    '0 offre en France',
  );
  // Un total amont gonflé n’entre pas dans le libellé
  const label = formatJobsCount({ shown: 49, hasMore: true, location: rueil, total: 12497 });
  assert.ok(!label.includes('12') && !label.includes('497') && !/affichées/.test(label), label);
});

test('formatJobsMoreMeta : pas de total brut, cohérent avec hasMore', () => {
  assert.equal(
    formatJobsMoreMeta({ shown: 49, hasMore: true }),
    '49 offres affichées. D’autres peuvent correspondre.',
  );
  assert.equal(
    formatJobsMoreMeta({ shown: 1, hasMore: true }),
    '1 offre affichée. D’autres peuvent correspondre.',
  );
  assert.equal(
    formatJobsMoreMeta({ shown: 49, hasMore: false }),
    'Vous avez vu toutes les offres disponibles pour cette recherche.',
  );
  assert.equal(formatJobsMoreMeta({ shown: 0, hasMore: false }), '');
  const meta = formatJobsMoreMeta({ shown: 49, hasMore: true, total: 12497 });
  assert.ok(!meta.includes('12') && !meta.includes('497'), meta);
});

test('app.js reprend les mêmes libellés que lib/jobs-count.js', () => {
  const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
  const a = app.indexOf('// --- jobs-count (identique à lib/jobs-count.js) ---');
  const b = app.indexOf('// --- fin jobs-count ---');
  assert.ok(a >= 0 && b > a, 'marqueurs jobs-count dans app.js');
  const src = app.slice(a, b).replace(/function fmtCount/, 'function formatCount').replace(/fmtCount\(/g, 'formatCount(');
  const fmt = app.match(/function fmtCount\(n\) \{[^}]+\}/)[0].replace('function fmtCount', 'function formatCount');
  const fns = new Function(fmt + '\n' + src + '; return { formatCount, jobsCountScope, formatJobsCount, formatJobsMoreMeta };')();
  const samples = [
    { shown: 49, hasMore: true, location: rueil },
    { shown: 1, hasMore: false, location: rueilExact },
    { shown: 0, hasMore: false, location: rueil },
    { shown: 53, hasMore: true },
  ];
  for (const s of samples) {
    assert.equal(fns.formatJobsCount(s), formatJobsCount(s), JSON.stringify(s));
  }
  assert.equal(fns.formatJobsMoreMeta({ shown: 49, hasMore: true }), formatJobsMoreMeta({ shown: 49, hasMore: true }));
});
