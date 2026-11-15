// Repli local de toutes les communes quand geo.api.gouv.fr est en panne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import handler from '../api/jobs.js';
import { _test as J } from '../lib/jobs.js';
import {
  chooseByPopulation, communesByName, communesLoaded, communeByInsee, communesStats, knownPopulation, loadCommunes,
} from '../lib/communes-fr.js';

process.env.FT_CLIENT_ID = 'x';
process.env.FT_CLIENT_SECRET = 'y';
process.env.ADZUNA_APP_ID = 'a';
process.env.ADZUNA_APP_KEY = 'b';
process.env.CSP_DISABLED = '1';

let mode = 'down';
let geoCalls = 0;
const calls = [];
global.fetch = async (url) => {
  url = String(url);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('geo.api.gouv.fr')) {
    geoCalls += 1;
    calls.push(url);
    if (mode === 'down') throw new DOMException('The operation was aborted', 'AbortError');
    if (mode === 'api-chatou') return json([{ nom: 'Chatou', code: '99999', codeDepartement: '78', population: 1 }]);
    if (mode === 'api-tie') {
      return json([
        { nom: 'Villedouble', code: '11111', codeDepartement: '01', population: 10 },
        { nom: 'Villedouble', code: '22222', codeDepartement: '02', population: 10 },
      ]);
    }
    return json([]);
  }
  calls.push(url);
  if (url.includes('access_token')) return json({ access_token: 'tok', expires_in: 1499 });
  if (url.includes('offresdemploi/v2/offres/search')) return json({ resultats: [] }, 200);
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
const hdr = (res, name) => {
  const key = Object.keys(res.headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? res.headers[key] : undefined;
};
function assertPrivate(res) {
  assert.equal(hdr(res, 'cache-control'), 'no-store');
  assert.equal(hdr(res, 'cdn-cache-control'), 'no-store');
  assert.equal(hdr(res, 'vercel-cdn-cache-control'), 'no-store');
}
const ftCommune = () => new URL(calls.filter(u => u.includes('offres/search')).at(-1)).searchParams.get('commune');

test.beforeEach(() => {
  mode = 'down';
  geoCalls = 0;
  calls.length = 0;
  J._resetGeoCache();
});

test('le relevé n’est pas lu à l’import, et il n’est pas dans le bundle client', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { communesLoaded } from './lib/communes-fr.js';
    await import('./lib/jobs.js');
    if (communesLoaded()) process.exit(2);
  `], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const pub = fileURLToPath(new URL('../public/', import.meta.url));
  const files = [];
  const walk = dir => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|html|css|mjs)$/.test(ent.name)) files.push(p);
    }
  };
  walk(pub);
  assert.ok(files.length > 5);
  for (const file of files) {
    assert.equal(readFileSync(file, 'utf8').includes('communes-fr'), false, file);
  }
});

test('fichier : source, date, licence, poids sous 2 Mo, champs officiels', () => {
  const file = new URL('../lib/data/communes-fr.json.br', import.meta.url);
  const bytes = statSync(file).size;
  assert.ok(bytes < 2_000_000, 'poids ' + bytes);
  assert.ok(bytes > 100_000, 'fichier trop petit, relevé incomplet');
  const stats = loadCommunes();
  const meta = communesStats();
  assert.equal(communesLoaded(), true);
  assert.equal(meta.releve, '2026-11-15');
  assert.equal(meta.licence, 'Licence Ouverte Etalab 2.0');
  assert.match(meta.source, /^https:\/\/geo\.api\.gouv\.fr\/communes\?/);
  assert.equal(meta.count, 34969);
  assert.equal(meta.bytes, bytes);
  assert.equal(stats.count, 34969);
  const chatou = communeByInsee('78146');
  assert.equal(chatou.nom, 'Chatou');
  assert.equal(chatou.dep, '78');
  assert.equal(chatou.population, 30598);
  assert.deepEqual(chatou.cps, ['78400']);
  assert.equal(chatou.lat, 48.8964);
  assert.equal(chatou.lon, 2.1502);
  const clipperton = communeByInsee('98901');
  assert.equal(clipperton.nom, 'Île de Clipperton');
  assert.equal(clipperton.population, null);
  assert.equal(knownPopulation(clipperton), null);
  const legal = readFileSync(new URL('../public/assets/legal-pages.js', import.meta.url), 'utf8');
  assert.match(legal, /15 novembre 2026/);
  assert.match(legal, /Licence Ouverte Etalab 2\.0/);
  assert.match(legal, /geo\.api\.gouv\.fr\/communes\?fields=nom,code,codesPostaux,codeDepartement,population,centre/);
});

test('population : la plus forte gagne, l’égalité ou l’absence reste ambiguë', () => {
  assert.equal(chooseByPopulation([{ code: 'a', population: 1 }, { code: 'b', population: 5 }]).row.code, 'b');
  assert.equal(chooseByPopulation([{ code: 'a', population: 0 }, { code: 'b', population: 5 }]).row.code, 'b');
  assert.equal(chooseByPopulation([{ population: 5 }, { population: 5 }]).status, 'ambiguous');
  assert.equal(chooseByPopulation([{ population: null }, { population: 5 }]).status, 'ambiguous');
  assert.equal(chooseByPopulation([{ population: undefined }, { population: undefined }]).status, 'ambiguous');
  assert.equal(chooseByPopulation([{ code: 'seul', population: null }]).status, 'one');
});

test('panne : Chatou, Rueil-Malmaison, Montesson et Nanterre viennent du relevé, après l’API', async () => {
  const expect = [
    ['Chatou', '78146', 'Chatou'],
    ['Rueil-Malmaison', '92063', 'Rueil-Malmaison'],
    ['Montesson', '78418', 'Montesson'],
    ['Nanterre', '92050', 'Nanterre'],
  ];
  for (const [lieu, code, label] of expect) {
    geoCalls = 0;
    calls.length = 0;
    J._resetGeoCache();
    const r = await call({ lieu, source: 'ft' });
    assert.equal(geoCalls, 2, lieu + ' : API tentée puis relancée avant le relevé');
    assert.equal(r.body.location.type, 'commune', lieu);
    assert.equal(r.body.location.code, code, lieu);
    assert.equal(r.body.location.label, label, lieu);
    assert.equal(r.body.location.display, label, lieu);
    assert.equal(r.body.location.reason, undefined, lieu);
    assert.equal(r.body.location.distance, 10, lieu);
    assert.deepEqual(Object.keys(r.body.location).sort(), ['approx', 'code', 'display', 'distance', 'label', 'type']);
    assert.match(hdr(r, 'cache-control'), /s-maxage=300/);
    assert.equal(hdr(r, 'cdn-cache-control'), undefined);
    assert.equal(ftCommune(), code, lieu);
    const loc = await J.resolveLocation({ lieu });
    const row = communeByInsee(code);
    assert.equal(loc.lat, row.lat);
    assert.equal(loc.lon, row.lon);
    assert.ok(loc.postals.includes(row.cps[0]));
  }
});

test('panne : accents, tirets, Saint et St', async () => {
  const nimes = await J.resolveLocation({ lieu: 'nimes' });
  assert.equal(nimes.insee, '30189');
  assert.equal(nimes.label, 'Nîmes');
  const evry = await J.resolveLocation({ lieu: 'evry-courcouronnes' });
  assert.equal(evry.insee, '91228');
  assert.equal(evry.label, 'Évry-Courcouronnes');
  const chatou = await J.resolveLocation({ lieu: 'Châtou' });
  assert.equal(chatou.insee, '78146');
  assert.equal(chatou.label, 'Chatou');
  const rueil = await J.resolveLocation({ lieu: 'rueil malmaison' });
  assert.equal(rueil.insee, '92063');
  assert.equal(rueil.label, 'Rueil-Malmaison');
  const cloud = await J.resolveLocation({ lieu: 'st-cloud' });
  assert.equal(cloud.insee, '92064');
  assert.equal(cloud.label, 'Saint-Cloud');
  const st = await J.resolveLocation({ lieu: 'St Etienne' });
  assert.equal(st.insee, '42218');
  assert.equal(st.label, 'Saint-Étienne');
});

test('panne : homonyme résolu par la population, département précisé, code postal', async () => {
  const rows = communesByName('Saint-Denis');
  const best = rows.reduce((a, b) => (knownPopulation(a) >= knownPopulation(b) ? a : b));
  assert.ok(rows.length >= 2);
  assert.equal(best.code, '97411');
  const loc = await J.resolveLocation({ lieu: 'Saint-Denis' });
  assert.equal(loc.type, 'commune');
  assert.equal(loc.insee, best.code);
  assert.equal(loc.display, 'Saint-Denis (974)');
  assert.equal(loc.reason, undefined);
  const precise = await J.resolveLocation({ lieu: 'Saint-Denis (93)' });
  assert.equal(precise.insee, '93066');
  assert.equal(precise.display, 'Saint-Denis (93)');
  const postal = await J.resolveLocation({ lieu: '92500' });
  assert.equal(postal.insee, '92063');
  assert.equal(postal.label, 'Rueil-Malmaison');
  assert.equal(postal.display, 'Rueil-Malmaison (92500)');
});

test('panne : population ex æquo, l’ambiguïté est renvoyée et n’est pas mise en cache', async () => {
  const rows = communesByName('Mialet');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].population, rows[1].population);
  const r = await call({ lieu: 'Mialet', source: 'ft' });
  assert.equal(r.body.location.type, 'unknown');
  assert.equal(r.body.location.reason, 'ambiguous_commune');
  assert.equal(r.body.location.code, '');
  assert.deepEqual(r.body.location.candidates.map(c => c.code).sort(), ['24269', '30168']);
  assert.deepEqual(r.body.location.suggestions.sort(), ['Mialet (24)', 'Mialet (30)']);
  assert.ok(r.body.location.candidates.every(c => c.population === 628));
  assertPrivate(r);
  assert.equal(ftCommune(), null);
  const clip = await J.resolveLocation({ lieu: 'Île de Clipperton' });
  assert.equal(clip.type, 'commune');
  assert.equal(clip.insee, '98901');
});

test('panne : une région ou un petit homonyme de département ne devient pas une commune', async () => {
  const bretagne = await J.resolveLocation({ lieu: 'Bretagne' });
  assert.equal(bretagne.type, 'region');
  assert.equal(bretagne.region, '53');
  const rhone = await J.resolveLocation({ lieu: 'Rhône' });
  assert.equal(rhone.type, 'departement');
  assert.equal(rhone.departement, '69');
  const mayenne = await J.resolveLocation({ lieu: 'Mayenne' });
  assert.equal(mayenne.type, 'departement');
  assert.equal(mayenne.departement, '53');
  const vienne = await J.resolveLocation({ lieu: 'Vienne' });
  assert.equal(vienne.type, 'commune');
  assert.equal(vienne.insee, '38544');
  assert.equal(vienne.departement, '38');
});

test('API disponible : sa réponse prime, y compris pour signaler une égalité', async () => {
  mode = 'api-chatou';
  const live = await J.resolveLocation({ lieu: 'Chatou' });
  assert.equal(geoCalls, 1, 'pas de relance quand l’API répond');
  assert.equal(live.insee, '99999');
  assert.equal(live.label, 'Chatou');
  mode = 'api-tie';
  J._resetGeoCache();
  const tie = await J.resolveLocation({ lieu: 'Villedouble' });
  assert.equal(tie.type, 'unknown');
  assert.equal(tie.reason, 'ambiguous_commune');
  assert.deepEqual(tie.candidates.map(c => c.code).sort(), ['11111', '22222']);
  const r = await call({ lieu: 'Villedouble', source: 'ft' });
  assert.equal(r.body.location.reason, 'ambiguous_commune');
  assertPrivate(r);
  assert.equal(ftCommune(), null);
});

test('interface : l’ambiguïté n’est pas présentée comme un lieu inconnu', () => {
  const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /reason === 'ambiguous_commune'/);
  assert.match(app, /plusieurs communes portent ce nom/);
  assert.match(app, /La population ne permet pas d’en choisir une/);
  assert.match(app, /lieu non reconnu/);
});
