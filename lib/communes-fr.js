/**
 * Référentiel communal français, serveur uniquement.
 * Chargé à la première recherche de repli (jamais à l'import, jamais par le navigateur).
 * Fichier : lib/data/communes-fr.json.br — geo.api.gouv.fr, Licence Ouverte Etalab 2.0.
 */
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import '../public/assets/geo-fr.js';
import { haversineKm, validPoint } from './distance.js';

let cache = null;

export function communesLoaded() {
  return cache !== null;
}

export function communesStats() {
  if (!cache) return null;
  return {
    bytes: cache.bytes,
    loadMs: cache.loadMs,
    count: cache.count,
    releve: cache.releve,
    source: cache.source,
    licence: cache.licence,
  };
}

/** Population numérique publiée par la source. null si absente : ce n'est pas un zéro. */
export function knownPopulation(row) {
  const p = row?.population;
  if (p === null || p === undefined || p === '') return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

/**
 * Une commune, ou la plus peuplée s'il y en a plusieurs et que la population
 * les départage. Sinon l'ambiguïté, y compris quand une population manque.
 */
export function chooseByPopulation(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return { status: 'none' };
  if (list.length === 1) return { status: 'one', row: list[0] };
  const pops = list.map(knownPopulation);
  if (pops.every(p => p !== null)) {
    let max = -Infinity;
    let count = 0;
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const p = pops[i];
      if (p > max) { max = p; count = 1; best = list[i]; }
      else if (p === max) count += 1;
    }
    if (count === 1) return { status: 'one', row: best };
  }
  return { status: 'ambiguous', rows: list };
}

export function loadCommunes() {
  if (cache) return cache;
  const t0 = performance.now();
  const buf = readFileSync(new URL('./data/communes-fr.json.br', import.meta.url));
  const json = JSON.parse(brotliDecompressSync(buf).toString('utf8'));
  if (!json || !Array.isArray(json.rows) || json.rows.length < 30000) throw new Error('référentiel communal incomplet');
  const norm = s => globalThis.TP_GEO.norm(s);
  const byNorm = new Map();
  const byCode = new Map();
  const byPostal = new Map();
  for (const row of json.rows) {
    const c = {
      nom: row[0],
      code: row[1],
      dep: row[2] == null ? '' : String(row[2]),
      population: row[3] === null || row[3] === undefined ? null : Number(row[3]),
      lat: Number(row[4]),
      lon: Number(row[5]),
      cps: row[6] ? String(row[6]).split(',') : [],
    };
    if (!c.nom || !c.code) throw new Error('commune incomplète');
    byCode.set(String(c.code).toUpperCase(), c);
    const key = norm(c.nom);
    const list = byNorm.get(key);
    if (list) list.push(c);
    else byNorm.set(key, [c]);
    for (const cp of c.cps) {
      const bucket = byPostal.get(cp);
      if (bucket) bucket.push(c);
      else byPostal.set(cp, [c]);
    }
  }
  cache = {
    bytes: buf.length,
    loadMs: Math.round((performance.now() - t0) * 10) / 10,
    count: json.rows.length,
    releve: json.releve,
    source: json.source,
    licence: json.licence,
    byNorm,
    byCode,
    byPostal,
  };
  return cache;
}

export function communesByName(name) {
  const key = globalThis.TP_GEO.norm(name);
  if (!key) return [];
  return (loadCommunes().byNorm.get(key) || []).slice();
}

export function communeByInsee(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return null;
  return loadCommunes().byCode.get(c) || null;
}

export function communesByPostalCode(cp) {
  return (loadCommunes().byPostal.get(String(cp || '')) || []).slice();
}

/** Arrondissement municipal de Paris, Lyon ou Marseille (la commune mère n'est pas concernée). */
function isMunicipalArrondissement(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return false;
  const plm = globalThis.TP_GEO?.PLM;
  if (!plm) return false;
  return Object.values(plm).some(c => n > c.insee0 && n <= c.insee0 + c.max);
}

/**
 * Communes les plus proches d'un point, à vol d'oiseau, d'après le relevé local.
 * Seules les distances calculées sont renvoyées. Les arrondissements municipaux
 * sont écartés : la commune mère (Paris, Lyon, Marseille) reste candidate.
 * @returns {{ row: object, km: number }[]} du plus proche au plus lointain
 */
export function nearestCommunes(origin, { maxKm = 30, excludeCode = '', limit = 40 } = {}) {
  const lat = Number(origin?.lat);
  const lon = Number(origin?.lon);
  const radius = Number(maxKm);
  const cap = Math.max(0, Math.min(80, Number(limit) || 0));
  if (!validPoint(lat, lon) || !Number.isFinite(radius) || radius <= 0 || !cap) return [];
  const data = loadCommunes();
  const ex = String(excludeCode || origin?.code || '').toUpperCase();
  const hits = [];
  for (const c of data.byCode.values()) {
    if (!c || String(c.code).toUpperCase() === ex) continue;
    if (isMunicipalArrondissement(c.code)) continue;
    const pt = validPoint(c.lat, c.lon);
    if (!pt) continue;
    const km = haversineKm(lat, lon, pt.lat, pt.lon);
    if (km < 0.05 || km > radius) continue;
    hits.push({ row: c, km });
  }
  hits.sort((a, b) => a.km - b.km || String(a.row.code).localeCompare(String(b.row.code)));
  return hits.slice(0, cap);
}

/** Même forme qu'une commune geo.api.gouv.fr, pour les appelants déjà écrits contre l'API. */
export function toGeoCommune(c) {
  if (!c) return null;
  const lat = Number(c.lat);
  const lon = Number(c.lon);
  const has = Number.isFinite(lat) && Number.isFinite(lon);
  const out = {
    nom: c.nom,
    code: c.code,
    codeDepartement: c.dep || '',
    codesPostaux: c.cps || [],
    population: c.population ?? null,
  };
  if (has) {
    out.lat = lat;
    out.lon = lon;
    out.centre = { type: 'Point', coordinates: [lon, lat] };
  }
  return out;
}
