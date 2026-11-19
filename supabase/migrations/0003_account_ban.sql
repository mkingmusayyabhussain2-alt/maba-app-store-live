-- MABA App Store — account ban (0003_account_ban.sql)
-- Run in the Supabase SQL Editor AFTER 0002_account_review.sql (or
-- `supabase db push`). Lets the owner ban an account for a while (or
-- permanently) from the review website. A banned account cannot log in,
-- release apps, or update its profile, and its apps disappear from the
-- public store until the ban ends or the owner unblocks it.
--
-- Run ONCE. No backfill is needed (no banned accounts exist yet).
-- The column adds are idempotent (IF NOT EXISTS). The check constraint is
-- replaced defensively inside a DO block that drops the old constraint
-- only when it still exists, so re-running this file is safe: the drop
-- runs again, then the new constraint is added again.

-- ------------------------------------------------------- ban columns
alter table public.profiles
  add column if not exists banned_at timestamptz;
alter table public.profiles
  add column if not exists ban_until timestamptz;

-- ------------------------------------------- status check: allow 'banned'
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_status_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_status_check
    check (status in ('pending', 'approved', 'rejected', 'banned'));
