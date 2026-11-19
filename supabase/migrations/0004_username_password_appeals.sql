-- MABA App Store — username/password login + appeals (0004)
-- Run in the Supabase SQL Editor AFTER 0003_account_ban.sql (or
-- `supabase db push`). Username/password login lets users log in
-- without a Gmail code every time, and appeals let a banned user ask
-- the owner to unblock their account from the store website.
--
-- Run ONCE. No backfill is needed (existing accounts simply have no
-- username/password until they set them, and no appeals exist yet).
-- The column adds are idempotent (IF NOT EXISTS) and the tables/indexes
-- use IF NOT EXISTS, so re-running this file is safe.

-- --------------------------------- username + password (profiles)
-- Username: 3-20 chars, letters/numbers/underscore only (enforced in the
-- API routes). Stored lowercase so login lookup is an exact match and the
-- unique index below (on lower(username)) can never have two spellings of
-- the same name. password_hash is a bcrypt hash (bcryptjs, server-side
-- only) — plaintext passwords are NEVER stored, and the hash is NEVER
-- returned by any API (routes strip it before responding).
alter table public.profiles
  add column if not exists username text;
alter table public.profiles
  add column if not exists password_hash text;
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

-- ------------------------------------------- password login attempts
-- Rate limit for username/password login (migration 0004): one row per
-- key — `user:<lowercase login>` for the account, `ip:<address>` for the
-- caller. 5 wrong attempts in 15 minutes locks that key; the window
-- restarts after 15 minutes. Rows are deleted on a successful login.
create table if not exists public.login_attempts (
  key text primary key,
  attempts int not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.login_attempts disable row level security;

-- ---------------------------------------------------------------- appeals
-- A banned user submits ONE pending appeal at a time from the store
-- (appeal form on the ban notice). The owner decides it from the review
-- website: approve = account unblocked, reject = ban stays.
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_note text
);
create index if not exists appeals_status_created_idx
  on public.appeals (status, created_at desc);
create index if not exists appeals_email_created_idx
  on public.appeals (email, created_at desc);
alter table public.appeals disable row level security;
