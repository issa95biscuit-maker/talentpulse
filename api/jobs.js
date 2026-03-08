/**
 * TalentPulse — Proxy multi-sources
 * Sources : France Travail · La Bonne Alternance · Adzuna · Jooble
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    motsCles = '', commune = '', departement = '',
    typeContrat = '', experience = '', codeROME = '',
    range = '0-49', source = 'all'
  } = req.query;

  const keyword  = motsCles.trim();
  const offset   = parseInt((range.split('-')[0]) || '0', 10);
  const limit    = parseInt((range.split('-')[1] || '49'), 10) - offset + 1;
  const errors   = {};

  function safe(fn, name) {
    return fn().catch(e => { errors[name] = e.message; return []; });
  }

  // ══════════════════════════════════════════════════════════
  // 1. FRANCE TRAVAIL
  // ══════════════════════════════════════════════════════════
  async function fetchFT() {
    const clientId     = (process.env.FT_CLIENT_ID     || '').trim();
    const clientSecret = (process.env.FT_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) return [];

    const tokenRes = await fetch(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId, client_secret: clientSecret,
          scope: 'api_offresdemploiv2 o2dsoffre',
        }),
      }
    );
    if (!tokenRes.ok) throw new Error('FT token ' + tokenRes.status);
    const { access_token } = await tokenRes.json();

    const p = new URLSearchParams();
    if (keyword)     p.append('motsCles',    keyword);
    if (typeContrat) p.append('typeContrat', typeContrat);
    if (experience)  p.append('experience',  experience);
    if (codeROME)    p.append('codeROME',    codeROME);
    p.append('range', range);

    // RÈGLE CRITIQUE : l'API FT n'accepte qu'UN SEUL paramètre de localisation
    // commune (code INSEE 5 chiffres) est prioritaire car plus précis
    // departement (2 chiffres) couvre tout le département
    if (commune) {
      p.append('commune', commune);
    } else if (departement) {
      const deptFormatted = String(departement).padStart(2, '0');
      p.append('departement', deptFormatted);
    }

    const r = await fetch(
      `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${p}`,
      { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } }
    );
    if (!r.ok) throw new Error('FT search ' + r.status);

    // Récupérer le total depuis l'en-tête Content-Range
    const contentRange = r.headers.get('Content-Range') || '';
    const data = await r.json();

    // Extraire le total réel ex: "offres 0-49/3421"
    let total = null;
    const crMatch = contentRange.match(/\/(\d+)$/);
    if (crMatch) total = parseInt(crMatch[1]);

    const CONTRACT = { CDI:'CDI', CDD:'CDD', LIB:'Indépendant', STA:'Stage', MIS:'Intérim', SAI:'Saisonnier', CCE:'Contrat chantier', DIN:'Alternance' };
    const resultats = (data.resultats || []).map(j => ({
      id:         'ft_' + j.id,
      source:     'France Travail',
      sourceLogo: 'FT',
      title:      j.intitule || 'Poste non précisé',
      company:    j.entreprise?.nom || 'Entreprise confidentielle',
      city:       j.lieuTravail?.libelle || 'France',
      contract:   CONTRACT[j.typeContrat] || j.typeContrat || 'CDI',
      salary:     j.salaire?.libelle || '',
      exp:        j.experienceLibelle || '',
      desc:       j.description || '',
      url:        j.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${j.id}`,
      posted:     j.dateCreation ? new Date(j.dateCreation).toLocaleDateString('fr-FR') : '',
      cat:        j.secteurActiviteLibelle || '',
    }));

    return { resultats, total };
  }

  // ══════════════════════════════════════════════════════════
  // 2. LA BONNE ALTERNANCE (sans clé)
  // ══════════════════════════════════════════════════════════
  async function fetchLBA() {
    if (typeContrat && typeContrat !== 'DIN' && typeContrat !== 'STA') return [];

    const p = new URLSearchParams({ caller: 'talentpulse', sources: 'offres', radius: '30' });
    if (keyword)     p.set('romes', keyword);
    if (departement) p.set('insee', departement.padStart(2,'0') + '000');

    const r = await fetch(
      `https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/jobs?${p}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return [];
    const data = await r.json();

    const offres = [
      ...(data.jobs?.peJobs?.results || []),
      ...(data.jobs?.lbaCompanies?.results || []),
    ];

    return offres.slice(0, 15).map((j, i) => ({
      id:         'lba_' + (j.job?.id || i),
      source:     'La Bonne Alternance',
      sourceLogo: 'LBA',
      title:      j.job?.title || j.title || 'Alternance / Stage',
      company:    j.company?.name || j.name || 'Entreprise',
      city:       j.place?.city || j.city || 'France',
      contract:   j.job?.contractType || 'Alternance',
      salary:     '',
      exp:        'Débutant accepté',
      desc:       j.job?.description || j.description || '',
      url:        j.url || j.job?.url || 'https://labonnealternance.apprentissage.beta.gouv.fr',
      posted:     j.job?.jobStartDate ? new Date(j.job.jobStartDate).toLocaleDateString('fr-FR') : '',
      cat:        j.job?.romeAppellations?.[0] || 'Alternance',
    }));
  }

  // ══════════════════════════════════════════════════════════
  // 3. ADZUNA
  // ══════════════════════════════════════════════════════════
  async function fetchAdzuna() {
    const appId  = (process.env.ADZUNA_APP_ID  || '').trim();
    const appKey = (process.env.ADZUNA_APP_KEY || '').trim();
    if (!appId || !appKey) return [];

    const page = Math.floor(offset / 20) + 1;
    // Construire la localisation pour Adzuna
    const whereStr = commune
      ? commune
      : departement
        ? departement
        : 'france';

    const p = new URLSearchParams({
      app_id: appId, app_key: appKey,
      results_per_page: Math.min(limit, 20),
      what: keyword || 'emploi',
      where: whereStr,
      country: 'fr',
    });
    if (typeContrat === 'CDI') p.set('full_time', '1');

    const r = await fetch(
      `https://api.adzuna.com/v1/api/jobs/fr/search/${page}?${p}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) throw new Error('Adzuna ' + r.status);
    const data = await r.json();

    return (data.results || []).map(j => ({
      id:         'adz_' + j.id,
      source:     'Adzuna',
      sourceLogo: 'ADZ',
      title:      j.title || 'Poste',
      company:    j.company?.display_name || 'Entreprise',
      city:       j.location?.display_name || 'France',
      contract:   j.contract_type === 'permanent' ? 'CDI' : 'CDD',
      salary:     j.salary_min && j.salary_max
                    ? `${Math.round(j.salary_min/1000)}k–${Math.round(j.salary_max/1000)}k €/an`
                    : j.salary_min ? `Dès ${Math.round(j.salary_min/1000)}k €/an` : '',
      exp:        '',
      desc:       j.description || '',
      url:        j.redirect_url || 'https://adzuna.fr',
      posted:     j.created ? new Date(j.created).toLocaleDateString('fr-FR') : '',
      cat:        j.category?.label || '',
    }));
  }

  // ══════════════════════════════════════════════════════════
  // 4. JOOBLE
  // ══════════════════════════════════════════════════════════
  async function fetchJooble() {
    const apiKey = (process.env.JOOBLE_API_KEY || '').trim();
    if (!apiKey) return [];

    const locationStr = commune || departement || 'France';
    const body = {
      keywords: keyword || 'emploi',
      location: locationStr,
      page: String(Math.floor(offset / 20) + 1),
    };
    if (typeContrat === 'STA') body.employment_type = 'internship';

    const r = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('Jooble ' + r.status);
    const data = await r.json();

    return (data.jobs || []).slice(0, 20).map((j, i) => ({
      id:         'joo_' + (j.id || i),
      source:     'Jooble',
      sourceLogo: 'JOO',
      title:      j.title || 'Poste',
      company:    j.company || 'Entreprise',
      city:       j.location || 'France',
      contract:   j.type || 'CDI',
      salary:     j.salary || '',
      exp:        '',
      desc:       j.snippet || '',
      url:        j.link || 'https://jooble.org',
      posted:     j.updated ? new Date(j.updated).toLocaleDateString('fr-FR') : '',
      cat:        '',
    }));
  }

  // ══════════════════════════════════════════════════════════
  // AGGREGATION round-robin
  // ══════════════════════════════════════════════════════════
  try {
    const requested = source === 'all'
      ? ['ft', 'lba', 'adzuna', 'jooble']
      : source.split(',').map(s => s.trim());

    const map = { ft: fetchFT, lba: fetchLBA, adzuna: fetchAdzuna, jooble: fetchJooble };

    const rawBatches = await Promise.all(
      requested.filter(s => map[s]).map(s => safe(map[s], s))
    );

    // FT renvoie {resultats, total}, les autres renvoient un tableau direct
    let ftTotal = null;
    const batches = rawBatches.map(function(b) {
      if (b && b.resultats) { ftTotal = b.total; return b.resultats; }
      return b || [];
    });

    const results = [];
    const maxLen = Math.max(...batches.map(b => b.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const batch of batches) {
        if (batch[i]) results.push(batch[i]);
      }
    }

    return res.status(200).json({
      resultats: results,
      total:     ftTotal || results.length,
      sources:   requested,
      errors:    Object.keys(errors).length ? errors : undefined,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
