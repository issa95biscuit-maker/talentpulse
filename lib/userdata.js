/** Requêtes sur les données d'un utilisateur (favoris, suivi, alertes, profil). */
import { db } from './db.js';
import { HttpError } from './http.js';

export const MAX_ALERTS = 20;

const favRow = r => ({ jobId: r.job_id, job: r.job || {}, createdAt: r.created_at });
const pipeRow = r => ({ jobId: r.job_id, status: r.status, position: r.position, notes: r.notes || '', job: r.job || {}, updatedAt: r.updated_at });
export const alertRow = r => ({ id: r.id, label: r.label, query: r.query || {}, channels: r.channels || [], whatsappTo: r.whatsapp_to || '', active: r.active, createdAt: r.created_at, lastRunAt: r.last_run_at, lastSentAt: r.last_sent_at });

export async function listFavorites(userId) {
  return (await db().query('select job_id, job, created_at from favorites where user_id = $1 order by created_at desc limit 1000', [userId])).map(favRow);
}
export async function upsertFavorite(userId, { jobId, job }) {
  const rows = await db().query(
    `insert into favorites (user_id, job_id, job) values ($1, $2, $3::jsonb)
     on conflict (user_id, job_id) do update set job = excluded.job
     returning job_id, job, created_at`, [userId, jobId, JSON.stringify(job || {})]);
  return favRow(rows[0]);
}
export async function deleteFavorite(userId, jobId) {
  const rows = await db().query('delete from favorites where user_id = $1 and job_id = $2 returning job_id', [userId, jobId]);
  return rows.length > 0;
}

export async function listPipeline(userId) {
  return (await db().query('select job_id, status, position, notes, job, updated_at from pipeline_items where user_id = $1 order by status, position, updated_at desc limit 1000', [userId])).map(pipeRow);
}
export async function upsertPipeline(userId, it) {
  const rows = await db().query(
    `insert into pipeline_items (user_id, job_id, status, position, notes, job) values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (user_id, job_id) do update set status = excluded.status, position = excluded.position,
       notes = excluded.notes, job = case when excluded.job = '{}'::jsonb then pipeline_items.job else excluded.job end, updated_at = now()
     returning job_id, status, position, notes, job, updated_at`,
    [userId, it.jobId, it.status, it.position || 0, it.notes || '', JSON.stringify(it.job || {})]);
  return pipeRow(rows[0]);
}
export async function deletePipeline(userId, jobId) {
  const rows = await db().query('delete from pipeline_items where user_id = $1 and job_id = $2 returning job_id', [userId, jobId]);
  return rows.length > 0;
}

// Création paresseuse de la table (idempotente, une fois par instance) : un déploiement ne casse jamais
// « Mon espace » si `npm run migrate` n'a pas encore été rejoué sur Neon. Même définition que db/schema.sql.
let appsReady = null;
export function ensureApplications() {
  appsReady ||= (async () => {
    await db().query(`create table if not exists applications (
      user_id uuid not null references users(id) on delete cascade, job_id text not null, job jsonb not null default '{}'::jsonb,
      name text not null default '', email text not null default '', phone text not null default '', letter text not null default '',
      cv_name text not null default '', cv_size integer not null default 0,
      channel text not null default 'package' check (channel in ('package', 'mailto', 'source', 'email')),
      status text not null default 'ready' check (status in ('ready', 'sent')),
      sent_to text, sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      primary key (user_id, job_id))`);
    await db().query(`insert into schema_migrations (version) values ('2026-10-12-applications') on conflict do nothing`);
  })().catch(e => { appsReady = null; throw e; });
  return appsReady;
}
export function _resetApplicationsReady() { appsReady = null; }

const appRow = r => ({ jobId: r.job_id, job: r.job || {}, name: r.name, email: r.email, phone: r.phone, letter: r.letter, cvName: r.cv_name, cvSize: r.cv_size, channel: r.channel, status: r.status, sentTo: r.sent_to || '', sentAt: r.sent_at, createdAt: r.created_at, updatedAt: r.updated_at });
const APP_COLS = 'job_id, job, name, email, phone, letter, cv_name, cv_size, channel, status, sent_to, sent_at, created_at, updated_at';
export async function listApplications(userId) {
  await ensureApplications();
  return (await db().query(`select ${APP_COLS} from applications where user_id = $1 order by updated_at desc limit 500`, [userId])).map(appRow);
}
export async function getApplication(userId, jobId) {
  await ensureApplications();
  const r = await db().query(`select ${APP_COLS} from applications where user_id = $1 and job_id = $2`, [userId, jobId]);
  return r[0] ? appRow(r[0]) : null;
}
/** Enregistre (ou met à jour) le dossier de candidature et place l'offre dans la colonne « J'ai postulé » du suivi.
 *  Une candidature déjà réellement envoyée garde son statut 'sent' (jamais rétrogradée, jamais forgée par le client). */
export async function upsertApplication(userId, a, { onConflict = 'update' } = {}) {
  await ensureApplications();
  const rows = await db().query(
    `insert into applications (user_id, job_id, job, name, email, phone, letter, cv_name, cv_size, channel)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, job_id) do ${onConflict === 'ignore' ? 'nothing' : `update set
       job = case when excluded.job = '{}'::jsonb then applications.job else excluded.job end,
       name = excluded.name, email = excluded.email, phone = excluded.phone, letter = excluded.letter,
       cv_name = excluded.cv_name, cv_size = excluded.cv_size,
       channel = case when applications.status = 'sent' then applications.channel else excluded.channel end,
       updated_at = now()`}
     returning ${APP_COLS}`,
    [userId, a.jobId, JSON.stringify(a.job || {}), a.name, a.email, a.phone || '', a.letter, a.cvName || '', a.cvSize || 0, a.channel || 'package']);
  await db().query(
    `insert into pipeline_items (user_id, job_id, status, position, job) values ($1, $2, 'applied', 0, $3::jsonb)
     on conflict (user_id, job_id) do update set status = case when pipeline_items.status in ('interview', 'offer', 'rejected') then pipeline_items.status else 'applied' end,
       job = case when excluded.job = '{}'::jsonb then pipeline_items.job else excluded.job end, updated_at = now()`,
    [userId, a.jobId, JSON.stringify(a.job || {})]);
  return rows[0] ? appRow(rows[0]) : null;
}
export async function markApplicationSent(userId, jobId, to) {
  await ensureApplications();
  const rows = await db().query(
    `update applications set status = 'sent', channel = 'email', sent_to = $3, sent_at = now(), updated_at = now()
      where user_id = $1 and job_id = $2 returning ${APP_COLS}`, [userId, jobId, to]);
  return rows[0] ? appRow(rows[0]) : null;
}
export async function deleteApplication(userId, jobId) {
  await ensureApplications();
  const rows = await db().query('delete from applications where user_id = $1 and job_id = $2 returning job_id', [userId, jobId]);
  return rows.length > 0;
}

export async function listAlerts(userId) {
  return (await db().query('select * from alerts where user_id = $1 order by created_at desc', [userId])).map(alertRow);
}
export async function createAlert(userId, a) {
  const rows = await db().query(
    `insert into alerts (user_id, label, query, channels, whatsapp_to, active)
     select $1, $2, $3::jsonb, $4::text[], nullif($5, ''), $6
      where (select count(*) from alerts where user_id = $1) < $7
     returning *`,
    [userId, a.label || [a.query.kw, a.query.city].filter(Boolean).join(' · '), JSON.stringify(a.query), a.channels, a.whatsappTo || '', a.active !== false, MAX_ALERTS]);
  if (!rows.length) throw new HttpError(409, `Vous avez atteint la limite de ${MAX_ALERTS} recherches enregistrées.`, 'limit_reached');
  return alertRow(rows[0]);
}
export async function updateAlert(userId, id, p) {
  const rows = await db().query(
    `update alerts set
        label = coalesce($3, label),
        channels = coalesce($4::text[], channels),
        whatsapp_to = case when $5::text is null then whatsapp_to else nullif($5, '') end,
        active = coalesce($6, active),
        updated_at = now()
      where user_id = $1 and id = $2 returning *`,
    [userId, id, p.label ?? null, p.channels ?? null, p.whatsappTo ?? null, p.active ?? null]);
  if (!rows.length) throw new HttpError(404, 'Recherche introuvable.', 'not_found');
  const a = alertRow(rows[0]);
  if (a.channels.includes('whatsapp') && !a.whatsappTo) throw new HttpError(400, 'Numéro WhatsApp requis pour ce canal.', 'validation_error');
  return a;
}
export async function deleteAlert(userId, id) {
  const rows = await db().query('delete from alerts where user_id = $1 and id = $2 returning id', [userId, id]);
  return rows.length > 0;
}

export async function updateProfile(userId, profile) {
  const rows = await db().query(
    `update users set profile = $2::jsonb, prenom = case when $3 <> '' then $3 else prenom end, updated_at = now()
      where id = $1 returning id, email, prenom, profile, created_at`, [userId, JSON.stringify(profile), profile.prenom || '']);
  return rows[0];
}

export async function allUserData(userId) {
  const [favorites, pipeline, alerts, applications] = await Promise.all([listFavorites(userId), listPipeline(userId), listAlerts(userId), listApplications(userId)]);
  return { favorites, pipeline, alerts, applications };
}

/** Fusion des données locales (localStorage) dans le compte, sans écraser ce qui existe déjà côté serveur. */
export async function mergeLocalData(userId, data) {
  if (data.favorites.length) {
    await db().query(
      `insert into favorites (user_id, job_id, job)
       select $1, x->>'jobId', coalesce(x->'job', '{}'::jsonb) from jsonb_array_elements($2::jsonb) x
       on conflict (user_id, job_id) do nothing`, [userId, JSON.stringify(data.favorites)]);
  }
  if (data.pipeline.length) {
    await db().query(
      `insert into pipeline_items (user_id, job_id, status, position, notes, job)
       select $1, x->>'jobId', x->>'status', coalesce((x->>'position')::int, 0), coalesce(x->>'notes', ''), coalesce(x->'job', '{}'::jsonb)
         from jsonb_array_elements($2::jsonb) x
       on conflict (user_id, job_id) do nothing`, [userId, JSON.stringify(data.pipeline)]);
  }
  if (data.alerts.length) {
    const existing = await listAlerts(userId);
    const key = q => [q.kw || '', q.city || '', q.contrat || ''].join('|').toLowerCase();
    const seen = new Set(existing.map(a => key(a.query)));
    for (const a of data.alerts) {
      if (seen.has(key(a.query)) || seen.size >= MAX_ALERTS) continue;
      seen.add(key(a.query));
      await createAlert(userId, a);
    }
  }
  for (const a of (data.applications || [])) await upsertApplication(userId, a, { onConflict: 'ignore' });
  let user = null;
  if (data.profile) {
    const cur = (await db().query('select profile from users where id = $1', [userId]))[0]?.profile || {};
    const merged = { ...data.profile };
    for (const [k, v] of Object.entries(cur)) if (v) merged[k] = v; // le profil serveur a priorité
    user = await updateProfile(userId, merged);
  }
  return { ...(await allUserData(userId)), user };
}
