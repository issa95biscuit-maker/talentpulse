/**
 * Post-filtre de distance réelle (haversine) et d’égalité de commune.
 * Utilisé après les réponses France Travail, Adzuna et Service Public, qui
 * élargissent souvent le rayon (ex. Boulogne à 5,9 km pour une recherche à 5 km).
 *
 * Offre sans point ni commune identifiable : on la garde, sans lui attribuer
 * une distance. Ville exacte (distance 0) = même commune, arrondissements
 * inclus pour Paris, Lyon et Marseille.
 */
import '../public/assets/geo-fr.js';
const GEO = globalThis.TP_GEO;

export const DISTANCE_EPS_KM = 0.05;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function validPoint(lat, lon) {
  const a = Number(lat), b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lon: b };
}

/** Centre d’une commune geo.api.gouv.fr (GeoJSON : [longitude, latitude]). */
export function pointFromGeoCommune(c) {
  const coords = c?.centre?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return validPoint(coords[1], coords[0]);
}

/** Retire les suffixes du type « - Télétravail possible » pour comparer la commune. */
export function cityStem(city) {
  let s = String(city || '').trim();
  s = s.replace(/\s*[-–—]\s*(télétravail|teletravail).*$/i, '');
  s = s.replace(/\s*\([^)]*\)\s*$/, '');
  return s.trim();
}

export function plmOf(insee, name) {
  const code = String(insee || '').toUpperCase();
  for (const c of Object.values(GEO.PLM)) {
    if (code === c.insee) return { ...c, kind: 'city' };
    const n = Number(code);
    if (Number.isFinite(n) && n > c.insee0 && n <= c.insee0 + c.max) return { ...c, kind: 'arr', arrInsee: String(n) };
  }
  const arr = GEO.parseArrondissement(name || '');
  if (arr) {
    const c = Object.values(GEO.PLM).find(x => x.nom === arr.city);
    if (c) return { ...c, kind: 'arr', arrInsee: arr.insee };
  }
  const n = GEO.norm(cityStem(name || ''));
  const c = n && Object.values(GEO.PLM).find(x => GEO.norm(x.nom) === n);
  return c ? { ...c, kind: 'city' } : null;
}

/** Ensemble des codes et noms qui représentent la commune recherchée. */
export function communeKeyset(loc) {
  const insees = new Set();
  const names = new Set();
  const postals = new Set();
  if (loc?.insee) insees.add(String(loc.insee).toUpperCase());
  for (const p of loc?.postals || []) if (/^\d{5}$/.test(String(p))) postals.add(String(p));
  if (/^\d{5}$/.test(String(loc?.postal || ''))) postals.add(String(loc.postal));
  for (const raw of [loc?.label, loc?.display]) {
    const stem = cityStem(raw || '');
    if (stem) names.add(GEO.norm(stem));
  }
  const plm = plmOf(loc?.insee, loc?.label || loc?.display);
  const exactArr = !!(loc?.arrondissement && Number(loc.distance) === 0);
  if (plm && !exactArr) {
    insees.add(plm.insee);
    for (let i = 1; i <= plm.max; i++) insees.add(String(plm.insee0 + i));
    names.add(GEO.norm(plm.nom));
  } else if (plm && exactArr) {
    const code = plm.arrInsee || String(loc.insee || '');
    if (code) insees.add(code);
    if (loc?.display) names.add(GEO.norm(loc.display));
    if (loc?.label) names.add(GEO.norm(loc.label));
  }
  return { insees, names, postals, parentName: plm && !exactArr ? GEO.norm(plm.nom) : '' };
}

export function hasLocationHint(job) {
  if (job?._insee || (/^\d[\dAB]\d{3}$/i.test(String(job?.insee || '')))) return true;
  if (/^\d{5}$/.test(String(job?.postalCode || ''))) return true;
  const c = cityStem(job?.city || '');
  return !!(c && !/^france$/i.test(c));
}

export function jobCoords(job) {
  return validPoint(job?._lat ?? job?.lat, job?._lon ?? job?.lon);
}

export function matchesCommune(job, keys) {
  const insee = String(job?._insee || job?.insee || '').toUpperCase();
  if (insee && keys.insees.has(insee)) return true;
  const cp = String(job?.postalCode || '');
  if (/^\d{5}$/.test(cp) && keys.postals.has(cp)) return true;
  const arrCp = /^\d{5}$/.test(cp) ? GEO.arrondissementByCp(cp) : null;
  if (arrCp && keys.insees.has(arrCp.insee)) return true;
  const stem = cityStem(job?.city || '');
  if (!stem) return false;
  const n = GEO.norm(stem);
  if (keys.names.has(n)) return true;
  const arr = GEO.parseArrondissement(stem);
  if (arr && keys.insees.has(arr.insee)) return true;
  if (keys.parentName && (n === keys.parentName || n.startsWith(keys.parentName + ' '))) return true;
  return false;
}

/** Retire les champs internes avant la réponse API (contrat inchangé). */
export function stripJobGeo(job) {
  if (!job || (job._lat == null && job._lon == null && job._insee == null)) return job;
  const out = { ...job };
  delete out._lat;
  delete out._lon;
  delete out._insee;
  return out;
}

const SOURCE_KEY = { 'France Travail': 'ft', 'Adzuna': 'adzuna', 'Choisir le Service Public': 'csp' };

/** Ajuste les totaux : page complète → effectif filtré ; sinon on retranche les exclus connus. */
export function adjustTotals(totals, { droppedByKey = {}, fetchedByKey = {} } = {}) {
  const out = { ...(totals || {}) };
  for (const key of ['ft', 'adzuna', 'csp']) {
    const dropped = droppedByKey[key] || 0;
    const fetched = fetchedByKey[key] || 0;
    if (!dropped) continue;
    const t = Number(out[key]) || 0;
    if (t <= fetched) out[key] = Math.max(0, fetched - dropped);
    else out[key] = Math.max(0, t - dropped);
  }
  return out;
}

export function sourceKey(job) {
  return SOURCE_KEY[job?.source] || '';
}

/**
 * Filtre les offres d’une commune.
 * geo = { communeByCode, communesByPostal, lookupCommune } : accès geo.api.gouv.fr (cache côté appelant).
 * Les offres sans point ni commune restent, sans être comptées dans le rayon.
 */
export async function filterByDistance(jobs, loc, geo = {}) {
  if (!loc || loc.type !== 'commune' || !Array.isArray(jobs) || !jobs.length) {
    return { kept: jobs || [], dropped: [] };
  }
  const radius = Number.isFinite(Number(loc.distance)) ? Number(loc.distance) : 10;
  const keys = communeKeyset(loc);
  if (radius <= 0) {
    const kept = [], dropped = [];
    for (const j of jobs) {
      if (matchesCommune(j, keys) || !hasLocationHint(j)) kept.push(j);
      else dropped.push(j);
    }
    return { kept, dropped };
  }
  const origin = await resolveOrigin(loc, geo);
  await resolveJobPoints(jobs, geo);
  const kept = [], dropped = [];
  for (const j of jobs) {
    const pt = jobCoords(j);
    if (!pt || !origin) {
      kept.push(j);
      continue;
    }
    if (haversineKm(origin.lat, origin.lon, pt.lat, pt.lon) <= radius + DISTANCE_EPS_KM) kept.push(j);
    else dropped.push(j);
  }
  return { kept, dropped };
}

export async function resolveOrigin(loc, geo = {}) {
  const own = validPoint(loc?.lat, loc?.lon);
  if (own) return own;
  if (loc?.insee && geo.communeByCode) {
    try {
      const c = await geo.communeByCode(loc.insee);
      const pt = pointFromGeoCommune(c);
      if (pt) {
        loc.lat = pt.lat;
        loc.lon = pt.lon;
        if (Array.isArray(c?.codesPostaux)) loc.postals = c.codesPostaux;
      }
      return pt;
    } catch { /* geo indisponible : on ne filtre pas par distance */ }
  }
  return null;
}

export async function resolveJobPoints(jobs, geo = {}) {
  const pending = [];
  const seen = new Map();
  const remember = (key, p) => { if (key && p) seen.set(key, p); };
  for (const j of jobs) {
    if (jobCoords(j)) continue;
    const insee = String(j._insee || j.insee || '').toUpperCase();
    const cp = String(j.postalCode || '');
    const stem = cityStem(j.city || '');
    const arr = GEO.parseArrondissement(stem);
    const key = insee ? 'i:' + insee : arr ? 'i:' + arr.insee : /^\d{5}$/.test(cp) ? 'p:' + cp : stem ? 'c:' + GEO.norm(stem) + '|' + String(j.dept || '') : '';
    if (!key) continue;
    pending.push({ j, key, insee, cp, stem, arr, dept: j.dept || '' });
  }
  const unique = [...new Map(pending.map(p => [p.key, p])).values()].slice(0, 40);
  await Promise.race([
    Promise.all(unique.map(async p => {
      try {
        let c = null;
        if (p.insee && geo.communeByCode) c = await geo.communeByCode(p.insee);
        else if (p.arr?.insee && geo.communeByCode) c = await geo.communeByCode(p.arr.insee);
        else if (/^\d{5}$/.test(p.cp) && geo.communesByPostal) {
          const list = await geo.communesByPostal(p.cp);
          c = Array.isArray(list) && list.length
            ? list.slice().sort((a, b) => (b.population || 0) - (a.population || 0))[0]
            : null;
        } else if (p.stem && geo.lookupCommune) c = await geo.lookupCommune(p.stem, p.dept);
        const pt = pointFromGeoCommune(c);
        if (pt) remember(p.key, { ...pt, insee: c.code || p.insee || p.arr?.insee || '' });
      } catch { /* ignore */ }
    })),
    new Promise(r => setTimeout(r, 1500)),
  ]);
  for (const p of pending) {
    const hit = seen.get(p.key);
    if (!hit) continue;
    p.j._lat = hit.lat;
    p.j._lon = hit.lon;
    if (hit.insee && !p.j._insee) p.j._insee = hit.insee;
  }
}
