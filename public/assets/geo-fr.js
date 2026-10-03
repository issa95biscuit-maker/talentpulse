/*
 * TalentPulse — référentiel géographique léger (départements, régions, arrondissements PLM).
 * Source : geo.api.gouv.fr (Licence Ouverte Etalab 2.0), figé ici pour des suggestions instantanées.
 * Fichier partagé : chargé tel quel par le navigateur (<script>) ET importé par les fonctions API (ESM).
 * Il n'utilise ni import ni export : il expose globalThis.TP_GEO.
 */
(function () {
  const DEPARTEMENTS = [['01',"Ain",'84'],['02',"Aisne",'32'],['03',"Allier",'84'],['04',"Alpes-de-Haute-Provence",'93'],['05',"Hautes-Alpes",'93'],['06',"Alpes-Maritimes",'93'],['07',"Ardèche",'84'],['08',"Ardennes",'44'],['09',"Ariège",'76'],['10',"Aube",'44'],['11',"Aude",'76'],['12',"Aveyron",'76'],['13',"Bouches-du-Rhône",'93'],['14',"Calvados",'28'],['15',"Cantal",'84'],['16',"Charente",'75'],['17',"Charente-Maritime",'75'],['18',"Cher",'24'],['19',"Corrèze",'75'],['21',"Côte-d'Or",'27'],['22',"Côtes-d'Armor",'53'],['23',"Creuse",'75'],['24',"Dordogne",'75'],['25',"Doubs",'27'],['26',"Drôme",'84'],['27',"Eure",'28'],['28',"Eure-et-Loir",'24'],['29',"Finistère",'53'],['2A',"Corse-du-Sud",'94'],['2B',"Haute-Corse",'94'],['30',"Gard",'76'],['31',"Haute-Garonne",'76'],['32',"Gers",'76'],['33',"Gironde",'75'],['34',"Hérault",'76'],['35',"Ille-et-Vilaine",'53'],['36',"Indre",'24'],['37',"Indre-et-Loire",'24'],['38',"Isère",'84'],['39',"Jura",'27'],['40',"Landes",'75'],['41',"Loir-et-Cher",'24'],['42',"Loire",'84'],['43',"Haute-Loire",'84'],['44',"Loire-Atlantique",'52'],['45',"Loiret",'24'],['46',"Lot",'76'],['47',"Lot-et-Garonne",'75'],['48',"Lozère",'76'],['49',"Maine-et-Loire",'52'],['50',"Manche",'28'],['51',"Marne",'44'],['52',"Haute-Marne",'44'],['53',"Mayenne",'52'],['54',"Meurthe-et-Moselle",'44'],['55',"Meuse",'44'],['56',"Morbihan",'53'],['57',"Moselle",'44'],['58',"Nièvre",'27'],['59',"Nord",'32'],['60',"Oise",'32'],['61',"Orne",'28'],['62',"Pas-de-Calais",'32'],['63',"Puy-de-Dôme",'84'],['64',"Pyrénées-Atlantiques",'75'],['65',"Hautes-Pyrénées",'76'],['66',"Pyrénées-Orientales",'76'],['67',"Bas-Rhin",'44'],['68',"Haut-Rhin",'44'],['69',"Rhône",'84'],['70',"Haute-Saône",'27'],['71',"Saône-et-Loire",'27'],['72',"Sarthe",'52'],['73',"Savoie",'84'],['74',"Haute-Savoie",'84'],['75',"Paris",'11'],['76',"Seine-Maritime",'28'],['77',"Seine-et-Marne",'11'],['78',"Yvelines",'11'],['79',"Deux-Sèvres",'75'],['80',"Somme",'32'],['81',"Tarn",'76'],['82',"Tarn-et-Garonne",'76'],['83',"Var",'93'],['84',"Vaucluse",'93'],['85',"Vendée",'52'],['86',"Vienne",'75'],['87',"Haute-Vienne",'75'],['88',"Vosges",'44'],['89',"Yonne",'27'],['90',"Territoire de Belfort",'27'],['91',"Essonne",'11'],['92',"Hauts-de-Seine",'11'],['93',"Seine-Saint-Denis",'11'],['94',"Val-de-Marne",'11'],['95',"Val-d'Oise",'11'],['971',"Guadeloupe",'01'],['972',"Martinique",'02'],['973',"Guyane",'03'],['974',"La Réunion",'04'],['976',"Mayotte",'06']];
  const REGIONS = [['11',"Île-de-France"],['24',"Centre-Val de Loire"],['27',"Bourgogne-Franche-Comté"],['28',"Normandie"],['32',"Hauts-de-France"],['44',"Grand Est"],['52',"Pays de la Loire"],['53',"Bretagne"],['75',"Nouvelle-Aquitaine"],['76',"Occitanie"],['84',"Auvergne-Rhône-Alpes"],['93',"Provence-Alpes-Côte d'Azur"],['94',"Corse"],['01',"Guadeloupe"],['02',"Martinique"],['03',"Guyane"],['04',"La Réunion"],['06',"Mayotte"]];

  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’'`]/g, ' ').replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  // Saisies courantes qui ne sont pas des noms officiels
  const REGION_ALIASES = {
    'idf': '11', 'ile de france': '11', 'region parisienne': '11', 'region ile de france': '11', 'paris region': '11',
    'paca': '93', 'provence': '93', 'sud': '93', 'aura': '84', 'rhone alpes': '84', 'auvergne': '84',
    'bfc': '27', 'bourgogne': '27', 'franche comte': '27', 'hdf': '32', 'nord pas de calais': '32', 'picardie': '32',
    'alsace': '44', 'lorraine': '44', 'champagne ardenne': '44', 'aquitaine': '75', 'poitou charentes': '75', 'limousin': '75',
    'midi pyrenees': '76', 'languedoc roussillon': '76', 'centre': '24', 'reunion': '04', 'la reunion': '04',
  };

  // Paris (20), Lyon (9) et Marseille (16) : codes INSEE et postaux des arrondissements municipaux
  const PLM = {
    paris:     { nom: 'Paris',     dep: '75', insee: '75056', max: 20, insee0: 75100, cp0: 75000 },
    lyon:      { nom: 'Lyon',      dep: '69', insee: '69123', max: 9,  insee0: 69380, cp0: 69000 },
    marseille: { nom: 'Marseille', dep: '13', insee: '13055', max: 16, insee0: 13200, cp0: 13000 },
  };
  const ord = n => n === 1 ? '1er' : n + 'e';
  function arrondissement(city, n) {
    const c = PLM[city];
    if (!c || !(n >= 1 && n <= c.max)) return null;
    return { type: 'arrondissement', insee: String(c.insee0 + n), cp: String(c.cp0 + n).padStart(5, '0'), dep: c.dep,
      city: c.nom, label: c.nom + ' ' + ord(n), display: c.nom + ' ' + ord(n) };
  }
  /** « Paris 15 », « paris 15e », « Lyon 3ème », « Marseille 1er arrondissement » */
  function parseArrondissement(text) {
    const m = norm(text).match(/^(paris|lyon|marseille)\s*(\d{1,2})\s*(e|er|eme|ieme|arr|arrt|arrondissement)?(\s*arrondissement)?$/);
    return m ? arrondissement(m[1], parseInt(m[2], 10)) : null;
  }
  /** 75015, 75116, 69003, 13008 -> arrondissement */
  function arrondissementByCp(cp) {
    const s = String(cp || '');
    if (s === '75116') return arrondissement('paris', 16);
    for (const k of Object.keys(PLM)) {
      const c = PLM[k], n = parseInt(s, 10) - c.cp0;
      if (s.slice(0, 2) === String(c.cp0).slice(0, 2) && n >= 1 && n <= c.max) return arrondissement(k, n);
    }
    return null;
  }
  const depByCode = code => {
    let c = String(code || '').toUpperCase();
    if (/^\d$/.test(c)) c = '0' + c;
    const d = DEPARTEMENTS.find(x => x[0] === c);
    return d ? { type: 'departement', code: d[0], label: d[1], region: d[2], display: d[1] } : null;
  };
  const regByCode = code => {
    const r = REGIONS.find(x => x[0] === String(code));
    return r ? { type: 'region', code: r[0], label: r[1], display: r[1] } : null;
  };
  const regionName = code => (REGIONS.find(r => r[0] === code) || [])[1] || '';
  /** Correspondance exacte (nom normalisé, alias ou code) avec un département ou une région */
  function exactPlace(text) {
    const n = norm(text);
    if (!n) return null;
    if (/^(\d{2,3}|2a|2b)$/.test(n)) return depByCode(n);
    if (REGION_ALIASES[n]) return regByCode(REGION_ALIASES[n]);
    const r = REGIONS.find(x => norm(x[1]) === n);
    if (r) return regByCode(r[0]);
    const d = DEPARTEMENTS.find(x => norm(x[1]) === n);
    return d ? depByCode(d[0]) : null;
  }
  /** Suggestions locales (départements, régions, arrondissements) pour l'autocomplétion */
  function suggestPlaces(text, limit) {
    const n = norm(text), out = [];
    if (!n) return out;
    const arr = parseArrondissement(text) || (/^\d{5}$/.test(n) ? arrondissementByCp(n) : null);
    if (arr) out.push(arr);
    if (/^(\d{2,3}|2a|2b)$/.test(n)) { const d = depByCode(n); if (d) out.push(d); }
    const words = n.split(' ');
    const score = name => { const k = norm(name); if (k === n) return 0; if (k.startsWith(n)) return 1; if (k.split(' ').some(w => w.startsWith(words[0])) && words.every(w => k.includes(w))) return 2; return 9; };
    if (REGION_ALIASES[n]) out.push(regByCode(REGION_ALIASES[n]));
    if (n.length >= 2 && !/^\d+$/.test(n)) {
      // Régions d'outre-mer mono-départementales : le département suffit (pas de doublon « Martinique »)
      const regs = REGIONS.filter(r => !['01', '02', '03', '04', '06'].includes(r[0])).map(r => [score(r[1]), regByCode(r[0])]).filter(x => x[0] < 9);
      // Paris (75) est à la fois commune et département : la commune suffit.
      const deps = DEPARTEMENTS.filter(d => d[0] !== '75').map(d => [score(d[1]), depByCode(d[0])]).filter(x => x[0] < 9);
      [...regs, ...deps].sort((a, b) => a[0] - b[0]).forEach(x => out.push(x[1]));
    }
    const seen = new Set();
    return out.filter(p => { const k = p.type + p.code + (p.insee || ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit || 6);
  }
  /** « Saint-Denis (93) » / « saint denis 93 » -> { name: 'saint denis', dep: '93' } */
  function parseNameDep(text) {
    const m = String(text || '').trim().match(/^(.*?[^\d\s(])\s*\(?\s*(\d{2,3}|2[abAB])\s*\)?$/);
    if (!m) return null;
    const dep = m[2].toUpperCase();
    return DEPARTEMENTS.some(d => d[0] === dep) ? { name: m[1].trim(), dep } : null;
  }
  globalThis.TP_GEO = { DEPARTEMENTS, REGIONS, norm, parseArrondissement, arrondissementByCp, depByCode, regByCode, regionName, exactPlace, suggestPlaces, parseNameDep, PLM };
})();
