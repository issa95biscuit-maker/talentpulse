import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  _resetDataEmploi, CACHE_MS, DATA_EMPLOI_SCOPE, DATA_EMPLOI_SOURCE_URL,
  pickActivite, pickFrance, pickLatestRow, readIndicateur, formatPrincipal, formatPeriode,
  formatFrInt, formatEuro, matchTerritoryType, resolveTerritory, sourceSentence, marketFiguresHtml,
  dataEmploiEnabled, loadMarketSnapshot,
} from '../lib/data-emploi.js';
import health from '../api/health.js';
import seo from '../api/seo.js';
import { _clearCache } from '../lib/seo.js';
import { call, setEnv } from './helpers.mjs';

const realFetch = global.fetch;
const NOW = Date.parse('2026-11-17T12:00:00Z');

beforeEach(() => {
  _resetDataEmploi();
  _clearCache();
  setEnv({});
});
afterEach(() => { global.fetch = realFetch; });

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

test('période, nombres français et ligne de source', () => {
  assert.deepEqual(formatPeriode('2025T3', '2025 T3'), { label: '3e trimestre 2025', kind: 'quarter' });
  assert.deepEqual(formatPeriode('2025T1'), { label: '1er trimestre 2025', kind: 'quarter' });
  assert.deepEqual(formatPeriode('2025M09'), { label: 'septembre 2025', kind: 'month' });
  assert.equal(formatFrInt(12345), '12\u202f345');
  assert.equal(formatEuro(1850), '1\u202f850\u00a0€');
  assert.equal(formatPrincipal({ valeurPrincipaleNombre: 0 }).text, '0');
  assert.equal(formatPrincipal({ valeurPrincipaleNombre: null, valeurPrincipaleNom: 'Forte' }).text, 'Forte');
  assert.equal(formatPrincipal({ valeurPrincipaleMontant: 2100 }).text, '2\u202f100\u00a0€');
  const figures = [{ periode: formatPeriode('2025T3') }];
  assert.equal(sourceSentence(figures), 'Source\u00a0: France Travail, données du 3e trimestre 2025.');
  assert.equal(sourceSentence([{ periode: formatPeriode('2025M03') }]), 'Source\u00a0: France Travail, données de mars 2025.');
  assert.equal(sourceSentence([{ periode: formatPeriode('2025T3') }, { periode: formatPeriode('2025T2') }]), 'Source\u00a0: France Travail.');
  assert.deepEqual(formatPeriode('2022', 'ANNEE 2022'), { label: 'année 2022', kind: 'year', year: '2022' });
  assert.equal(formatPeriode('2026T2', '2ème trimestre 2026').label, '2ème trimestre 2026');
  assert.equal(sourceSentence([{ periode: formatPeriode('2022', 'ANNEE 2022') }]), 'Source\u00a0: France Travail, données de l’année 2022.');
});

test('sélection de ligne : une valeur, un total, ou rien si le cumul serait inventé', () => {
  const a = { codePeriode: '2025T2', valeurPrincipaleNombre: 10 };
  const b = { codePeriode: '2025T3', codeNomenclature: 'A', valeurPrincipaleNombre: 4 };
  const c = { codePeriode: '2025T3', codeNomenclature: 'B', valeurPrincipaleNombre: 6 };
  assert.equal(pickLatestRow([a]), a);
  assert.equal(pickLatestRow([b, c]), null);
  const offres = [
    { codePeriode: '2026T2', codeNomenclature: 'PE', valeurPrincipaleNombre: 240 },
    { codePeriode: '2026T2', codeNomenclature: 'PE-CUMUL12MOIS', libNomenclature: 'Cumul 12 derniers mois', valeurPrincipaleNombre: 1010 },
    { codePeriode: '2026T2', codeNomenclature: 'TOFF', libNomenclature: 'Toutes offres', valeurPrincipaleNombre: 370 },
    { codePeriode: '2026T2', codeNomenclature: 'TOFF-CUMUL12MOIS', valeurPrincipaleNombre: 1720 },
  ];
  assert.equal(pickLatestRow(offres).codeNomenclature, 'TOFF');
  const tension = [
    { codePeriode: '2025', codeNomenclature: 'INT_EMB', valeurPrincipaleNombre: 5 },
    { codePeriode: '2025', codeNomenclature: 'PERSPECTIVE', libNomenclature: 'Indicateur principal tension', valeurPrincipaleNombre: 3 },
  ];
  assert.equal(pickLatestRow(tension).codeNomenclature, 'PERSPECTIVE');
  const salaire = readIndicateur({
    valeursParPeriode: [{
      codePeriode: '2022', libPeriode: 'ANNEE 2022', libActivite: 'Serveurs de cafés restaurants',
      salaireValeurMontant: [
        { codeNomenclature: 'SAL1', valeurPrincipaleMontant: 2032 },
        { codeNomenclature: 'SAL3', valeurPrincipaleMontant: 2045 },
      ],
    }],
  });
  assert.equal(salaire.codeNomenclature, 'SAL3');
  assert.equal(salaire.value.text, '2\u202f045\u00a0€');
  assert.equal(salaire.periode.label, 'année 2022');
  const total = { codePeriode: '2025T3', codeNomenclature: 'ABC', libNomenclature: 'Ensemble', valeurPrincipaleNombre: 10 };
  assert.equal(pickLatestRow([b, c, total]), total);
  assert.equal(readIndicateur({ listeValeursParPeriode: [b, c] }), null);
  const read = readIndicateur({
    libIndicateur: 'Demandeurs',
    listeValeursParPeriode: [{ codePeriode: '2025T3', libTerritoire: 'Rhône', valeurPrincipaleNombre: 12345 }],
  });
  assert.equal(read.value.text, '12\u202f345');
  assert.equal(read.periode.label, '3e trimestre 2025');
  assert.equal(read.libTerritoire, 'Rhône');
});

test('territoire et métier : correspondance documentée, pas de choix ambigu', () => {
  const types = [
    { codeTypeTerritoire: 'DEP', libelleTypeTerritoire: 'Département' },
    { codeTypeTerritoire: 'REG', libelleTypeTerritoire: 'Région' },
    { codeTypeTerritoire: 'COM', libelleTypeTerritoire: 'Commune' },
  ];
  assert.equal(matchTerritoryType(types, 'departement'), 'DEP');
  assert.equal(matchTerritoryType(types, 'commune'), 'COM');
  assert.equal(matchTerritoryType([], 'region'), 'REG');
  assert.equal(matchTerritoryType([], 'commune'), null);
  assert.deepEqual(resolveTerritory({ type: 'departement', dep: '69', code: '69' }, types), { codeTypeTerritoire: 'DEP', codeTerritoire: '69' });
  assert.equal(resolveTerritory({ type: 'commune', insee: '69123' }, []), null);
  assert.equal(pickFrance([{ libelleTerritoire: 'France métropolitaine', codeTerritoire: 'FM' }, { libelleTerritoire: 'France', codeTerritoire: 'FR' }]).codeTerritoire, 'FR');
  assert.equal(pickFrance([{ libelleTerritoire: 'Nouvelle-France', codeTerritoire: 'X' }, { libelleTerritoire: 'France entière hors X', codeTerritoire: 'Y' }]), null);
  const one = pickActivite([{ codeActivite: 'G1803', libelleActivite: 'Serveur / Serveuse en restauration' }], 'serveur');
  assert.equal(one.codeActivite, 'G1803');
  assert.equal(pickActivite([
    { codeActivite: 'G1801', libelleActivite: 'Serveur en café' },
    { codeActivite: 'G1803', libelleActivite: 'Serveur en restauration' },
  ], 'serveur'), null);
});

test('HTML : chiffres réels, source, période, échappement, rien si vide', () => {
  const html = marketFiguresHtml({
    activityLabel: 'Serveur <br>',
    territoryLabel: 'Rhône',
    figures: [{
      title: 'Demandeurs d’emploi',
      value: { text: '12\u202f345', kind: 'count' },
      periode: { label: '3e trimestre 2025', kind: 'quarter' },
      libNomenclature: 'Catégorie A',
      libTerritoire: 'Rhône',
    }],
  });
  assert.match(html, /id="marketFiguresTitle">Le marché en chiffres/);
  assert.match(html, /12\u202f345/);
  assert.match(html, /Source\u00a0: France Travail, données du 3e trimestre 2025\./);
  assert.match(html, /Catégorie A/);
  assert.ok(html.includes(DATA_EMPLOI_SOURCE_URL));
  assert.match(html, /Serveur &lt;br&gt;/);
  assert.doesNotMatch(html, /placeholder|à venir|N\/A|—/);
  assert.equal(marketFiguresHtml(null), '');
  assert.equal(marketFiguresHtml({ figures: [] }), '');
});

function tokenResponse(scope) {
  const asked = String(scope || '');
  if (asked.includes('offresetdemandesemploi')) {
    return json({ error: 'invalid_scope', error_description: 'Unknown/invalid scope(s)' }, 400);
  }
  return json({ access_token: 'offres', expires_in: 1499, token_type: 'Bearer' });
}

test('accès refusé : encart absent, pas d’exception, nouvel essai pas avant l’échéance', async () => {
  setEnv({ FT_CLIENT_ID: 'id-test', FT_CLIENT_SECRET: 'secret-test' });
  let calls = 0;
  global.fetch = async (url, opts) => {
    calls += 1;
    const scope = opts?.body?.get?.('scope') || '';
    assert.equal(scope, DATA_EMPLOI_SCOPE);
    assert.ok(!String(url).includes('secret'));
    return tokenResponse(scope);
  };
  const place = { type: 'departement', dep: '69', code: '69' };
  const job = { slug: 'serveur', q: 'serveur' };
  assert.equal(await loadMarketSnapshot(job, place, { now: NOW }), null);
  assert.equal(await dataEmploiEnabled({ now: NOW }), false);
  assert.equal(calls, 1);
  assert.equal(await loadMarketSnapshot(job, place, { now: NOW + 1000 }), null);
  assert.equal(calls, 1, 'le refus de scope reste en cache');
  assert.equal(await dataEmploiEnabled({ now: NOW + 2 * 60 * 60 * 1000 }), false);
  assert.equal(calls, 2);
  _resetDataEmploi();
  const h = await call(health);
  assert.equal(h.body.features.dataEmploi, false);
  assert.ok(!JSON.stringify(h.body).includes('secret-test'));
  assert.ok(!JSON.stringify(h.body).includes('id-test'));
});

test('panne et 500 : aucun chiffre, aucune exception', async () => {
  setEnv({ FT_CLIENT_ID: 'id-test', FT_CLIENT_SECRET: 'secret-test' });
  global.fetch = async () => { throw new Error('réseau coupé'); };
  assert.equal(await loadMarketSnapshot({ slug: 'serveur', q: 'serveur' }, { type: 'region', reg: '84', code: '84' }, { now: NOW }), null);
  _resetDataEmploi();
  global.fetch = async (url) => {
    if (String(url).includes('access_token')) return json({ access_token: 't', expires_in: 600 });
    return new Response('nope', { status: 500 });
  };
  assert.equal(await loadMarketSnapshot({ slug: 'serveur', q: 'serveur' }, { type: 'departement', dep: '33', code: '33' }, { now: NOW }), null);
  assert.equal(await dataEmploiEnabled({ now: NOW }), true, 'une erreur de donnée ne retire pas l’accès');
});

test('cache 24 h : le second affichage ne rappelle pas l’indicateur', async () => {
  setEnv({ FT_CLIENT_ID: 'id-test', FT_CLIENT_SECRET: 'secret-test' });
  let posts = 0;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('access_token')) return json({ access_token: 't', expires_in: 3600 });
    if (u.includes('/type-territoires')) return json({ typeTerritoires: [{ codeTypeTerritoire: 'DEP', libelleTypeTerritoire: 'Département' }] });
    if (u.includes('/type-activites')) return json({ typeActivites: [{ codeTypeActivite: 'ROME', libelleTypeActivite: 'ROME' }] });
    if (u.includes('/activites/')) return json({ activites: [{ codeActivite: 'G1803', codeTypeActivite: 'ROME', libelleActivite: 'Serveur / Serveuse' }] });
    if (u.includes('/details-indicateurs')) return json({ listeIndicateurs: [{ codeIndicateur: 'DE_1', listeTypesPeriodesIndicateur: [{ codeTypePeriode: 'TRIMESTRE' }], listeTypesNomenclaturesIndicateur: [{ codeTypeNomenclature: 'CATCAND' }] }] });
    if (u.includes('/stat-demandeurs') && opts?.method === 'POST') {
      posts += 1;
      const sent = JSON.parse(opts.body);
      assert.equal(sent.codeTypeTerritoire, 'DEP');
      assert.equal(sent.codeTerritoire, '69');
      assert.equal(sent.codeActivite, 'G1803');
      assert.equal(sent.codeTypePeriode, 'TRIMESTRE');
      assert.equal(sent.codeTypeNomenclature, 'CATCAND');
      assert.equal(sent.dernierePeriode, true);
      assert.equal(sent.sansCaracteristiques, true);
      return json({
        libIndicateur: 'Demandeurs',
        listeValeursParPeriode: [{ codePeriode: '2025T3', libTerritoire: 'Rhône', libNomenclature: 'Catégorie A', valeurPrincipaleNombre: 12345 }],
      });
    }
    return new Response('', { status: 404 });
  };
  const job = { slug: 'serveur', q: 'serveur' };
  const place = { type: 'departement', dep: '69', code: '69' };
  const first = await loadMarketSnapshot(job, place, { now: NOW });
  assert.equal(first.figures[0].value.text, '12\u202f345');
  assert.equal(posts, 1);
  const second = await loadMarketSnapshot(job, place, { now: NOW + 60 * 1000 });
  assert.equal(second.figures[0].value.text, '12\u202f345');
  assert.equal(posts, 1);
  const third = await loadMarketSnapshot(job, place, { now: NOW + CACHE_MS + 1 });
  assert.equal(third.figures[0].value.text, '12\u202f345');
  assert.equal(posts, 2);
});

test('page SEO : encart réel si l’API répond, masqué si le scope est refusé', async () => {
  setEnv({ FT_CLIENT_ID: 'id-test', FT_CLIENT_SECRET: 'secret-test', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' });
  const offer = { id: 'S1', intitule: 'Serveur H/F', entreprise: { nom: 'Brasserie' }, lieuTravail: { libelle: '69 - LYON' }, typeContrat: 'CDI', dateCreation: '2026-11-01T08:00:00.000Z', origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/x' }, description: 'Salle' };
  let denied = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('geo.api.gouv.fr')) throw new Error('offline');
    if (u.includes('access_token')) {
      const scope = opts?.body?.get?.('scope') || '';
      if (scope.includes('offresetdemandesemploi')) {
        if (denied) return tokenResponse(scope);
        return json({ access_token: 'marche', expires_in: 1500, scope });
      }
      return json({ access_token: 'offres', expires_in: 1500 });
    }
    if (u.includes('offres/search')) return json({ resultats: [offer] }, 200, { 'Content-Range': 'offres 0-0/8' });
    if (u.includes('/type-territoires')) return json({ typeTerritoires: [{ codeTypeTerritoire: 'DEP', libelleTypeTerritoire: 'Département' }] });
    if (u.includes('/type-activites')) return json({ typeActivites: [{ codeTypeActivite: 'ROME', libelleTypeActivite: 'ROME' }] });
    if (u.includes('/activites/')) return json({ activites: [{ codeActivite: 'G1803', codeTypeActivite: 'ROME', libelleActivite: 'Serveur / Serveuse en restauration' }] });
    if (u.includes('/details-indicateurs')) return json({ listeIndicateurs: [] });
    if (u.includes('/stat-offres')) {
      return json({ listeValeursParPeriode: [{ codePeriode: '2025T3', libTerritoire: 'Rhône', libActivite: 'Serveur / Serveuse en restauration', valeurPrincipaleNombre: 890 }] });
    }
    if (u.includes('salaire-rome-fap')) {
      return json({ listeValeursParPeriode: [{ codePeriode: '2025T3', libTerritoire: 'Rhône', valeurPrincipaleMontant: 1850 }] });
    }
    return new Response('', { status: 404 });
  };
  const page = () => new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { resolve(String(b ?? '')); } };
    seo({ method: 'GET', query: { kw: 'serveur', lieu: 'rhone' }, url: '/api/seo' }, res);
  });
  let html = await page();
  const start = html.indexOf('class="market-figures"');
  const sourceAt = html.indexOf('class="market-source"', start);
  const end = html.indexOf('</p></div>', sourceAt);
  assert.ok(start > 0 && sourceAt > start && end > sourceAt, 'encart présent');
  const fig = html.slice(start, end);
  assert.match(fig, /Le marché en chiffres/);
  assert.match(fig, /890/);
  assert.match(fig, /1\u202f850\u00a0€/);
  assert.match(fig, /données du 3e trimestre 2025/);
  assert.match(fig, /Serveur \/ Serveuse en restauration/);
  assert.ok(fig.includes(DATA_EMPLOI_SOURCE_URL));
  assert.doesNotMatch(fig, /placeholder|à venir|N\/A/);
  denied = true;
  _resetDataEmploi();
  _clearCache();
  html = await page();
  assert.doesNotMatch(html, /Le marché en chiffres/);
  assert.doesNotMatch(html, /1\u202f850/);
  assert.match(html, /Offres d’emploi de serveur/);
});
