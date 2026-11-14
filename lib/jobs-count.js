/**
 * Libellés du compteur de résultats.
 * On n’affiche jamais le total brut des API (France Travail, Adzuna, etc.)
 * après un filtrage : ce chiffre ne correspond pas à la liste.
 */

export function formatCount(n) {
  return Number(n || 0).toLocaleString('fr-FR').replace(/[\s\u00a0]/g, '\u202f');
}

export function jobsCountScope({ location, city, distance } = {}) {
  const loc = location;
  if (loc && (loc.type === 'commune' || loc.type === 'arrondissement')) {
    const place = String(loc.display || loc.label || city || '').trim();
    const raw = loc.distance != null ? loc.distance : distance;
    const d = Number.isFinite(Number(raw)) ? Number(raw) : 10;
    if (!place) return 'en France';
    if (d === 0) return `à ${place}`;
    if (loc.type === 'arrondissement' && d === 3) {
      return `dans le ${loc.label || place} et les arrondissements voisins`;
    }
    return `à moins de ${d}\u00a0km de ${place}`;
  }
  if (loc && loc.type === 'departement') {
    const name = String(loc.display || loc.label || '').trim();
    return name ? `dans le département ${name}` : 'en France';
  }
  if (loc && loc.type === 'region') {
    const name = String(loc.display || loc.label || '').trim();
    return name ? `dans la région ${name}` : 'en France';
  }
  return 'en France';
}

export function formatJobsCount({
  shown = 0,
  hasMore = false,
  loadError = false,
  location,
  city,
  distance,
} = {}) {
  const scope = jobsCountScope({ location, city, distance });
  const n = Number(shown) || 0;
  if (!n) {
    if (loadError) return '';
    return `0 offre ${scope}`;
  }
  const head = hasMore
    ? (n === 1 ? 'Plus d’une offre' : `${formatCount(n)} premières offres`)
    : `${formatCount(n)} ${n === 1 ? 'offre' : 'offres'}`;
  return `${head} ${scope}`;
}

export function formatJobsMoreMeta({ shown = 0, hasMore = false } = {}) {
  if (!hasMore) {
    return shown ? 'Vous avez vu toutes les offres disponibles pour cette recherche.' : '';
  }
  const n = Number(shown) || 0;
  if (n === 1) return '1 offre affichée. D’autres peuvent correspondre.';
  return `${formatCount(n)} offres affichées. D’autres peuvent correspondre.`;
}
