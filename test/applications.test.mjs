// Sprint 8 : candidature dans TalentPulse (dossier enregistré + suivi) et envoi réel au recruteur (Resend simulé).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ENV_BASE, setEnv, freshDb, call } from './helpers.mjs';
import auth from '../api/auth/[action].js';
import me from '../api/me/[resource].js';
import candidature from '../api/candidature.js';
import { features } from '../lib/env.js';
import { _test } from '../lib/jobs.js';

const SEND_ENV = { ...ENV_BASE, RESEND_API_KEY: 're_test', APPLY_FROM_EMAIL: 'TalentPulse <candidatures@talentpulse.test>', FT_CLIENT_ID: 'id', FT_CLIENT_SECRET: 'secret' };
const LETTER = 'Madame, Monsieur, votre offre de serveur a retenu toute mon attention car je travaille en salle depuis trois ans.';
const PDF = Buffer.from('%PDF-1.4\n% faux CV de test\n%%EOF').toString('base64');
let pg, mails, offerContact, cookie;

const ftOffer = () => ({ id: '215ABC', intitule: 'SERVEUR (H/F)', entreprise: { nom: 'BRASSERIE DU PORT' }, lieuTravail: { libelle: '69 - LYON 03' }, typeContrat: 'CDI', description: 'Service en salle.', contact: offerContact });
beforeEach(async () => {
  setEnv(SEND_ENV);
  pg = await freshDb();
  mails = [];
  offerContact = { nom: 'BRASSERIE DU PORT - Mme Martin', courriel: 'recrutement@brasserie-du-port.fr' };
  global.fetch = async (url, o) => {
    const u = String(url);
    if (u.includes('api.resend.com')) { mails.push(JSON.parse(o.body)); return new Response('{"id":"em_1"}', { status: 200 }); }
    if (u.includes('access_token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 600 }), { status: 200 });
    if (u.includes('/offres/215ABC')) return new Response(JSON.stringify(ftOffer()), { status: 200 });
    throw new Error('réseau inattendu ' + u);
  };
  const r = await call(auth, { method: 'POST', query: { action: 'register' }, body: { email: 'lea@example.fr', password: 'un-mot-de-passe-long', prenom: 'Léa', consent: true } });
  cookie = r.cookie.pair;
  mails = []; // e-mail de vérification ignoré
});
const app = (over = {}) => ({ jobId: 'ft_215ABC', job: { title: 'Serveur', company: 'Brasserie du Port', url: 'https://candidat.francetravail.fr/offres/recherche/detail/215ABC' }, name: 'Léa Durand', email: 'lea@example.fr', phone: '06 12 34 56 78', letter: LETTER, cvName: 'cv-lea.pdf', cvSize: 1200, consent: true, ...over });
const save = (body, c = cookie) => call(me, { method: 'POST', query: { resource: 'applications' }, body, cookies: c });
const send = (body, c = cookie) => call(candidature, { method: 'POST', body: { jobId: 'ft_215ABC', name: 'Léa Durand', phone: '', letter: LETTER, cv: { name: 'cv-lea.pdf', type: 'application/pdf', data: PDF }, consent: true, ...body }, cookies: c });
const verify = () => pg.query("update users set email_verified_at = now() where email = 'lea@example.fr'");

test('extractApply : e-mail dans une phrase, lien de candidature, adresse France Travail ignorée', () => {
  assert.deepEqual(_test.extractApply({ courriel: 'Pour postuler, envoyez votre CV à RH.Lyon@Exemple.fr.' }).applyEmail, 'rh.lyon@exemple.fr');
  const l = _test.extractApply({ courriel: 'Pour postuler, utiliser le lien suivant : https://jobs.exemple.fr/apply/42' });
  assert.equal(l.applyEmail, ''); assert.equal(l.applyUrl, 'https://jobs.exemple.fr/apply/42');
  assert.equal(_test.extractApply({ urlPostulation: 'https://ats.exemple.com/x?id=1' }).applyUrl, 'https://ats.exemple.com/x?id=1');
  assert.equal(_test.extractApply({ courriel: 'ape.12345@francetravail.fr' }).applyEmail, '');
  assert.equal(_test.extractApply(undefined).applyEmail, '');
  assert.equal(_test.mapFT(ftOffer()).applyEmail, 'recrutement@brasserie-du-port.fr');
});

test('enregistrer une candidature : dossier stocké, suivi « J’ai postulé », jamais « envoyée » par le client', async () => {
  const r = await save(app({ status: 'sent', channel: 'source' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.application.status, 'ready'); assert.equal(r.body.application.channel, 'source'); assert.equal(r.body.application.sentTo, '');
  const pipe = await call(me, { query: { resource: 'pipeline' }, cookies: cookie });
  assert.equal(pipe.body.pipeline[0].status, 'applied'); assert.equal(pipe.body.pipeline[0].job.title, 'Serveur');
  // mise à jour idempotente + un entretien en cours n'est pas rétrogradé
  await pg.query("update pipeline_items set status = 'interview'");
  await save(app({ letter: LETTER + ' Disponible immédiatement.' }));
  const list = await call(me, { query: { resource: 'applications' }, cookies: cookie });
  assert.equal(list.body.applications.length, 1); assert.match(list.body.applications[0].letter, /immédiatement/);
  assert.equal(list.body.delivery.email, true);
  assert.equal((await call(me, { query: { resource: 'pipeline' }, cookies: cookie })).body.pipeline[0].status, 'interview');
  // validation
  assert.equal((await save(app({ consent: false }))).status, 400);
  assert.equal((await save(app({ letter: 'trop court' }))).status, 400);
  assert.equal((await save(app({ email: 'pas-un-email' }))).status, 400);
  assert.equal((await save(app({ phone: '<script>' }))).status, 400);
  assert.equal((await call(me, { method: 'POST', query: { resource: 'applications' }, body: app() })).status, 401, 'connexion requise');
  // export RGPD + suppression
  assert.equal((await call(me, { query: { resource: 'export' }, cookies: cookie })).body.applications.length, 1);
  assert.equal((await call(me, { method: 'DELETE', query: { resource: 'applications', jobId: 'ft_215ABC' }, cookies: cookie })).body.deleted, true);
});

test('synchronisation à la connexion : les candidatures locales rejoignent le compte sans écraser', async () => {
  await save(app({ letter: LETTER + ' (version serveur)' }));
  const r = await call(me, { method: 'POST', query: { resource: 'sync' }, cookies: cookie, body: { applications: [app({ letter: LETTER + ' (version locale)' }), app({ jobId: 'adz_99', job: { title: 'Barman' } })] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const byId = Object.fromEntries(r.body.applications.map(a => [a.jobId, a]));
  assert.match(byId.ft_215ABC.letter, /version serveur/); assert.ok(byId.adz_99);
  assert.ok(r.body.pipeline.some(p => p.jobId === 'adz_99' && p.status === 'applied'));
});

test('envoi réel : destinataire lu dans l’offre côté serveur, CV joint, réponse au candidat, statut « envoyée »', async () => {
  await save(app()); await verify();
  const r = await send({ to: 'pirate@evil.test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.sentTo, 'recrutement@brasserie-du-port.fr'); assert.equal(r.body.application.status, 'sent');
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.deepEqual(m.to, ['recrutement@brasserie-du-port.fr']);
  assert.equal(m.reply_to, 'lea@example.fr'); assert.deepEqual(m.bcc, ['lea@example.fr']);
  assert.equal(m.from, '"Léa Durand via TalentPulse" <candidatures@talentpulse.test>');
  assert.match(m.subject, /Candidature : Serveur/); assert.ok(m.text.includes(LETTER));
  assert.equal(m.attachments[0].filename, 'cv-lea.pdf'); assert.equal(m.attachments[0].content, PDF);
  assert.equal((await send()).status, 409, 'pas de double envoi');
  // re-sauvegarde : reste « envoyée »
  assert.equal((await save(app())).body.application.status, 'sent');
});

test('envoi réel : refus honnêtes (désactivé, non vérifié, non enregistré, sans e-mail, faux PDF, échec Resend)', async () => {
  await save(app());
  assert.equal((await send()).status, 403, 'adresse non confirmée');
  await verify();
  assert.equal((await send({ cv: { name: 'cv.pdf', type: 'application/pdf', data: Buffer.from('pas un pdf').toString('base64') } })).status, 400);
  assert.equal((await send({ cv: { name: 'cv.exe', type: 'application/pdf', data: PDF } })).status, 400);
  assert.equal((await send({ jobId: 'adz_42' })).status, 400, 'Adzuna : pas d’envoi direct');
  offerContact = { courriel: 'Pour postuler, utiliser le lien suivant : https://jobs.exemple.fr/1' };
  const noMail = await send();
  assert.equal(noMail.status, 409); assert.equal(noMail.body.error.code, 'no_apply_email');
  offerContact = { courriel: 'recrutement@brasserie-du-port.fr' };
  const realFetch = global.fetch;
  global.fetch = async (url, o) => String(url).includes('api.resend.com') ? new Response('domain not verified', { status: 403 }) : realFetch(url, o);
  const fail = await send();
  assert.equal(fail.status, 502); assert.match(fail.body.error.message, /rien n’a été transmis/);
  global.fetch = realFetch;
  assert.equal((await call(me, { query: { resource: 'applications' }, cookies: cookie })).body.applications[0].status, 'ready', 'échec → jamais « envoyée »');
  assert.equal(mails.length, 0);
  setEnv({ ...SEND_ENV, APPLY_FROM_EMAIL: '' });
  assert.equal(features().applyEmail, false);
  assert.equal((await send()).status, 503);
});

test('envoi réel : 10 envois par jour maximum par compte', async () => {
  await verify();
  for (let i = 0; i < 10; i++) {
    await pg.query("delete from applications"); await save(app());
    assert.equal((await send()).status, 200, 'envoi ' + (i + 1));
  }
  await pg.query("delete from applications"); await save(app());
  assert.equal((await send()).status, 429);
});

test('base pas encore migrée : la table applications est créée à la volée (Mon espace ne casse pas)', async () => {
  const { _resetApplicationsReady } = await import('../lib/userdata.js');
  await pg.query('drop table applications');
  _resetApplicationsReady();
  const r = await call(me, { query: { resource: 'applications' }, cookies: cookie });
  assert.equal(r.status, 200); assert.deepEqual(r.body.applications, []);
  assert.equal((await save(app())).status, 200);
});
