/**
 * TalentPulse — Proxy multi-sources v2
 * DEBUG amélioré — retourne l'erreur exacte
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // MODE DIAGNOSTIC
  if (req.query.debug === '1') {
    return res.status(200).json({
      env: {
        FT_CLIENT_ID:     process.env.FT_CLIENT_ID     ? '✅ présent (' + process.env.FT_CLIENT_ID.slice(0,4) + '...)' : '❌ MANQUANT',
        FT_CLIENT_SECRET: process.env.FT_CLIENT_SECRET ? '✅ présent' : '❌ MANQUANT',
        ADZUNA_APP_ID:    process.env.ADZUNA_APP_ID    ? '✅ présent' : '❌ manquant',
        ADZUNA_APP_KEY:   process.env.ADZUNA_APP_KEY   ? '✅ présent' : '❌ manquant',
        GEMINI_API_KEY:   process.env.GEMINI_API_KEY   ? '✅ présent' : '❌ manquant',
      },
      message: 'Diagnostic TalentPulse OK'
    });
  }

  // MODE DEBUG COMPLET — teste chaque source et retourne les erreurs
  if (req.query.debug === '2') {
    const results = {};

    // Test token FT
    try {
      const clientId     = (process.env.FT_CLIENT_ID     || '').trim();
      const clientSecret = (process.env.FT_CLIENT_SECRET || '').trim();
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
      const tokenBody = await tokenRes.text();
      if (!tokenRes.ok) {
        results.ft_token = `❌ ERREUR ${tokenRes.status}: ${tokenBody.slice(0, 300)}`;
      } else {
        const tokenData = JSON.parse(tokenBody);
        results.ft_token = `✅ Token OK (expire dans ${tokenData.expires_in}s)`;

        // Test recherche FT
        const searchRes = await fetch(
          'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?range=0-4',
          { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' } }
        );
        const searchBody = await searchRes.text();
        if (!searchRes.ok) {
          results.ft_search = `❌ ERREUR ${searchRes.status}: ${searchBody.slice(0, 300)}`;
        } else {
          const searchData = JSON.parse(searchBody);
          results.ft_search = `✅ ${(searchData.resultats || []).length} offres reçues`;
          results.ft_total = searchRes.headers.get('Content-Range') || 'pas de Content-Range';
        }
      }
    } catch(e) {
      results.ft_error = `❌ Exception: ${e.message}`;
    }

    // Test Adzuna
    try {
      const appId  = (process.env.ADZUNA_APP_ID  || '').trim();
      const appKey = (process.env.ADZUNA_APP_KEY || '').trim();
      const adzRes = await fetch(
        `https://api.adzuna.com/v1/api/jobs/fr/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=3&what=emploi`,
        { headers: { Accept: 'application/json' } }
      );
      const adzBody = await adzRes.text();
      if (!adzRes.ok) {
        results.adzuna = `❌ ERREUR ${adzRes.status}: ${adzBody.slice(0, 200)}`;
      } else {
        const adzData = JSON.parse(adzBody);
        results.adzuna = `✅ ${(adzData.results || []).length} offres reçues`;
      }
    } catch(e) {
      results.adzuna_error = `❌ Exception: ${e.message}`;
    }

    return res.status(200).json({ debug: 2, results });
  }

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

  // ── FRANCE TRAVAIL ──
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
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      throw new Error(`FT token ${tokenRes.status}: ${errBody.slice(0, 200)}`);
    }
    const { access_token } = await tokenRes.json();

    const p = new URLSearchParams();
    if (keyword)     p.append('motsCles',    keyword);
    if (typeContrat) p.append('typeContrat', typeContrat);
    if (experience)  p.append('experience',  experience);
    if (codeROME)    p.append('codeROME',    codeROME);
    p.append('range', range);

    if (commune) {
      p.append('commune', commune);
    } else if (departement) {
      p.append('departement', String(departement).padStart(2, '0'));
    }

    const r = await fetch(
      `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${p}`,
      { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } }
    );
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      throw new Error(`FT search ${r.status}: ${errBody.slice(0, 200)}`);
    }

    const contentRange = r.headers.get('Content-Range') || '';
    const data = await r.json();
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

  // ── LA BONNE ALTERNANCE ──
  async function fetchLBA() {
    if (typeContrat && typeContrat !== 'DIN' && typeContrat !== 'STA') return [];
    const p = new URLSearchParams({ caller: 'talentpulse', sources: 'offres', radius: '30' });
    if (keyword)     p.set('romes', keyword);
    if (departement) p.set('insee', departement.padStart(2,'0') + '000');
    const r = await fetch(`https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/jobs?${p}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    const offres = [...(data.jobs?.peJobs?.results || []), ...(data.jobs?.lbaCompanies?.results || [])];
    return offres.slice(0, 15).map((j, i) => ({
      id: 'lba_' + (j.job?.id || i), source: 'La Bonne Alternance', sourceLogo: 'LBA',
      title: j.job?.title || j.title || 'Alternance / Stage',
      company: j.company?.name || j.name || 'Entreprise',
      city: j.place?.city || j.city || 'France',
      contract: j.job?.contractType || 'Alternance', salary: '',
      exp: 'Débutant accepté', desc: j.job?.description || j.description || '',
      url: j.url || j.job?.url || 'https://labonnealternance.apprentissage.beta.gouv.fr',
      posted: '', cat: 'Alternance',
    }));
  }

  // ── ADZUNA ──
  async function fetchAdzuna() {
    const appId  = (process.env.ADZUNA_APP_ID  || '').trim();
    const appKey = (process.env.ADZUNA_APP_KEY || '').trim();
    if (!appId || !appKey) return [];
    const page = Math.floor(offset / 20) + 1;
    const ADZUNA_CITIES = {
      '75':'Paris','92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne',
      '91':'Essonne','77':'Seine-et-Marne','78':'Yvelines','95':"Val-d'Oise",
      '69':'Lyon','13':'Marseille','31':'Toulouse','06':'Nice','44':'Nantes',
      '67':'Strasbourg','33':'Bordeaux','59':'Lille','34':'Montpellier',
      '35':'Rennes','38':'Grenoble','76':'Rouen',
    };
    const whereStr = commune ? (ADZUNA_CITIES[commune] || 'France') : departement ? (ADZUNA_CITIES[departement] || 'France') : 'France';
    const p = new URLSearchParams({ results_per_page: String(Math.min(limit, 20)), what: keyword || 'emploi', where: whereStr });
    if (typeContrat === 'CDI') p.set('full_time', '1');
    const r = await fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/${page}?app_id=${appId}&app_key=${appKey}&${p}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) { const t = await r.text().catch(()=>''); throw new Error(`Adzuna ${r.status}: ${t.slice(0,100)}`); }
    const data = await r.json();
    return (data.results || []).map(j => ({
      id: 'adz_' + j.id, source: 'Adzuna', sourceLogo: 'ADZ',
      title: j.title || 'Poste', company: j.company?.display_name || 'Entreprise',
      city: j.location?.display_name || 'France',
      contract: j.contract_type === 'permanent' ? 'CDI' : j.contract_type || 'CDI',
      salary: j.salary_min && j.salary_max ? `${Math.round(j.salary_min/1000)}k–${Math.round(j.salary_max/1000)}k €/an` : '',
      exp: '', desc: j.description || '', url: j.redirect_url || 'https://www.adzuna.fr',
      posted: j.created ? new Date(j.created).toLocaleDateString('fr-FR') : '', cat: j.category?.label || '',
    }));
  }

  // ── AGGREGATION ──
  try {
    const requested = source === 'all' ? ['ft', 'lba', 'adzuna'] : source.split(',').map(s => s.trim());
    const map = { ft: fetchFT, lba: fetchLBA, adzuna: fetchAdzuna };
    const rawBatches = await Promise.all(requested.filter(s => map[s]).map(s => safe(map[s], s)));

    let ftTotal = null;
    const batches = rawBatches.map(b => {
      if (b && b.resultats) { ftTotal = b.total; return b.resultats; }
      return b || [];
    });

    const results = [];
    const maxLen = Math.max(...batches.map(b => b.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const batch of batches) { if (batch[i]) results.push(batch[i]); }
    }

    return res.status(200).json({
      resultats: results,
      total: ftTotal || results.length,
      sources: requested,
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
