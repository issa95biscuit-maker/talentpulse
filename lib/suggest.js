/** Suggestions de métiers : appellations ROME (France Travail) + liste locale de repli. */
import '../public/assets/metiers-fr.js';
import '../public/assets/geo-fr.js';
import { getFTToken, fetchWithTimeout } from './jobs.js';

const norm = globalThis.TP_GEO.norm;
const LOCAL = globalThis.TP_METIERS;
const DAY = 24 * 3600 * 1000;
let cache = null; // { at, items: [{ label, code, n }] }
let inflight = null;

async function loadAppellations() {
  if (cache && Date.now() - cache.at < DAY) return cache.items;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const token = await getFTToken();
      if (!token) return null;
      const r = await fetchWithTimeout('https://api.francetravail.io/partenaire/offresdemploi/v2/referentiel/appellations', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }, 8000);
      if (!r.ok) throw new Error('FT appellations ' + r.status);
      const data = await r.json();
      const items = (Array.isArray(data) ? data : []).filter(a => a && a.libelle).map(a => ({ label: String(a.libelle), code: String(a.code || ''), n: norm(a.libelle) }));
      if (items.length) cache = { at: Date.now(), items };
      return items.length ? items : null;
    } catch (e) {
      console.error('[suggest]', e.message);
      return null;
    } finally { inflight = null; }
  })();
  return inflight;
}

/** Classement : début exact > début d'un mot > tous les mots présents ; puis intitulés courts. */
export function rank(list, q, limit = 8) {
  const n = norm(q);
  const words = n.split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const it of list) {
    const k = it.n || norm(it.label);
    if (!words.every(w => k.includes(w))) continue;
    const s = k.startsWith(n) ? 0 : k.split(' ').some(w => w.startsWith(words[0])) ? 1 : 2;
    scored.push([s, k.length, it]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const seen = new Set();
  return scored.map(x => x[2]).filter(it => { const k = it.n || norm(it.label); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}

export async function suggestMetiers(q, limit = 8) {
  const remote = await loadAppellations();
  const local = rank(LOCAL.map(label => ({ label })), q, limit);
  if (!remote) return { items: local.map(({ label }) => ({ label })), source: 'local' };
  // Liste locale d'abord (intitulés courts et usuels), puis appellations officielles
  const merged = rank([...local, ...rank(remote, q, limit * 2)], q, limit);
  return { items: merged.map(({ label, code }) => (code ? { label, code } : { label })), source: 'france-travail' };
}

export const _test = { reset: () => { cache = null; inflight = null; } };
