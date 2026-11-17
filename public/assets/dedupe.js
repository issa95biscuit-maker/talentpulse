/*
 * TalentPulse — dédoublonnage des offres après fusion des sources.
 * Fichier partagé : chargé tel quel par le navigateur (<script>) ET importé par l'API (ESM).
 * Il n'utilise ni import ni export : il expose globalThis.TP_DEDUPE.
 *
 * Clé : titre (casse, accents, ponctuation, mentions H/F) + entreprise fiable
 * + commune ou code postal. Sans entreprise fiable (vide, « non communiquée »,
 * ou simple nom de jobboard), on ne fusionne pas deux annonces entre elles.
 * Une republication dont l'employeur est le jobboard peut rejoindre l'unique
 * offre fiable de même titre et de même lieu.
 * On garde France Travail, sinon la source officielle (lien Postuler, plus de champs)
 * et on ne complète que les champs encore vides (salaire non estimé, par exemple).
 */
(function () {
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  const GENERIC_COMPANY = new Set(['restaurant', 'brasserie', 'hotel', 'societe', 'entreprise', 'groupe', 'services', 'mairie', 'association', 'commerce', 'magasin', 'boutique', 'cafe']);
  const BOARD_COMPANY = /^(?:france travail|pole emploi|poleemploi|adzuna|indeed|choisir le service public)$/;
  const HF_MARKER = /[(\[]?\s*\b(?:h\s*[/\-]\s*f(?:\s*[/\-]\s*x)?|f\s*[/\-]\s*h(?:\s*[/\-]\s*x)?|hf|fh)\b\s*[)\]]?/gi;

  function titleKey(title) {
    const stripped = String(title || '').replace(HF_MARKER, ' ');
    return norm(stripped).replace(/\b(?:h f x|f h x|h f|f h|hf|fh)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Chaîne vide = entreprise trop peu fiable pour servir de clé. */
  function companyKey(company) {
    const n = norm(company);
    if (!n) return '';
    if (n.length < 60 && /non communiqu|confidentiel|anonyme|anonym/.test(n)) return '';
    if (BOARD_COMPANY.test(n) || /^(?:nc|n c|n a|inconnu|inconnue)$/.test(n)) return '';
    return n;
  }

  function communeKey(city) {
    return norm(String(city || '').split(',')[0])
      .replace(/\b(\d{1,2})\s*(?:eme|er|e)\b/g, '$1')
      .replace(/\bfrance\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function postalOf(job) {
    const s = String(job?.postalCode || '').trim();
    return /^\d{5}$/.test(s) ? s : '';
  }

  /** Même commune, ou même code postal, sans contradiction (autre CP, autre INSEE). */
  function placeCompatible(a, b) {
    const inseeA = String(a?._insee || a?.insee || '').toUpperCase();
    const inseeB = String(b?._insee || b?.insee || '').toUpperCase();
    if (inseeA && inseeB && inseeA !== inseeB) return false;
    const pa = postalOf(a), pb = postalOf(b);
    if (pa && pb && pa !== pb) return false;
    const ca = communeKey(a?.city), cb = communeKey(b?.city);
    if (ca && cb && ca === cb) return true;
    if (pa && pb && pa === pb) return true;
    if ((ca && pb && ca === pb) || (cb && pa && cb === pa)) return true;
    if (!ca && !cb && !pa && !pb) return true;
    return false;
  }

  /** « Groupama » devant « Groupama Méditerranée », jamais un mot générique. */
  function companiesPrefix(a, b) {
    if (!a || !b || a === b) return false;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (s.length < 8 || GENERIC_COMPANY.has(s)) return false;
    return l.startsWith(s + ' ');
  }

function salaryEstimated(job) {
  return /estimation/i.test(String(job?.salary || ''));
}

function descKey(desc) {
  const raw = String(desc || '').replace(/^\s*description du poste\s*[:：-]?\s*/i, '');
  return norm(raw);
}

/** Début de texte commun : on ne recolle pas une republication sur un autre poste du même intitulé. */
function sameText(a, b) {
  const da = descKey(a?.desc), db = descKey(b?.desc);
  if (da.length < 40 || db.length < 40) return false;
  const n = Math.min(60, da.length, db.length);
  return da.slice(0, n) === db.slice(0, n);
}

function companyMentioned(reliable, unreliable) {
  const ck = companyKey(reliable?.company);
  if (!ck || ck.length < 4) return false;
  return descKey(unreliable?.desc).includes(ck);
}

  function blank(v) {
    return v == null || v === '';
  }

  const FILL_FIELDS = ['contract', 'contractDetail', 'exp', 'expYears', 'tempsPlein', 'horaires', 'postalCode', 'permis', 'langues', 'niveauEtudes', 'competences', 'qualites', 'avantages', 'cat', 'conditions', 'logo', 'companyUrl', 'applyEmail', 'applyUrl', 'contactName', 'expires', 'dept', 'city'];

  function richness(job) {
    let n = 0;
    for (const k of FILL_FIELDS) if (!blank(job?.[k])) n++;
    if (job?.salary || job?.salaryMin) n++;
    if (job?.desc) n++;
    return n;
  }

  /** France Travail, puis le service public, puis un lien Postuler, puis la fiche la plus remplie. */
  function prefer(current, candidate) {
    const rank = (j) => {
      const official = j.source === 'France Travail' ? 0 : (j.source === 'Choisir le Service Public' || j.publicSector) ? 1 : 2;
      const apply = (j.applyUrl || j.applyEmail) ? 0 : 1;
      return [official, apply, -richness(j)];
    };
    const a = rank(current), b = rank(candidate);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? current : candidate;
    return current;
  }

  function fillMissing(winner, loser) {
    const out = { ...winner };
    if (!companyKey(out.company) && companyKey(loser.company)) out.company = loser.company;
    const winnerHasSalary = !!(out.salary || out.salaryMin || out.salaryMax);
    const loserSalaryOk = !!(loser.salary || loser.salaryMin) && !salaryEstimated(loser);
    if (!winnerHasSalary && loserSalaryOk) {
      if (loser.salary) out.salary = loser.salary;
      if (loser.salaryMin != null) out.salaryMin = loser.salaryMin;
      if (loser.salaryMax != null) out.salaryMax = loser.salaryMax;
    }
    for (const k of FILL_FIELDS) {
      if (blank(out[k]) && !blank(loser[k])) out[k] = loser[k];
    }
    if (!out.desc && loser.desc && !/formulaire de candidature sont sur adzuna/i.test(loser.desc)) {
      out.desc = loser.desc;
      out.descIsExcerpt = !!loser.descIsExcerpt;
    }
    return out;
  }

  function collapseGroup(members) {
    let best = { ...members[0], otherLocations: 0 };
    for (const other of members.slice(1)) {
      const winner = prefer(best, other);
      const loser = winner === best ? other : best;
      best = { ...fillMissing(winner, loser), otherLocations: 0 };
    }
    return best;
  }

/**
 * Deux codes postaux explicites et différents : deux postes, même texte recopié.
 * L'INSEE ajouté par le géocodage ne compte pas : une même annonce Adzuna
 * publiée à Lyon et à Villeurbanne doit rester regroupée (otherLocations).
 */
function explicitPlaceConflict(a, b) {
  const pa = postalOf(a), pb = postalOf(b);
  return !!(pa && pb && pa !== pb);
}

/** Même texte publié dans plusieurs villes : une fiche, otherLocations compte les autres. */
function collapseMultiCity(jobs) {
  const byAd = new Map();
  const out = [];
  for (const j of jobs) {
    const ck = companyKey(j.company);
    const desc = norm(j.desc);
    const adKey = ck && desc ? titleKey(j.title) + '|' + ck + '|' + desc.slice(0, 140) : '';
    if (adKey && byAd.has(adKey) && !explicitPlaceConflict(byAd.get(adKey), j)) { byAd.get(adKey).otherLocations++; continue; }
      const copy = { ...j, otherLocations: j.otherLocations || 0 };
      if (adKey) byAd.set(adKey, copy);
      out.push(copy);
    }
    return out;
  }

  function dedupe(jobs) {
    const groups = [];
    for (const raw of jobs || []) {
      const job = { ...raw };
      const ck = companyKey(job.company);
      if (!ck) { groups.push([job]); continue; }
      const hits = [];
      for (let g = 0; g < groups.length; g++) {
        const members = groups[g];
        const same = members.every(m => companyKey(m.company) === ck && titleKey(m.title) === titleKey(job.title) && placeCompatible(m, job));
        if (same) hits.push(g);
      }
      if (hits.length === 1) groups[hits[0]].push(job);
      else groups.push([job]);
    }

    const prefixOf = new Map();
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const ca = companyKey(groups[i][0].company), cb = companyKey(groups[j][0].company);
        if (!companiesPrefix(ca, cb)) continue;
        if (titleKey(groups[i][0].title) !== titleKey(groups[j][0].title)) continue;
        const placesOk = groups[i].every(a => groups[j].every(b => placeCompatible(a, b)));
        if (!placesOk) continue;
        const short = ca.length <= cb.length ? i : j;
        const long = short === i ? j : i;
        if (!prefixOf.has(short)) prefixOf.set(short, []);
        prefixOf.get(short).push(long);
      }
    }
    const drop = new Set();
    for (const [short, longs] of prefixOf) {
      if (longs.length !== 1 || drop.has(short) || drop.has(longs[0])) continue;
      groups[longs[0]].push(...groups[short]);
      drop.add(short);
    }
    const afterPrefix = groups.filter((_, i) => !drop.has(i));

    const reliable = [];
    const unreliable = [];
    for (const g of afterPrefix) {
      if (g.every(m => !companyKey(m.company))) unreliable.push(g);
      else reliable.push(g);
    }
    const kept = [];
    for (const g of unreliable) {
      const hits = reliable.filter(r => g.every(u => r.every(m => titleKey(u.title) === titleKey(m.title) && placeCompatible(u, m) && (sameText(u, m) || companyMentioned(m, u)))));
      if (hits.length === 1) hits[0].push(...g);
      else kept.push(g);
    }
    return collapseMultiCity([...reliable, ...kept].map(collapseGroup));
  }

  globalThis.TP_DEDUPE = { dedupe, titleKey, companyKey, communeKey, placeCompatible };
})();
