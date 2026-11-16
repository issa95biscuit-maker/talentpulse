/*
 * TalentPulse — libellés affichés (intitulés, employeurs).
 * Fichier partagé : chargé tel quel par le navigateur (<script>) ET importé par les fonctions API (ESM).
 * Il n'utilise ni import ni export : il expose globalThis.TP_DISPLAY.
 *
 * typoTitle : nettoyage typographique (casse, H/F en doublon, accents manquants).
 *             Appliqué aux données et, le cas échéant, au JSON-LD.
 * displayTitle : typoTitle + écriture inclusive développée, pour l'affichage uniquement.
 * displayContract : durée France Travail (« Intérim - 3 Jour(s) ») rendue lisible.
 *             Affichage seulement : contractDetail de l'API reste la valeur source.
 * displayCompany : ellipse propre si le nom Service Public a été coupé à la source (90 car.).
 */
(function () {
  const ACRONYMS = new Set(['CDI', 'CDD', 'BTP', 'RH', 'IT', 'SAV', 'VTC', 'ASH', 'AES', 'AESH', 'ATSEM', 'DRH', 'CAP', 'BEP', 'BTS', 'BAC', 'BAFA', 'BAFD', 'SNCF', 'RATP', 'PL', 'SPL', 'VL', 'CACES', 'SSIAP', 'ADV', 'QHSE', 'HSE', 'IDE', 'AS', 'DAF', 'PME', 'TPE', 'B2B', 'B2C', 'SEO', 'UX', 'UI', 'QA', 'SAP', 'ERP', 'CRM', 'IA', 'BIM', 'CVC', 'GMS', 'ETAM', 'EHPAD', 'SMS', 'CHU']);
  const CSP_EMPLOYER_MAX = 90;
  const SKIP_FEM = /^(managers?|designers?|engineers?|developers?|leaders?|traders?|partners?|webmaster)$/i;

  /**
   * « Alternance : Alternance commercial » → « Alternance commercial ».
   * Adzuna répète souvent le type de contrat avant le vrai intitulé.
   */
  function dedupeTitlePrefix(s) {
    const re = /^(\s*)(alternance|apprentissage|stage|stagiaire|int[ée]rim|cdi|cdd|saisonnier)\s*[:：\-–—]\s*(?=\2\b)/i;
    if (!re.test(s)) return s;
    const out = s.replace(re, '$1');
    const letters = out.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length > 6 && letters === letters.toUpperCase()) return out;
    return out.replace(/^(cdi|cdd)\b/i, m => m.toUpperCase());
  }

  function applyInclusiveAccents(s) {
    return String(s)
      .replace(/\b([Cc])harge\((e)\)/g, '$1hargé($2)')
      .replace(/\b([Ee])mploye\((e)\)/g, '$1mployé($2)')
      .replace(/\b([Dd])elegue\((e)\)/g, '$1élégué($2)')
      .replace(/\b([Aa])ttache\((e)\)/g, '$1ttaché($2)');
  }

  /** Nettoyage typographique : casse, H/F unique, « Employé (e) » → « Employé(e) », accents manquants. */
  function typoTitle(t) {
    let s = dedupeTitlePrefix(String(t || '').replace(/\s+/g, ' ').trim());
    const marker = /\s*[(\[]?\s*\b(?:h\s*\/\s*f\s*\/\s*x|f\s*\/\s*h\s*\/\s*x|h\s*\/\s*f|f\s*\/\s*h|h\s*-\s*f|f\s*-\s*h)\b\s*[)\]]?/gi;
    const had = marker.test(s);
    s = s.replace(marker, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s*[-–,/]\s*$/, '').trim();
    const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length > 6 && letters === letters.toUpperCase()) {
      s = s.toLowerCase().replace(/[a-zà-ÿ0-9]+/g, w => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
    } else {
      s = s.replace(/\b[A-ZÀ-Ÿ]{4,}\b/g, w => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()));
    }
    s = s.replace(/(\p{L})\s+\((e|ne|se|euse|ère|rice|trice)\)/gu, '$1($2)');
    s = applyInclusiveAccents(s);
    if (had) s += ' (H/F)';
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function sameCap(sample, word) {
    if (!word) return word;
    if (sample && sample === sample.toUpperCase() && sample.length > 1) return word.toUpperCase();
    if (/^\p{Lu}/u.test(sample || '')) return word.charAt(0).toUpperCase() + word.slice(1);
    return word.charAt(0).toLowerCase() + word.slice(1);
  }

  function feminineOf(masc, suffix) {
    const s = String(suffix || '').toLowerCase();
    if (SKIP_FEM.test(masc)) return '';
    if (s === 'e') {
      if (/é$/i.test(masc)) return masc + 'e';
      if (/eur$/i.test(masc)) return masc + 'e';
      if (/er$/i.test(masc)) return masc.slice(0, -2) + 'ère';
      return masc + 'e';
    }
    if (s === 'ère' && /er$/i.test(masc)) return masc.slice(0, -2) + 'ère';
    if ((s === 'se' || s === 'euse') && /eur$/i.test(masc)) return masc.slice(0, -3) + 'euse';
    if (s === 'trice' && /teur$/i.test(masc)) return masc.slice(0, -4) + 'trice';
    if (s === 'rice' && /eur$/i.test(masc)) return masc.slice(0, -3) + 'rice';
    if (s === 'ive' && /if$/i.test(masc)) return masc.slice(0, -2) + 'ive';
    if (s === 'ne') return masc + 'ne';
    return '';
  }

  // Suffixe court après une barre (« vendeur/euse »), pas un second mot (« Vendeur/Vendeuse »).
  const SLASH_SUF = 'iennes|ienne|euses|euse|trices|trice|ières|ière|ieres|iere|ères|ère|eres|ere|rices|rice|ives|ive|ses|se|nes|ne|es|e';
  const BARE_SUF = new RegExp('^(?:' + SLASH_SUF + ')$', 'i');
  const STEM_ACCENT = { charge: 'chargé', employe: 'employé', delegue: 'délégué', attache: 'attaché' };

  function canonicalSuffix(suf) {
    const s = String(suf || '').toLowerCase();
    const bare = s.normalize('NFD').replace(/\p{M}/gu, '');
    if (bare === 'iere' || bare === 'ere') return 'ère';
    if (bare === 'ieres' || bare === 'eres') return 'ères';
    return s;
  }

  function accentStem(masc) {
    const bare = masc.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const fix = STEM_ACCENT[bare];
    return fix ? sameCap(masc, fix) : masc;
  }

  /** Féminin d'un suffixe abrégé. Chaîne vide si la forme n'est pas sûre : on n'invente pas le mot. */
  function feminineSlash(masc, suf) {
    const s = canonicalSuffix(suf);
    if (s === 'ienne') return /ien$/i.test(masc) ? masc.slice(0, -3) + 'ienne' : '';
    if (s === 'ne') return /(ien|on)$/i.test(masc) ? masc + 'ne' : '';
    return feminineOf(masc, s);
  }

  function expandSlashPair(masc, sufRaw) {
    let suf = canonicalSuffix(sufRaw);
    let stem = masc;
    let plural = false;
    if (/s$/i.test(suf) && /s$/i.test(stem) && stem.length > 2 && suf.length > 1) {
      plural = true;
      stem = stem.slice(0, -1);
      suf = canonicalSuffix(suf.slice(0, -1));
    }
    stem = accentStem(stem);
    const fem = feminineSlash(stem, suf);
    if (!fem) return '';
    const mascOut = plural ? stem + 's' : stem;
    const femOut = plural ? fem + 's' : fem;
    return mascOut + ' / ' + sameCap(mascOut, femOut);
  }

  function expandInclusive(s) {
    let out = String(s);
    out = out.replace(/(\p{L}[\p{L}'’.-]*)\((e|ne|se|euse|ère|rice|trice|ive)\)/gu, (all, masc, suf) => {
      const fem = feminineOf(masc, suf);
      if (!fem) return all;
      return masc + ' / ' + sameCap(masc, fem);
    });
    out = out.replace(/\b(\p{L}+)\.fe\b/gu, (all, masc) => {
      if (/^chef$/i.test(masc)) return masc + ' / ' + sameCap(masc, 'cheffe');
      return all;
    });
    out = out.replace(new RegExp('(\\p{L}[\\p{L}\'’.-]*)\\s*\\/\\s*(' + SLASH_SUF + ')\\b', 'giu'), (all, masc, suf) => expandSlashPair(masc, suf) || all);
    out = out.replace(/\b(\p{L}*t)eurs?\/trices?\b/giu, (all, stem) => {
      const masc = all.split('/')[0];
      const plural = /s$/i.test(masc);
      const fem = stem + 'rice' + (plural ? 's' : '');
      return masc + ' / ' + sameCap(masc, fem);
    });
    // Barre collée (« Pharmacie/Parapharmacie ») ou espace d'un seul côté (« Vendeur/ Vendeuse »).
    // On ne réécrit pas une barre déjà entourée d'espaces : sinon « Préparatrice/vendeur »
    // qui suit « Préparateur / » resterait collé. Un suffixe non développé (« Foo/euse ») reste source.
    const spaceSlash = (all, a, b) => (BARE_SUF.test(b) ? all : a + ' / ' + b);
    out = out.replace(/(\p{L}{2,})\/(\p{L}{2,})/gu, spaceSlash);
    out = out.replace(/(\p{L}{2,})\/\s+(\p{L}{2,})/gu, spaceSlash);
    out = out.replace(/(\p{L}{2,})\s+\/(\p{L}{2,})/gu, spaceSlash);
    return out.replace(/\s+/g, ' ').trim();
  }

  function displayTitle(t) {
    const s = typoTitle(t);
    return s ? expandInclusive(s) : s;
  }

  const CONTRACT_UNIT = {
    jour: ['jour', 'jours'], jours: ['jour', 'jours'],
    mois: ['mois', 'mois'],
    an: ['an', 'ans'], ans: ['an', 'ans'],
    année: ['année', 'années'], années: ['année', 'années'],
    annee: ['année', 'années'], annees: ['année', 'années'],
    semaine: ['semaine', 'semaines'], semaines: ['semaine', 'semaines'],
    heure: ['heure', 'heures'], heures: ['heure', 'heures'],
    minute: ['minute', 'minutes'], minutes: ['minute', 'minutes'],
  };

  /**
   * « Intérim - 3 Jour(s) » → « Intérim · 3 jours », « CDD - 6 Mois » → « CDD · 6 mois ».
   * Un libellé qui n'est pas « [type -] nombre unité » repart tel quel.
   */
  function displayContract(value) {
    const raw = value == null ? '' : String(value);
    const s = raw.replace(/[\u00a0\u202f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!s) return '';
    const m = s.match(/^(?:(.+?)\s+[-–—‑]\s+)?(\d+(?:[.,]\d+)?)\s+(années|annees|année|annee|semaines|semaine|heures|heure|minutes|minute|jours|jour|mois|ans|an)(?:\(s\))?\s*$/i);
    if (!m) return raw.trim();
    const n = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(n)) return raw.trim();
    const forms = CONTRACT_UNIT[m[3].toLowerCase()];
    if (!forms) return raw.trim();
    const qty = Number.isInteger(n) ? String(n) : m[2].replace('.', ',');
    const duration = qty + ' ' + forms[n === 1 ? 0 : 1];
    const prefix = (m[1] || '').trim();
    return prefix ? prefix + ' · ' + duration : duration;
  }

  /**
   * Nom d'employeur coupé à 90 caractères : on s'arrête au dernier mot complet et on ajoute une ellipse.
   * On n'invente jamais la fin du mot (pas « Départemental » à partir de « Départementa »).
   */
  function displayCompany(name) {
    const s = String(name || '').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    if (/[…]$/.test(s) || /\.{3}$/.test(s)) return s.replace(/\.{3}$/, '…');
    if (s.length < CSP_EMPLOYER_MAX) return s;
    const cut = s.slice(0, CSP_EMPLOYER_MAX);
    const atWord = cut.replace(/[\s/·,;:.\-–—]+[^\s/·]*$/, '').replace(/[\s/·,;:.\-–—]+$/, '');
    const base = atWord.length >= 12 ? atWord : cut.replace(/[\s/·,;:.\-–—]+$/, '');
    return (base || cut) + '…';
  }

  globalThis.TP_DISPLAY = { typoTitle, displayTitle, displayContract, displayCompany, dedupeTitlePrefix, CSP_EMPLOYER_MAX };
})();
