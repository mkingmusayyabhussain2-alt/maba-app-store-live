-- MABA App Store — account review (0002_account_review.sql)
-- Run in the Supabase SQL Editor AFTER 0001_init.sql (or `supabase db push`).
-- Adds review status to profiles so new accounts stay 'pending' until the
-- owner approves them (from the review website or /admin).
--
-- ONE-TIME BACKFILL: the UPDATE below approves every profile that already
-- exists when this migration runs, because those accounts predate review.
-- Run this migration ONCE. Do NOT re-run the UPDATE afterwards — new
-- 'pending' accounts created after this migration must stay pending until
-- the owner reviews them.
-- The column/index additions themselves are safe to re-run (IF NOT EXISTS).

-- ------------------------------------------------------- profiles.status
alter table public.profiles
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));
alter table public.profiles
  add column if not exists review_note text;
alter table public.profiles
  add column if not exists reviewed_at timestamptz;

-- One-time backfill: accounts created before review existed are approved.
update public.profiles
  set status = 'approved', reviewed_at = now()
  where status = 'pending' and reviewed_at is null;

create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at desc);
