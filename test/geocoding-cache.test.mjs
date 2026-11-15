// Géocodage : un timeout ou un 5xx n'est pas un lieu inconnu, n'est pas mis en cache partagé,
// et une commune du référentiel local est tout de même résolue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/jobs.js';
import seoHandler from '../api/seo.js';
import { _test as J } from '../lib/jobs.js';
import { _clearCache } from '../lib/seo.js';
import { PLACES, PLACE_BY_SLUG, localCommune } from '../lib/seo-data.js';

process.env.FT_CLIENT_ID = 'x';
process.env.FT_CLIENT_SECRET = 'y';
process.env.ADZUNA_APP_ID = 'a';
process.env.ADZUNA_APP_KEY = 'b';
process.env.CSP_DISABLED = '1';

const COMMUNES = [
  { nom: 'Argenteuil', code: '95018', codeDepartement: '95', codesPostaux: ['95100'], population: 110000 },
  { nom: 'Lyon', code: '69123', codeDepartement: '69', codesPostaux: ['69001'], population: 520000 },
  { nom: 'Le Havre', code: '76351', codeDepartement: '76', codesPostaux: ['76600'], population: 166687 },
];
const norm = s => globalThis.TP_GEO.norm(s);

let mode = 'ok';
let geoCalls = 0;
const calls = [];
global.fetch = async (url) => {
  url = String(url);
  const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (url.includes('geo.api.gouv.fr')) {
    geoCalls += 1;
    calls.push(url);
    if (mode === 'abort-once' && geoCalls === 1) throw new DOMException('The operation was aborted', 'AbortError');
    if (mode === 'down') throw new DOMException('The operation was aborted', 'AbortError');
    if (mode === 'http503') return new Response('unavailable', { status: 503 });
    const u = new URL(url);
    const byCode = u.pathname.match(/^\/communes\/(\d[\dAB]\d{3})$/);
    if (byCode) {
      const c = COMMUNES.find(x => x.code === byCode[1]);
      return c ? json(c) : new Response('{}', { status: 404 });
    }
    if (u.pathname === '/communes') {
      const nom = u.searchParams.get('nom');
      const cp = u.searchParams.get('codePostal');
      const dep = u.searchParams.get('codeDepartement');
      let list = COMMUNES;
      if (cp) list = list.filter(c => (c.codesPostaux || []).includes(cp));
      if (nom) list = list.filter(c => norm(c.nom).startsWith(norm(nom)));
      if (dep) list = list.filter(c => c.codeDepartement === dep);
      return json([...list].sort((a, b) => b.population - a.population));
    }
    return json([]);
  }
  calls.push(url);
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (url.includes('offresdemploi/v2/offres/search')) return json({ resultats: [] }, 200, { 'Content-Range': 'offres 0-0/0' });
  throw new Error('unexpected ' + url);
};

function call(query) {
  return new Promise(resolve => {
    const res = {
      headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); },
      end() { resolve({ status: this.statusCode, headers: this.headers }); },
    };
    handler({ method: 'GET', query }, res);
  });
}
function callSeo(query) {
  return new Promise(resolve => {
    const res = {
      headers: {}, statusCode: 200,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      end(b) { resolve({ status: this.statusCode, body: String(b ?? ''), headers: this.headers }); },
    };
    seoHandler({ method: 'GET', query, url: '/api/seo' }, res);
  });
}
const hdr = (res, name) => {
  const key = Object.keys(res.headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? res.headers[key] : undefined;
};
function assertPrivate(res) {
  assert.equal(hdr(res, 'cache-control'), 'no-store');
  assert.equal(hdr(res, 'cdn-cache-control'), 'no-store');
  assert.equal(hdr(res, 'vercel-cdn-cache-control'), 'no-store');
}
function assertPublic(res, pattern) {
  assert.match(hdr(res, 'cache-control'), pattern);
  assert.equal(hdr(res, 'cdn-cache-control'), undefined);
  assert.equal(hdr(res, 'vercel-cdn-cache-control'), undefined);
}
const ftUrl = () => calls.filter(u => u.includes('offres/search')).at(-1);

test.beforeEach(() => {
  mode = 'ok';
  geoCalls = 0;
  calls.length = 0;
  J._resetGeoCache();
  _clearCache();
});

test('budget : une relance courte, total sous l’ancien délai de 5 s', () => {
  assert.equal(J.GEO_ATTEMPT_MS, 2500);
  assert.equal(J.GEO_RETRY_MS, 1200);
  assert.ok(J.GEO_ATTEMPT_MS + J.GEO_RETRY_MS <= 5000);
});

test('référentiel local : chaque commune curée a son code INSEE, Saint-Étienne et Le Havre inclus', () => {
  const cities = PLACES.filter(p => p.type === 'commune');
  assert.ok(cities.length >= 20);
  for (const p of cities) {
    assert.match(p.insee, /^\d{5}$/, p.name);
    assert.equal(localCommune(p.name)?.code, p.insee, p.name);
  }
  assert.equal(localCommune('Le Havre').code, '76351');
  assert.equal(localCommune('st etienne').code, '42218');
  assert.equal(localCommune('Rueil-Malmaison'), null);
  assert.equal(localCommune('Chatou'), null);
});

test('timeout puis succès : la commune est résolue, le cache public est inchangé', async () => {
  mode = 'abort-once';
  const r = await call({ lieu: 'Argenteuil', source: 'ft' });
  assert.equal(geoCalls, 2, 'un essai avorté, puis une seule relance');
  assert.equal(r.status, 200);
  assert.equal(r.body.location.type, 'commune');
  assert.equal(r.body.location.code, '95018');
  assert.equal(r.body.location.label, 'Argenteuil');
  assert.equal(r.body.location.reason, undefined);
  assert.deepEqual(Object.keys(r.body.location).sort(), ['approx', 'code', 'display', 'distance', 'label', 'type']);
  assertPublic(r, /^public, s-maxage=300, stale-while-revalidate=900$/);
  assert.equal(new URL(ftUrl()).searchParams.get('commune'), '95018');
});

test('5xx persistant : lieu inconnu honnête, pas de cache partagé, contrat de type inchangé', async () => {
  mode = 'http503';
  const r = await call({ lieu: 'Argenteuil', source: 'ft' });
  assert.equal(geoCalls, 2, 'pas de troisième essai');
  assert.equal(r.body.location.type, 'unknown');
  assert.equal(r.body.location.reason, 'geocoding_unavailable');
  assert.equal(r.body.location.code, '');
  assert.equal(r.body.location.label, 'Argenteuil');
  assert.ok(Array.isArray(r.body.location.suggestions));
  assert.equal(new URL(ftUrl()).searchParams.get('commune'), null);
  assert.equal(new URL(ftUrl()).searchParams.get('departement'), null);
  assert.equal(new URL(ftUrl()).searchParams.get('region'), null);
  assertPrivate(r);
  const count = await call({ lieu: 'Argenteuil', source: 'ft', count: '1' });
  assertPrivate(count);
  assert.equal(count.body.location, undefined);
});

test('échec non mémorisé : la requête suivante interroge à nouveau le géocodage', async () => {
  mode = 'http503';
  const failed = await J.resolveLocation({ lieu: 'Argenteuil' });
  assert.equal(failed.type, 'unknown');
  assert.equal(failed.reason, 'geocoding_unavailable');
  const afterFail = geoCalls;
  mode = 'ok';
  const ok = await J.resolveLocation({ lieu: 'Argenteuil' });
  assert.equal(ok.type, 'commune');
  assert.equal(ok.insee, '95018');
  assert.equal(ok.reason, undefined);
  assert.equal(geoCalls, afterFail + 1, 'le 503 n’a pas été mis en cache mémoire');
});

test('repli local : Lyon et Le Havre restent des communes quand le géocodage tombe', async () => {
  mode = 'down';
  const lyon = await call({ lieu: 'Lyon', source: 'ft' });
  assert.equal(geoCalls, 2);
  assert.equal(lyon.body.location.type, 'commune');
  assert.equal(lyon.body.location.code, '69123');
  assert.equal(lyon.body.location.display, 'Lyon');
  assert.equal(lyon.body.location.reason, undefined);
  assert.equal(lyon.body.location.distance, 10);
  assertPublic(lyon, /s-maxage=300/);
  assert.equal(new URL(ftUrl()).searchParams.get('commune'), '69123');

  geoCalls = 0;
  calls.length = 0;
  J._resetGeoCache();
  const havre = await call({ lieu: 'Le Havre', source: 'ft' });
  assert.equal(havre.body.location.type, 'commune');
  assert.equal(havre.body.location.code, '76351');
  assert.equal(havre.body.location.reason, undefined);
  assertPublic(havre, /s-maxage=300/);

  geoCalls = 0;
  J._resetGeoCache();
  const dep = await J.resolveLocation({ lieu: 'Hauts-de-Seine' });
  assert.equal(dep.type, 'departement');
  assert.equal(dep.departement, '92');
  assert.equal(dep.reason, undefined);
});

test('lieu vraiment inconnu : type unknown sans reason, quand même hors cache partagé', async () => {
  const r = await call({ lieu: 'zzzz', source: 'ft' });
  assert.equal(geoCalls, 1, 'une réponse 200 vide n’est pas une panne, pas de relance');
  assert.equal(r.body.location.type, 'unknown');
  assert.equal(r.body.location.reason, undefined);
  assert.equal(r.body.location.code, '');
  assertPrivate(r);
  const again = await call({ lieu: 'Lyon', source: 'ft' });
  assert.equal(again.body.location.type, 'commune');
  assert.equal(again.body.location.code, '69123');
  assertPublic(again, /s-maxage=300/);
  const count = await call({ lieu: 'Lyon', source: 'ft', count: '1' });
  assertPublic(count, /^public, s-maxage=3600, stale-while-revalidate=86400$/);
});

test('SSR : commune du référentiel rendue et mise en cache ; lieu non résolu en no-store', async () => {
  mode = 'down';
  const lyon = await callSeo({ kw: 'emploi', lieu: 'lyon' });
  assert.equal(lyon.status, 200);
  assert.match(lyon.headers['cache-control'], /s-maxage=3600/);
  assert.equal(lyon.headers['cdn-cache-control'], undefined);
  assert.doesNotMatch(lyon.body, /lieu non reconnu/);
  assert.doesNotMatch(lyon.body, /geocoding_unavailable/);
  const ssr = JSON.parse((lyon.body.match(/<script type="application\/json" id="ssrData">([^<]*)<\/script>/) || [])[1]);
  assert.equal(ssr.location.type, 'commune');
  assert.equal(ssr.location.code, '69123');
  assert.match(lyon.body, /rayon de 10/);

  const slug = 'ville-test-geo';
  PLACE_BY_SLUG.set(slug, {
    slug, type: 'commune', name: 'Ville-Test-Geo', in: 'à Ville-Test-Geo',
    dep: '92', reg: '11', lat: 48.8, lon: 2.1, top: true,
  });
  try {
    J._resetGeoCache();
    _clearCache();
    const bad = await callSeo({ kw: 'emploi', lieu: slug });
    assert.equal(bad.status, 200);
    assert.equal(bad.headers['cache-control'], 'no-store');
    assert.equal(bad.headers['cdn-cache-control'], 'no-store');
    assert.equal(bad.headers['vercel-cdn-cache-control'], 'no-store');
    assert.doesNotMatch(bad.body, /lieu non reconnu/);
    assert.doesNotMatch(bad.body, /rayon de 10/);
    assert.match(bad.body, /Recherche en cours/);
    assert.doesNotMatch(bad.body, /id="ssrData"/);
  } finally {
    PLACE_BY_SLUG.delete(slug);
  }
});

test('interface : panne de localisation distincte d’un lieu inconnu, sans rayon', () => {
  const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /localisation momentanément indisponible/);
  assert.match(app, /sans rayon autour de ce lieu/);
  assert.match(app, /lieu non reconnu/);
  assert.match(app, /reason === 'geocoding_unavailable'/);
});
