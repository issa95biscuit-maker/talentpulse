/**
 * Relevé des communes françaises pour le repli hors ligne.
 * Source : geo.api.gouv.fr/communes (Licence Ouverte Etalab 2.0).
 * Aucune commune, population ou coordonnée n'est ajoutée : une valeur absente reste vide.
 *
 *   node scripts/build-communes.mjs
 */
import { writeFileSync } from 'node:fs';
import { brotliCompressSync, constants as zc } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,codeDepartement,population,centre';
const RELEVE = new Date().toISOString().slice(0, 10);
const OUT = new URL('../lib/data/communes-fr.json.br', import.meta.url);

const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
if (!res.ok) throw new Error('geo.api.gouv.fr ' + res.status);
const data = await res.json();
if (!Array.isArray(data) || data.length < 30000) throw new Error('réponse trop courte : ' + (data?.length || 0));

const rows = [];
for (const c of data) {
  if (!c || typeof c.nom !== 'string' || !c.nom || typeof c.code !== 'string' || !c.code) {
    throw new Error('commune sans nom ou sans code');
  }
  const coords = c.centre?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('centre absent : ' + c.code);
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('centre illisible : ' + c.code);
  const pop = c.population;
  if (pop !== null && pop !== undefined && !Number.isFinite(Number(pop))) throw new Error('population illisible : ' + c.code);
  const cps = Array.isArray(c.codesPostaux) ? c.codesPostaux.filter(Boolean) : [];
  rows.push([
    c.nom,
    c.code,
    c.codeDepartement == null ? '' : String(c.codeDepartement),
    pop === null || pop === undefined ? null : Number(pop),
    lat,
    lon,
    cps.join(','),
  ]);
}

const doc = {
  source: SOURCE,
  licence: 'Licence Ouverte Etalab 2.0',
  releve: RELEVE,
  fields: ['nom', 'code', 'dep', 'pop', 'lat', 'lon', 'cps'],
  note: 'Relevé intégral de geo.api.gouv.fr/communes. lat/lon est le centre publié (GeoJSON [longitude, latitude]), sans arrondi. population est null quand la source ne la donne pas. cps est vide quand la source ne donne pas de code postal. Aucune commune ajoutée.',
  count: rows.length,
  rows,
};
const json = JSON.stringify(doc);
const br = brotliCompressSync(Buffer.from(json), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } });
writeFileSync(OUT, br);
const path = fileURLToPath(OUT);
console.log(JSON.stringify({
  releve: RELEVE,
  communes: rows.length,
  jsonBytes: Buffer.byteLength(json),
  brBytes: br.length,
  path,
}, null, 2));
