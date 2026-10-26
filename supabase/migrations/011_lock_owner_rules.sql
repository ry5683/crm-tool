-- 011: Put the lock on the door itself, not just on the buttons.
-- Before this file, the app hid owner-only buttons from techs, but the database would still
-- say yes if a tech went around the app and talked to the database directly.
-- This file makes the database itself enforce these rules:
--   1. Only owners can mark an invoice paid or unpaid.
--   2. Only owners can delete customers and jobs.
--   3. Change-order prices can only come from the pricebook. Nobody can type in their own price.
--   4. An estimate is locked once the invoice is paid. Once a change order has gone to the
--      customer, only an owner can edit the estimate.
-- Run this after 001 to 010.

-- ---------------------------------------------------------------------------
-- 1. Payment status: owners only.
-- ---------------------------------------------------------------------------

-- Supabase lets signed-in users change any column of a table (if row-level security allows the row).
-- We take that away for jobs, then hand back only the columns the app really needs to edit.
-- paid_at and business_id are NOT on the list, so nobody can change them with a direct update.
revoke update on public.jobs from anon, authenticated;
grant update (customer_id, assigned_tech_id, description, status)
  on public.jobs to authenticated;

-- The one approved way to mark a job paid or unpaid. It checks you're an owner of that job's company.
-- 'security definer' lets it change paid_at even though users can't touch that column directly.
create or replace function public.set_job_paid(p_job_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  select job.business_id
    into v_business_id
  from public.jobs as job
  where job.id = p_job_id
  for update;

  -- Same message whether the job doesn't exist or belongs to someone else, so nobody can
  -- use this to find out which job IDs exist.
  if v_business_id is null or not private.is_business_owner(v_business_id) then
    raise exception 'Only an owner of this business can change payment status.';
  end if;

  update public.jobs
  set paid_at = case when p_paid then pg_catalog.now() else null end
  where id = p_job_id
    and business_id = v_business_id;
end;
$$;

revoke all on function public.set_job_paid(uuid, boolean) from public, anon;
grant execute on function public.set_job_paid(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deleting customers and jobs: owners only.
-- ---------------------------------------------------------------------------

-- The old customer rule let anyone on the team do everything. We split it so techs can still
-- look, add and edit, but only owners can delete.
drop policy if exists customers_manage_for_members on public.customers;
-- (These extra 'drop if exists' lines make the file safe to run twice.)
drop policy if exists customers_select_for_members on public.customers;
drop policy if exists customers_insert_for_members on public.customers;
drop policy if exists customers_update_for_members on public.customers;
drop policy if exists customers_delete_for_owners on public.customers;

create policy customers_select_for_members
  on public.customers for select to authenticated
  using (private.is_business_member(business_id));

create policy customers_insert_for_members
  on public.customers for insert to authenticated
  with check (private.is_business_member(business_id));

create policy customers_update_for_members
  on public.customers for update to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

create policy customers_delete_for_owners
  on public.customers for delete to authenticated
  using (private.is_business_owner(business_id));

-- Same split for jobs.
drop policy if exists jobs_manage_for_members on public.jobs;
drop policy if exists jobs_select_for_members on public.jobs;
drop policy if exists jobs_insert_for_members on public.jobs;
drop policy if exists jobs_update_for_members on public.jobs;
drop policy if exists jobs_delete_for_owners on public.jobs;

create policy jobs_select_for_members
  on public.jobs for select to authenticated
  using (private.is_business_member(business_id));

create policy jobs_insert_for_members
  on public.jobs for insert to authenticated
  with check (private.is_business_member(business_id));

create policy jobs_update_for_members
  on public.jobs for update to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

create policy jobs_delete_for_owners
  on public.jobs for delete to authenticated
  using (private.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- 3. Change-order prices come only from the pricebook.
-- ---------------------------------------------------------------------------

-- The routine from 005 already copies prices from the pricebook. It used to run with the
-- user's own permissions, so users also needed permission to add lines themselves, and that
-- let someone add a line with any price. Now the routine runs with its own permission
-- (it still checks you're on the team), and nobody can add or change lines directly.
alter function public.create_change_order_with_lines(uuid, uuid, text, jsonb)
  security definer;

drop policy if exists change_order_lines_insert_for_drafts on public.change_order_lines;
drop policy if exists change_order_lines_update_for_drafts on public.change_order_lines;
-- (Deleting lines from a draft is still allowed; job deletion uses it.)

-- Same for the change order itself: it can only be created by the routine above, and its
-- total can't be edited by hand. Sending and deciding already go through routines from 006.
drop policy if exists change_orders_insert_as_draft on public.change_orders;
drop policy if exists change_orders_update_as_draft on public.change_orders;
-- (Deleting a draft is still allowed.)

-- ---------------------------------------------------------------------------
-- 4. Estimate lock.
-- ---------------------------------------------------------------------------

-- Answers: 'may the signed-in person change this job's estimate right now?'
--   - Never once the invoice is marked paid.
--   - Once any change order has gone to the customer, owners only.
--   - Otherwise, anyone on the team.
create or replace function private.can_edit_estimate(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs as job
    where job.id = target_job_id
      and job.paid_at is null
      and private.is_business_member(job.business_id)
      and (
        private.is_business_owner(job.business_id)
        or not exists (
          select 1
          from public.change_orders as change_order
          where change_order.business_id = job.business_id
            and change_order.job_id = job.id
            and change_order.status <> 'draft'
        )
      )
  );
$$;

revoke all on function private.can_edit_estimate(uuid) from public, anon;
grant execute on function private.can_edit_estimate(uuid) to authenticated;

-- A guard that runs every time an estimate line is added, changed or removed.
-- It works like a lock (it says no), but also gives a clear message instead of a vague error.
create or replace function private.guard_estimate_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No signed-in user means this is you in the Supabase dashboard or a server script (like the seed).
  -- Logged-out visitors can't reach this table at all, because row-level security has no rule for them.
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and not private.can_edit_estimate(old.job_id) then
    raise exception 'This estimate is locked: the invoice is paid, or a change order has gone to the customer (only an owner can edit it then).';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not private.can_edit_estimate(new.job_id) then
    raise exception 'This estimate is locked: the invoice is paid, or a change order has gone to the customer (only an owner can edit it then).';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists estimate_lines_guard on public.estimate_lines;
create trigger estimate_lines_guard
  before insert or update or delete on public.estimate_lines
  for each row execute function private.guard_estimate_lines();
