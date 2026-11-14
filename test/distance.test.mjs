// Post-filtre de distance réelle (haversine) et égalité de commune.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, validPoint, cityStem, communeKeyset, matchesCommune, hasLocationHint,
  jobCoords, stripJobGeo, adjustTotals, filterByDistance, pointFromGeoCommune,
} from '../lib/distance.js';

const RUEIL = { lat: 48.8717, lon: 2.1806, insee: '92063', label: 'Rueil-Malmaison', type: 'commune' };
// Centres officiels geo.api.gouv.fr (14/11/2026)
const C = {
  rueil:      { lat: 48.8717, lon: 2.1806 },
  boulogne:   { lat: 48.8375, lon: 2.2429 }, // 5,94 km
  courbevoie: { lat: 48.8976, lon: 2.2574 }, // 6,31 km
  nanterre:   { lat: 48.8974, lon: 2.2018 }, // 3,25 km
  puteaux:    { lat: 48.8824, lon: 2.2384 }, // 4,39 km
  montesson:  { lat: 48.9190, lon: 2.1381 }, // 6,11 km
  clamart:    { lat: 48.7957, lon: 2.2518 }, // 9,93 km
};

const job = (over) => ({ id: 'ft_x', source: 'France Travail', title: 'Poste', city: 'Rueil-Malmaison', ...over });

test('haversine : distances réelles autour de Rueil-Malmaison', () => {
  const d = (p) => haversineKm(C.rueil.lat, C.rueil.lon, p.lat, p.lon);
  assert.ok(Math.abs(d(C.boulogne) - 5.94) < 0.05, 'Boulogne ≈ 5,94 km : ' + d(C.boulogne));
  assert.ok(Math.abs(d(C.courbevoie) - 6.31) < 0.05, 'Courbevoie ≈ 6,31 km : ' + d(C.courbevoie));
  assert.ok(Math.abs(d(C.nanterre) - 3.25) < 0.05, 'Nanterre ≈ 3,25 km');
  assert.ok(d(C.puteaux) < 5 && d(C.montesson) > 5);
  assert.equal(validPoint(0, 0), null);
  assert.equal(validPoint('abc', 2), null);
  assert.deepEqual(validPoint('48.87', '2.18'), { lat: 48.87, lon: 2.18 });
  const geo = { centre: { type: 'Point', coordinates: [2.1806, 48.8717] } };
  assert.deepEqual(pointFromGeoCommune(geo), C.rueil);
});

test('ville exacte : même commune, arrondissements inclus, suffixes ignorés', () => {
  const rueil = communeKeyset({ ...RUEIL, distance: 0 });
  assert.ok(matchesCommune(job({ city: 'Rueil-Malmaison' }), rueil));
  assert.ok(matchesCommune(job({ city: 'Rueil Malmaison - Télétravail Possible' }), rueil));
  assert.ok(matchesCommune(job({ _insee: '92063', city: 'Rueil' }), rueil));
  assert.ok(matchesCommune(job({ postalCode: '92500', city: 'Rueil-Malmaison', ...{ /* postals */ } }), { ...rueil, postals: new Set(['92500']) }));
  assert.ok(!matchesCommune(job({ city: 'Boulogne-Billancourt' }), rueil));
  assert.ok(!matchesCommune(job({ city: 'Nanterre', _insee: '92050' }), rueil));

  const paris = communeKeyset({ type: 'commune', insee: '75056', label: 'Paris', distance: 0 });
  assert.ok(matchesCommune(job({ city: 'Paris' }), paris));
  assert.ok(matchesCommune(job({ city: 'Paris 15e' }), paris));
  assert.ok(matchesCommune(job({ city: 'Paris 15', _insee: '75115' }), paris));
  assert.ok(!matchesCommune(job({ city: 'Boulogne-Billancourt' }), paris));

  const p15 = communeKeyset({ type: 'commune', insee: '75115', label: 'Paris 15e', display: 'Paris 15e', arrondissement: true, distance: 0 });
  assert.ok(matchesCommune(job({ city: 'Paris 15e' }), p15));
  assert.ok(matchesCommune(job({ _insee: '75115', city: 'Paris' }), p15));
  assert.ok(!matchesCommune(job({ city: 'Paris 1er', _insee: '75101' }), p15), 'ville exacte d’un arrondissement : pas tout Paris');

  assert.equal(cityStem('Rueil Malmaison - Télétravail Possible'), 'Rueil Malmaison');
  assert.equal(hasLocationHint(job({ city: 'France' })), false);
  assert.equal(hasLocationHint(job({ city: '' })), false);
  assert.equal(hasLocationHint(job({ city: 'Boulogne-Billancourt' })), true);
});

test('filtre 5 km : exclut Boulogne et Courbevoie, garde Nanterre, conserve les offres sans lieu', async () => {
  const loc = { ...RUEIL, distance: 5 };
  const jobs = [
    job({ id: 'ft_rueil', city: 'Rueil-Malmaison', _lat: C.rueil.lat, _lon: C.rueil.lon }),
    job({ id: 'ft_nanterre', city: 'Nanterre', _lat: C.nanterre.lat, _lon: C.nanterre.lon }),
    job({ id: 'ft_boulogne', city: 'Boulogne-Billancourt', _lat: C.boulogne.lat, _lon: C.boulogne.lon }),
    job({ id: 'adz_courbevoie', source: 'Adzuna', city: 'Courbevoie', _lat: C.courbevoie.lat, _lon: C.courbevoie.lon }),
    job({ id: 'ft_puteaux', city: 'Puteaux', _lat: C.puteaux.lat, _lon: C.puteaux.lon }),
    job({ id: 'ft_montesson', city: 'Montesson', _lat: C.montesson.lat, _lon: C.montesson.lon }),
    job({ id: 'ft_inconnu', city: '', _lat: undefined, _lon: undefined }), // pas de lieu : on garde
  ];
  const { kept, dropped } = await filterByDistance(jobs, loc, {});
  const ids = kept.map(j => j.id).sort();
  assert.deepEqual(ids, ['ft_inconnu', 'ft_nanterre', 'ft_puteaux', 'ft_rueil'].sort());
  assert.deepEqual(dropped.map(j => j.id).sort(), ['adz_courbevoie', 'ft_boulogne', 'ft_montesson'].sort());
  assert.ok(kept.every(j => j._lat == null || jobCoords(j)), 'les offres gardées avec point ont des coordonnées valides');
});

test('ville exacte : exclut une autre commune même sans coordonnées, garde une offre sans aucun lieu', async () => {
  const loc = { ...RUEIL, distance: 0 };
  const jobs = [
    job({ id: 'ok', city: 'Rueil-Malmaison' }),
    job({ id: 'tele', city: 'Rueil Malmaison - Télétravail Possible' }),
    job({ id: 'out', city: 'Boulogne-Billancourt' }),
    job({ id: 'none', city: '' }),
  ];
  const { kept, dropped } = await filterByDistance(jobs, loc, {});
  assert.deepEqual(kept.map(j => j.id).sort(), ['none', 'ok', 'tele']);
  assert.deepEqual(dropped.map(j => j.id), ['out']);
});

test('contrat de réponse : champs internes retirés, totaux cohérents avec la page', () => {
  const raw = job({ id: 'ft_1', _lat: 48.87, _lon: 2.18, _insee: '92063', title: 'X' });
  const pub = stripJobGeo(raw);
  assert.equal(pub.id, 'ft_1');
  assert.equal(pub.title, 'X');
  assert.ok(!('_lat' in pub) && !('_lon' in pub) && !('_insee' in pub));

  // Page complète (total source = nombre d’offres de la page) : total = effectif filtré
  assert.deepEqual(adjustTotals({ ft: 5, adzuna: 2 }, { droppedByKey: { ft: 2, adzuna: 0 }, fetchedByKey: { ft: 5, adzuna: 2 } }), { ft: 3, adzuna: 2 });
  // Pages suivantes possibles : on retranche seulement les exclus connus
  assert.deepEqual(adjustTotals({ ft: 80, adzuna: 40 }, { droppedByKey: { ft: 3 }, fetchedByKey: { ft: 30, adzuna: 20 } }), { ft: 77, adzuna: 40 });
});
