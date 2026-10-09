-- TalentPulse — schéma PostgreSQL (Neon). Idempotent : peut être rejoué sans risque.
-- Appliquer avec : DATABASE_URL=... npm run migrate

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Comptes. L'email est stocké en minuscules ; le mot de passe n'est jamais stocké, seulement son empreinte argon2id.
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  prenom        text not null default '',
  profile       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists users_email_key on users (lower(email));

-- Sessions : on ne stocke que l'empreinte SHA-256 du jeton (le jeton lui-même n'existe que dans le cookie httpOnly).
create table if not exists sessions (
  id         text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text not null default ''
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Favoris : instantané minimal de l'offre (titre, entreprise, ville, URL…) pour l'afficher même si elle a expiré.
create table if not exists favorites (
  user_id    uuid not null references users(id) on delete cascade,
  job_id     text not null,
  job        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- Suivi de candidatures (Kanban).
create table if not exists pipeline_items (
  user_id    uuid not null references users(id) on delete cascade,
  job_id     text not null,
  status     text not null check (status in ('todo', 'applied', 'interview', 'offer', 'rejected')),
  position   integer not null default 0,
  job        jsonb not null default '{}'::jsonb,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- Recherches enregistrées / alertes. channels vide = simple recherche enregistrée (aucun envoi).
create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  label        text not null default '',
  query        jsonb not null,
  channels     text[] not null default '{}',
  whatsapp_to  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_run_at  timestamptz,
  last_sent_at timestamptz
);
create index if not exists alerts_user_idx on alerts (user_id);
create index if not exists alerts_due_idx on alerts (last_run_at) where active;

-- Offres déjà envoyées pour une alerte (évite les doublons d'un jour à l'autre).
create table if not exists alert_deliveries (
  alert_id uuid not null references alerts(id) on delete cascade,
  job_id   text not null,
  channel  text not null check (channel in ('email', 'whatsapp')),
  sent_at  timestamptz not null default now(),
  primary key (alert_id, job_id, channel)
);

-- Limitation de débit (fenêtres fixes). La clé est une empreinte, jamais une IP en clair.
create table if not exists rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);

insert into schema_migrations (version) values ('2026-10-03-init') on conflict do nothing;
