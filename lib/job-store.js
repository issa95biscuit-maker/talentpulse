/**
 * Cache des fiches d'offre servies dans les résultats, surtout Adzuna
 * (pas d'API fiche). Mémoire locale + Runtime Cache Vercel (fra1) si disponible.
 * Aucune migration de données. Échec silencieux hors de Vercel et dans les tests.
 */
const TTL_SEC = 24 * 60 * 60;
const DESC_MAX = 4000;

let cachePromise;

async function runtimeCache() {
  if (cachePromise !== undefined) return cachePromise;
  cachePromise = (async () => {
    try {
      if (!process.env.VERCEL) return null;
      const { getCache } = await import('@vercel/functions');
      if (typeof getCache !== 'function') return null;
      return getCache({ namespace: 'tp-jobs' });
    } catch {
      return null;
    }
  })();
  return cachePromise;
}

export function _resetRuntimeCache() { cachePromise = undefined; }

function slim(job) {
  if (!job?.id) return null;
  const desc = String(job.desc || '').slice(0, DESC_MAX);
  return { ...job, desc };
}

export async function persistJobs(jobs) {
  const list = (jobs || []).map(slim).filter(j => j && /^adz_\d{4,20}$/.test(j.id));
  if (!list.length) return;
  try {
    const cache = await runtimeCache();
    if (!cache || typeof cache.set !== 'function') return;
    await Promise.all(list.map(j =>
      cache.set(j.id, j, { ttl: TTL_SEC, tags: ['jobs', 'adzuna'], name: 'job-adzuna' }).catch(() => {})
    ));
  } catch { /* hors Vercel, quota, ou runtime indisponible */ }
}

export async function loadPersistedJob(id) {
  const key = String(id || '');
  if (!/^adz_\d{4,20}$/.test(key)) return null;
  try {
    const cache = await runtimeCache();
    if (!cache || typeof cache.get !== 'function') return null;
    const job = await cache.get(key);
    return job && job.id === key ? job : null;
  } catch {
    return null;
  }
}

export function adzunaDetailsUrl(id) {
  const raw = String(id || '');
  if (!/^adz_\d{4,20}$/.test(raw)) return '';
  return `https://www.adzuna.fr/details/${raw.slice(4)}`;
}
