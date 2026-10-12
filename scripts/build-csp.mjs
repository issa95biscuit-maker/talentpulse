#!/usr/bin/env node
/**
 * Construit lib/data/csp-offres.json à partir du jeu de données ouvert
 * « Les offres diffusées sur Choisir le Service Public » (DGAFP, data.gouv.fr, Licence Ouverte 2.0).
 * https://www.data.gouv.fr/datasets/les-offres-diffusees-sur-choisir-le-service-public
 *
 *   node scripts/build-csp.mjs              # télécharge le dernier CSV publié
 *   node scripts/build-csp.mjs ./offres.csv # ou part d'un fichier local
 *
 * On ne garde que les offres encore en publication (date de fin ≥ aujourd'hui) publiées depuis moins de
 * 120 jours, avec des champs compacts. Le lien renvoie vers la fiche officielle choisirleservicepublic.gouv.fr.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'lib/data/csp-offres.json');
const DATASET = 'https://www.data.gouv.fr/api/1/datasets/les-offres-diffusees-sur-choisir-le-service-public/';
const MAX_AGE_DAYS = 120;

/** Parseur CSV (séparateur ;, guillemets doubles, champs multilignes) */
export function* parseCsv(text, sep = ';') {
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      yield row; row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}

const dmy = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const t = s => String(s || '').replace(/\s+/g, ' ').trim();
const VERSANT = { 'Fonction Publique Territoriale': 'FPT', "Fonction Publique de l'Etat": 'FPE', 'Fonction Publique Hospitalière': 'FPH' };

/** « 4 rue X : 23320 Saint-Vaury » / « 139 rue de Bercy 75012 Paris » → « Saint-Vaury » / « Paris » */
export function cityFrom(lieu, sansGeo) {
  const re = /\b\d{2}\s?\d{3}\s+([A-Za-zÀ-ÿ' -]+?)(?:,|\s+cedex|\s+-\s|$)/i;
  for (const s of [t(sansGeo), t(lieu)]) { const m = s.match(re); if (m) return m[1].trim(); }
  const s = t(sansGeo).replace(/\s+cedex.*$/i, '').trim();
  return s && s.length <= 40 && !/\d/.test(s) ? s : '';
}

const GENERIC_ORG = { 'Communes': c => c ? `Mairie de ${c}` : 'Commune', 'Conseils régionaux': () => 'Conseil régional', 'Départements': () => 'Conseil départemental', 'Conseils départementaux': () => 'Conseil départemental' };
export function employerOf(r, city) {
  const e = t(r['Employeur']); if (e) return e;
  const org = t(r['Organisme de rattachement']);
  const suffix = (t(r['Intitulé du poste']).match(/\s[-–]\s([^-–]{3,60})$/) || [])[1];
  if (org === 'Communes' && city) return `Mairie de ${city}`;
  if (suffix && /^(Etablissements publics|Centres communaux|Structures de coopération|Conseils|Départements)/i.test(org) && !/^(h\/?f|f\/?h)$/i.test(suffix.trim())) return suffix.trim();
  return GENERIC_ORG[org] ? GENERIC_ORG[org](city) : org;
}

export function mapRow(r, today) {
  const end = dmy(r['Date de fin de publication par défaut']);
  const first = dmy(r['Date de première publication']) || dmy(r['Date de début de publication par défaut']);
  if (!r['Référence'] || !end || end < today || !first) return null;
  if ((Date.parse(today) - Date.parse(first)) / 864e5 > MAX_AGE_DAYS) return null;
  const dep = (t(r['Localisation du poste']).match(/\((\d[\dAB]\d?|2A|2B)\)\s*$/i) || [])[1] || '';
  const cityRaw = cityFrom(r["Lieu d'affectation"], r["Lieu d'affectation (sans géolocalisation)"]);
  const city = cityRaw && cityRaw === cityRaw.toUpperCase() ? cityRaw.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase()) : cityRaw;
  const nature = t(r["Nature de l'emploi"]);
  const contrat = t(r['Nature de contrat']) || (/uniquement aux contractuels/i.test(nature) ? 'Contractuel' : /fonctionnaires/i.test(nature) ? 'Titulaire' : 'Titulaire ou contractuel');
  return [
    t(r['Référence']), t(r['Intitulé du poste']).slice(0, 160), employerOf(r, city).slice(0, 90),
    dep.toUpperCase(), city.slice(0, 60), VERSANT[t(r['Versant'])] || '', (t(r['Catégorie']).match(/Catégorie (A\+|A|B|C)/) || [])[1] || '',
    contrat, t(r['Métier']).slice(0, 90), first, end, /oui/i.test(r['Télétravail'] || '') ? 1 : 0, /non/i.test(r['Temps Plein'] || '') ? 0 : 1,
  ];
}
export const FIELDS = ['ref', 'title', 'employer', 'dep', 'city', 'versant', 'categorie', 'contrat', 'metier', 'first', 'end', 'teletravail', 'tempsPlein'];

async function latestCsvUrl() {
  const d = await (await fetch(DATASET)).json();
  const csvs = d.resources.filter(r => /offres-datagouv-\d{8}\.csv$/.test(r.title));
  csvs.sort((a, b) => b.title.localeCompare(a.title));
  return { url: csvs[0].url, title: csvs[0].title, modified: csvs[0].last_modified };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  let text, src;
  if (process.argv[2]) { text = fs.readFileSync(process.argv[2], 'utf8'); src = { title: path.basename(process.argv[2]), modified: '' }; }
  else { src = await latestCsvUrl(); console.error('Téléchargement', src.url); text = await (await fetch(src.url)).text(); }
  const it = parseCsv(text.replace(/^\uFEFF/, ''));
  const header = it.next().value.map(h => h.trim());
  const seen = new Set(); const rows = [];
  for (const cells of it) {
    if (cells.length < 10) continue;
    const r = Object.fromEntries(header.map((h, i) => [h, cells[i] || '']));
    const m = mapRow(r, today);
    if (!m || seen.has(m[0])) continue;
    seen.add(m[0]); rows.push(m);
  }
  rows.sort((a, b) => b[9].localeCompare(a[9]));
  const snapshot = (src.title.match(/(\d{4})(\d{2})(\d{2})/) || []).slice(1).join('-');
  const out = { source: 'Choisir le Service Public — DGAFP (data.gouv.fr, Licence Ouverte 2.0)', snapshot, builtAt: today, fields: FIELDS, rows };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.error(`${rows.length} offres → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} Mo, extraction du ${snapshot})`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
