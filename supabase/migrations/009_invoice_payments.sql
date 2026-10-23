-- 009: Lets a job's invoice be marked as paid.
-- There's no separate invoice table: a job's invoice is its estimate plus approved changes.
-- So we just remember WHEN the job got paid. Empty means "not paid yet".
-- The existing job rules (003) already let team members update their own business's jobs,
-- and the app only offers the "Mark paid" button to owners.
alter table public.jobs
  add column if not exists paid_at timestamptz;
