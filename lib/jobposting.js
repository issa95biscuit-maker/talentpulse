/**
 * JobPosting schema.org pour Google for Jobs.
 * Aucune valeur n'est inventée : si un champ obligatoire manque, on n'émet rien.
 * https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
import '../public/assets/geo-fr.js';
const GEO = globalThis.TP_GEO;

const ALLOWED_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i']);
const STUB_TITLE = /^(offre d[’']emploi|poste non précisé|poste)$/i;
const STUB_DESC = /le détail complet et le formulaire de candidature sont sur adzuna/i;
// 100 % distant uniquement. « Télétravail possible » ou un jour par semaine ne qualifient pas.
const FULL_REMOTE = /\b(?:100\s*%\s*(?:de\s+)?t[ée]l[ée]travail|t[ée]l[ée]travail\s*(?:à\s*)?100\s*%|full[\s-]*remote|enti[èe]rement\s+(?:en\s+)?(?:t[ée]l[ée]travail|à\s+distance)|t[ée]l[ée]travail\s+total|100\s*%\s+à\s+distance)\b/i;

export function httpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.href;
  } catch {
    return '';
  }
}

/** Site de l'employeur. Un lien vers le jobboard source n'est pas un sameAs. */
function companySite(value) {
  const href = httpUrl(value);
  if (!href) return '';
  try {
    if (/(^|\.)(francetravail|pole-emploi|adzuna)\.[a-z.]+$/i.test(new URL(href).hostname)) return '';
  } catch {
    return '';
  }
  return href;
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** HTML de description : balises sûres, ou texte converti en paragraphes. Jamais de script. */
export function jobDescriptionHtml(raw) {
  let s = String(raw || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!s) return '';
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(?:script|style)>/gi, '');
  const hasTag = /<[a-z!/]/i.test(s);
  if (!hasTag) {
    return s.split(/\n{2,}/).map(p => `<p>${escapeText(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  s = s.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (full, name) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (tag === 'br') return '<br>';
    return full.startsWith('</') ? `</${tag}>` : `<${tag}>`;
  });
  s = s.replace(/[ \t]+\n/g, '\n').trim();
  if (!s) return '';
  if (!/^<(?:p|ul|ol)\b/i.test(s)) s = `<p>${s}</p>`;
  return s;
}

export function jobDescriptionText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Nom d'employeur exploitable. Vide si l'annonce est anonyme ou le nom absent. */
export function hiringName(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < 2) return '';
  if (/confidentiel|anonyme|non communiqu/i.test(s) && s.length < 60) return '';
  if (/^(n\/?c|n\/a|inconnu|inconnue|confidential|anonymous)$/i.test(s)) return '';
  return s;
}

export function addressLocality(city) {
  const s = String(city || '').replace(/\s+/g, ' ').trim();
  if (!s || /^france$/i.test(s)) return '';
  if (/\((?:dép\.|région)\)$/i.test(s)) return '';
  return s;
}

/** Nom du département fourni par le code source (69 → Rhône). Pas de région inventée. */
export function addressRegion(dept) {
  const d = GEO.depByCode(String(dept || '').trim());
  return d?.label || '';
}

export function postalCodeOf(value) {
  const s = String(value || '').trim();
  return /^\d{5}$/.test(s) ? s : '';
}

/**
 * CDI → FULL_TIME, CDD → TEMPORARY, Intérim → TEMPORARY, Stage → INTERN,
 * Alternance → OTHER, temps partiel → PART_TIME. Tableau si les deux s'appliquent.
 * Un libellé hors de cette liste n'est pas traduit.
 */
export function employmentTypes({ contract = '', tempsPlein = '' } = {}) {
  const c = String(contract || '').trim();
  const types = [];
  if (/\balternance\b/i.test(c)) types.push('OTHER');
  else if (/^stage$/i.test(c)) types.push('INTERN');
  else if (/int[ée]rim/i.test(c)) types.push('TEMPORARY');
  else if (/\bCDD\b/.test(c)) types.push('TEMPORARY');
  else if (/\bCDI\b/.test(c)) types.push('FULL_TIME');
  if (/partiel/i.test(String(tempsPlein || ''))) types.push('PART_TIME');
  if (!types.length) return undefined;
  return types.length === 1 ? types[0] : types;
}

/** Salaire affiché par la source (€/h, €/mois, €/an). Les estimations sont écartées. */
export function baseSalaryOf(job) {
  if (job?.salaryEstimated) return undefined;
  const raw = String(job?.salary || '').trim();
  if (!raw || /estimation/i.test(raw)) return undefined;
  const unit = /€\/h\b/i.test(raw) ? 'HOUR' : /€\/mois\b/i.test(raw) ? 'MONTH' : /€\/an\b/i.test(raw) ? 'YEAR' : '';
  if (!unit) return undefined;
  const head = raw.split(/€\/(?:h|mois|an)\b/i)[0];
  const nums = head.match(/\d+(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d+)?/g);
  if (!nums?.length) return undefined;
  const values = nums.map(n => Number(n.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))).filter(n => n > 0 && Number.isFinite(n));
  if (!values.length) return undefined;
  const money = n => Math.round(n * 100) / 100;
  const min = money(values[0]);
  const max = money(values[1] ?? values[0]);
  const value = min === max
    ? { '@type': 'QuantitativeValue', value: min, unitText: unit }
    : { '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitText: unit };
  return { '@type': 'MonetaryAmount', currency: 'EUR', value };
}

export function explicitFullRemote(job) {
  if (job?.remote === true) return true;
  const blob = [job?.title, job?.desc, job?.horaires, job?.contractDetail, job?.conditions].filter(Boolean).join('\n');
  return FULL_REMOTE.test(blob);
}

function isoDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return s;
  }
  return '';
}

/** Champs obligatoires absents. Tableau vide = l'offre peut être balisée. */
export function missingRequired(job) {
  const miss = [];
  const title = String(job?.title || '').replace(/\s+/g, ' ').trim();
  if (!title || STUB_TITLE.test(title)) miss.push('title');
  if (!hiringName(job?.company)) miss.push('hiringOrganization');
  if (!addressLocality(job?.city) || !addressRegion(job?.dept)) miss.push('jobLocation');
  if (!isoDate(job?.posted)) miss.push('datePosted');
  const html = jobDescriptionHtml(job?.desc);
  const text = jobDescriptionText(html);
  if (!text || STUB_DESC.test(text) || text.toLowerCase() === title.toLowerCase()) miss.push('description');
  return miss;
}

/**
 * Objet JobPosting, ou null si un obligatoire manque.
 * pageUrl : URL canonique de la fiche (pas l'URL de candidature).
 */
export function jobPostingLd(job, { pageUrl } = {}) {
  if (!job || missingRequired(job).length) return null;
  const title = String(job.title).replace(/\s+/g, ' ').trim();
  const company = hiringName(job.company);
  const locality = addressLocality(job.city);
  const region = addressRegion(job.dept);
  const description = jobDescriptionHtml(job.desc);
  const address = {
    '@type': 'PostalAddress',
    addressLocality: locality,
    addressRegion: region,
    addressCountry: 'FR',
  };
  const postal = postalCodeOf(job.postalCode);
  if (postal) address.postalCode = postal;
  const org = { '@type': 'Organization', name: company };
  const sameAs = companySite(job.companyUrl);
  const logo = httpUrl(job.logo);
  if (sameAs) org.sameAs = sameAs;
  if (logo) org.logo = logo;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description,
    datePosted: isoDate(job.posted),
    hiringOrganization: org,
    jobLocation: { '@type': 'Place', address },
    directApply: false,
  };
  if (job.id) ld.identifier = { '@type': 'PropertyValue', name: company, value: String(job.id) };
  const page = httpUrl(pageUrl);
  if (page) ld.url = page;
  const through = isoDate(job.expires);
  if (through) ld.validThrough = through;
  const employment = employmentTypes(job);
  if (employment) ld.employmentType = employment;
  const salary = baseSalaryOf(job);
  if (salary) ld.baseSalary = salary;
  if (explicitFullRemote(job)) {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = { '@type': 'Country', name: 'FR' };
  }
  return ld;
}

/** Balise script prête à insérer. `<` est échappé pour qu'un `</script>` ne puisse pas sortir du JSON. */
export function jobPostingScript(job, opts) {
  const ld = jobPostingLd(job, opts);
  if (!ld) return '';
  const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}
