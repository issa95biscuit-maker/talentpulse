import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, ADZ_MAX_DAYS } from '../lib/jobs.js';

test('Adzuna : fenêtre de fraîcheur par défaut à 60 jours', () => {
  assert.equal(ADZ_MAX_DAYS, 60);
  assert.equal(_test.adzunaMaxDays(undefined), 60);
  assert.equal(_test.adzunaMaxDays(''), 60);
});

test('Adzuna : le filtre « publié depuis » plus court est respecté', () => {
  assert.equal(_test.adzunaMaxDays('1'), 1);
  assert.equal(_test.adzunaMaxDays('31'), 31);
  assert.equal(_test.adzunaMaxDays('999'), 60);
});

test('Adzuna : les annonces de plus de 60 jours sont retirées, les récentes et sans date gardées', () => {
  const now = Date.parse('2026-11-18T03:00:00Z');
  const jobs = [
    { id: 'adz_old', posted: '2025-09-25T03:26:01.000Z' },
    { id: 'adz_mars', posted: '2026-03-12T13:14:06.000Z' },
    { id: 'adz_limite', posted: '2026-09-20T03:00:00.000Z' },
    { id: 'adz_recent', posted: '2026-11-02T05:37:43.000Z' },
    { id: 'adz_sans_date' },
  ];
  assert.deepEqual(_test.freshAdzuna(jobs, now).map(j => j.id), ['adz_limite', 'adz_recent', 'adz_sans_date']);
});

test('Adzuna : mapAdzuna garde la date de création dans posted', () => {
  const j = _test.mapAdzuna({ id: 9, title: 'Serveur', created: '2026-11-02T05:37:43Z', redirect_url: 'https://www.adzuna.fr/9' });
  assert.equal(Date.parse(j.posted), Date.parse('2026-11-02T05:37:43Z'));
});
