import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, call, setEnv, ENV_BASE } from './helpers.mjs';
import auth from '../api/auth/[action].js';
import me from '../api/me/[resource].js';

let cookie, pg;
const M = (resource, opts = {}) => call(me, { cookies: cookie, ...opts, query: { resource, ...(opts.query || {}) } });
beforeEach(async () => {
  setEnv(ENV_BASE); pg = await freshDb();
  const r = await call(auth, { method: 'POST', query: { action: 'register' }, body: { email: 'lea@example.fr', password: 'un-mot-de-passe-long', prenom: 'Léa', consent: true } });
  cookie = r.cookie.pair;
});

test('non connecté : 401 sur toutes les ressources', async () => {
  for (const r of ['favorites', 'pipeline', 'alerts', 'profile', 'export']) assert.equal((await call(me, { query: { resource: r } })).status, 401, r);
});

test('favoris : ajout idempotent, liste, suppression, validation', async () => {
  const job = { title: 'Serveur H/F', company: 'Brasserie X', city: 'Lyon 03', url: 'https://candidat.francetravail.fr/offres/recherche/detail/123ABC', extra: 'ignoré' };
  assert.equal((await M('favorites', { method: 'POST', body: { jobId: 'ft_123ABC', job } })).status, 200);
  await M('favorites', { method: 'POST', body: { jobId: 'ft_123ABC', job: { ...job, title: 'Serveur (maj)' } } });
  let l = await M('favorites');
  assert.equal(l.body.favorites.length, 1); assert.equal(l.body.favorites[0].job.title, 'Serveur (maj)'); assert.equal(l.body.favorites[0].job.extra, undefined);
  assert.equal((await M('favorites', { method: 'POST', body: { jobId: '../etc', job } })).status, 400);
  assert.equal((await M('favorites', { method: 'POST', body: { jobId: 'ft_1', job: { url: 'javascript:alert(1)' } } })).status, 400, 'URL javascript: refusée');
  assert.equal((await M('favorites', { method: 'DELETE', query: { jobId: 'ft_123ABC' } })).body.deleted, true);
  l = await M('favorites'); assert.equal(l.body.favorites.length, 0);
});

test('suivi (Kanban) : ajout, déplacement de colonne, statut invalide, suppression', async () => {
  const put = (status, position = 0) => M('pipeline', { method: 'PUT', body: { jobId: 'adz_42', status, position, job: { title: 'Dev', company: 'ACME' } } });
  assert.equal((await put('todo')).body.item.status, 'todo');
  const moved = await call(me, { cookies: cookie, method: 'PUT', query: { resource: 'pipeline' }, body: { jobId: 'adz_42', status: 'interview', position: 2 } });
  assert.equal(moved.body.item.status, 'interview'); assert.equal(moved.body.item.job.title, 'Dev', 'instantané conservé si non renvoyé');
  assert.equal((await put('pas-un-statut')).status, 400);
  assert.equal((await M('pipeline')).body.pipeline.length, 1);
  assert.equal((await M('pipeline', { method: 'DELETE', query: { jobId: 'adz_42' } })).body.deleted, true);
});

test('alertes : création, canal WhatsApp exige un numéro E.164, modification, limite, suppression', async () => {
  const c = await M('alerts', { method: 'POST', body: { query: { kw: 'serveur', city: 'Lyon', contrat: 'CDI' }, channels: ['email', 'email'] } });
  assert.equal(c.status, 201); assert.deepEqual(c.body.alert.channels, ['email']); assert.equal(c.body.alert.label, 'serveur · Lyon');
  assert.deepEqual(c.body.delivery, { email: false, whatsapp: false }, 'envoi non configuré : le front affiche « Bientôt »');
  assert.equal((await M('alerts', { method: 'POST', body: { query: {} } })).status, 400, 'mot-clé ou lieu requis');
  assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'x' }, channels: ['whatsapp'] } })).status, 400);
  assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'x' }, channels: ['whatsapp'], whatsappTo: '0612345678' } })).status, 400);
  assert.equal((await M('alerts', { method: 'POST', body: { query: { kw: 'x' }, channels: ['whatsapp'], whatsappTo: '+33612345678' } })).status, 201);
  const id = c.body.alert.id;
  const p = await M('alerts', { method: 'PATCH', query: { id }, body: { active: false, label: 'Serveur Lyon' } });
  assert.equal(p.body.alert.active, false); assert.equal(p.body.alert.label, 'Serveur Lyon'); assert.deepEqual(p.body.alert.channels, ['email']);
  assert.equal((await M('alerts', { method: 'PATCH', query: { id: 'pas-un-uuid' }, body: {} })).status, 400);
  assert.equal((await M('alerts', { method: 'PATCH', query: { id: '00000000-0000-4000-8000-000000000000' }, body: { active: true } })).status, 404);
  for (let i = 0; i < 18; i++) await M('alerts', { method: 'POST', body: { query: { kw: 'metier' + i } } });
  const over = await M('alerts', { method: 'POST', body: { query: { kw: 'de trop' } } });
  assert.equal(over.status, 409); assert.equal(over.body.error.code, 'limit_reached');
  assert.equal((await M('alerts', { method: 'DELETE', query: { id } })).body.deleted, true);
});

test('isolation : un utilisateur ne voit ni ne modifie les données d’un autre', async () => {
  const a = await M('alerts', { method: 'POST', body: { query: { kw: 'secret' } } });
  await M('favorites', { method: 'POST', body: { jobId: 'ft_1', job: {} } });
  const other = (await call(auth, { method: 'POST', query: { action: 'register' }, body: { email: 'bob@example.fr', password: 'autre-mot-de-passe', consent: true } })).cookie.pair;
  assert.equal((await call(me, { cookies: other, query: { resource: 'favorites' } })).body.favorites.length, 0);
  assert.equal((await call(me, { cookies: other, query: { resource: 'alerts' } })).body.alerts.length, 0);
  assert.equal((await call(me, { cookies: other, method: 'DELETE', query: { resource: 'alerts', id: a.body.alert.id } })).body.deleted, false);
  assert.equal((await call(me, { cookies: other, method: 'PATCH', query: { resource: 'alerts', id: a.body.alert.id }, body: { active: false } })).status, 404);
});

test('sync : fusion des données locales au premier login, sans écraser ni dupliquer', async () => {
  await M('favorites', { method: 'POST', body: { jobId: 'ft_1', job: { title: 'Déjà en ligne' } } });
  await M('alerts', { method: 'POST', body: { query: { kw: 'serveur', city: 'Lyon' } } });
  await M('profile', { method: 'PUT', body: { title: 'Serveuse', city: 'Lyon' } });
  const local = {
    favorites: [{ jobId: 'ft_1', job: { title: 'Version locale' } }, { jobId: 'adz_2', job: { title: 'Nouveau' } }],
    pipeline: [{ jobId: 'ft_1', status: 'applied', job: { title: 'X' } }],
    alerts: [{ query: { kw: 'Serveur', city: 'lyon' } }, { query: { kw: 'barman' } }],
    profile: { prenom: 'Léa', title: 'Autre titre', skills: 'Service, Accueil' },
  };
  const r = await M('sync', { method: 'POST', body: local });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.favorites.length, 2);
  assert.equal(r.body.favorites.find(f => f.jobId === 'ft_1').job.title, 'Déjà en ligne');
  assert.equal(r.body.pipeline.length, 1);
  assert.deepEqual(r.body.alerts.map(a => a.query.kw).sort(), ['barman', 'serveur']);
  assert.equal(r.body.user.profile.title, 'Serveuse', 'le profil serveur garde la priorité');
  assert.equal(r.body.user.profile.skills, 'Service, Accueil', 'les champs vides côté serveur sont complétés');
  const again = await M('sync', { method: 'POST', body: local });
  assert.equal(again.body.favorites.length, 2); assert.equal(again.body.alerts.length, 2, 'idempotent');
});

test('export RGPD : toutes les données en JSON téléchargeable', async () => {
  await M('favorites', { method: 'POST', body: { jobId: 'ft_9', job: { title: 'A' } } });
  const r = await M('export');
  assert.equal(r.status, 200); assert.match(r.headers['content-disposition'], /attachment/);
  assert.equal(r.body.user.email, 'lea@example.fr'); assert.equal(r.body.favorites.length, 1);
  assert.ok(!JSON.stringify(r.body).includes('argon2'), 'pas d’empreinte de mot de passe dans l’export');
});
