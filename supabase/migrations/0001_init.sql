-- MABA App Store — initial schema (0001_init.sql)
-- Run in the Supabase SQL Editor (or `supabase db push`).
-- Idempotent-ish: safe to re-run (IF NOT EXISTS / ON CONFLICT guards).
--
-- ACCESS MODEL: Row Level Security is explicitly OFF on every table. All
-- database access goes through the Next.js route handlers using the
-- service-role client (server-side only). The anon key is never used for
-- writes, and public reads go through GET /api/apps, which runs server-side.
-- The service-role key bypasses RLS anyway, so enabling RLS here would only
-- add confusion. Keep SUPABASE_SERVICE_ROLE_KEY server-side only.
--
-- STORAGE BUCKETS (created below, or from the Supabase dashboard):
--   apks    — PRIVATE. APK files. Downloads go through
--             GET /api/apps/[id]/download, which mints a 1-hour signed URL.
--   icons   — PUBLIC. App icons, served by direct public URL.
--   avatars — PUBLIC. Profile photos, served by direct public URL.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  place text,
  purpose text check (purpose in ('download', 'upload', 'both')),
  language text default 'Roman Urdu',
  avatar_url text,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
alter table public.profiles disable row level security;

-- ------------------------------------------------------- verification_codes
-- One row per code request. Only the SHA-256 hash of the code is stored,
-- never the plaintext code. Codes expire after 10 minutes (enforced in the
-- API routes); expired rows are cleaned up when a new code is requested.
create table if not exists public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists verification_codes_email_created_idx
  on public.verification_codes (email, created_at desc);
alter table public.verification_codes disable row level security;

-- ------------------------------------------------------------ burned_emails
-- Emails that permanently logged out. Once here, the email can NEVER
-- register again (assertEmailUsable checks this table first).
create table if not exists public.burned_emails (
  email text primary key,
  burned_at timestamptz not null default now(),
  reason text
);
alter table public.burned_emails disable row level security;

-- --------------------------------------------------------------------- apps
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  developer text,
  version text,
  category text,
  description text,
  icon_url text,
  apk_url text,
  apk_size bigint,
  downloads int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitter_email text,
  proof_email text,
  proof_phone text,
  rejection_note text,
  created_at timestamptz not null default now()
);
create index if not exists apps_status_created_idx
  on public.apps (status, created_at desc);
create index if not exists apps_downloads_idx
  on public.apps (downloads desc);
create index if not exists apps_submitter_idx
  on public.apps (submitter_email);
alter table public.apps disable row level security;

-- ----------------------------------------------------------------- sessions
-- One row per login. Only the SHA-256 hash of the session token is stored;
-- the raw token lives only in the httpOnly `maba_session` cookie.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_token_hash_idx
  on public.sessions (token_hash);
create index if not exists sessions_email_idx
  on public.sessions (email);
alter table public.sessions disable row level security;

-- ------------------------------------------------------------------ buckets
insert into storage.buckets (id, name, public)
values
  ('apks', 'apks', false),
  ('icons', 'icons', true),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;
