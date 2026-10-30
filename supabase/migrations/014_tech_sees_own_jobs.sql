-- 014: Techs only see their own jobs.
-- Before this file, everyone on a team could see every job. Now:
--   - Owners still see every job in their company.
--   - A tech sees only the jobs assigned to them, plus everything hanging off those jobs
--     (estimate lines, change orders and their lines, approvals, photos).
--   - When a tech creates or edits a job, it's assigned to them automatically, so they can
--     never lock themselves out of a job they just saved, or hand it to someone else.
--   - Customers, the price list and the team roster are still shared with the whole team,
--     because a tech needs them to create a job.
-- Run this after 001 to 013. Safe to run twice.

-- ---------------------------------------------------------------------------
-- Helpers: 'can the signed-in person see this job / this change order?'
-- ---------------------------------------------------------------------------

-- Yes if they're an owner of the job's company, or a tech the job is assigned to.
create or replace function private.can_see_job(target_business_id uuid, target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs as job
    join public.members as m
      on m.business_id = job.business_id
     and m.user_id = (select auth.uid())
    where job.business_id = target_business_id
      and job.id = target_job_id
      and (m.role = 'owner' or job.assigned_tech_id = m.user_id)
  );
$$;

-- Same question for a change order: you can see it if you can see its job.
create or replace function private.can_see_change_order(
  target_business_id uuid,
  target_change_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.change_orders as change_order
    where change_order.business_id = target_business_id
      and change_order.id = target_change_order_id
      and private.can_see_job(change_order.business_id, change_order.job_id)
  );
$$;

-- The helper from 003 that decides who can delete a draft's lines now also needs you to see the job.
create or replace function private.can_edit_change_order(
  target_business_id uuid,
  target_change_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.change_orders as co
    where co.business_id = target_business_id
      and co.id = target_change_order_id
      and co.status = 'draft'
      and private.can_see_job(co.business_id, co.job_id)
  );
$$;

revoke all on function private.can_see_job(uuid, uuid) from public, anon;
revoke all on function private.can_see_change_order(uuid, uuid) from public, anon;
grant execute on function private.can_see_job(uuid, uuid) to authenticated;
grant execute on function private.can_see_change_order(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Jobs: owners see all, techs see their own.
-- ---------------------------------------------------------------------------

drop policy if exists jobs_select_for_members on public.jobs;
drop policy if exists jobs_select_for_owners_or_assigned on public.jobs;
create policy jobs_select_for_owners_or_assigned
  on public.jobs for select to authenticated
  using (
    private.is_business_owner(business_id)
    or (assigned_tech_id = (select auth.uid()) and private.is_business_member(business_id))
  );

drop policy if exists jobs_update_for_members on public.jobs;
drop policy if exists jobs_update_for_owners_or_assigned on public.jobs;
create policy jobs_update_for_owners_or_assigned
  on public.jobs for update to authenticated
  using (
    private.is_business_owner(business_id)
    or (assigned_tech_id = (select auth.uid()) and private.is_business_member(business_id))
  )
  with check (private.is_business_member(business_id));

-- (Adding jobs stays open to the whole team, and deleting stays owners-only, both from 011.)

-- When a tech adds or edits a job, it's assigned to them, whatever the form said.
-- Owners can assign anyone. Dashboard and seed scripts (no signed-in user) are left alone.
create or replace function private.guard_tech_job_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_business_owner(new.business_id) then
    return new;
  end if;
  new.assigned_tech_id := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists jobs_tech_assignment_guard on public.jobs;
create trigger jobs_tech_assignment_guard
  before insert or update on public.jobs
  for each row execute function private.guard_tech_job_assignment();

-- ---------------------------------------------------------------------------
-- Everything hanging off a job follows the job.
-- ---------------------------------------------------------------------------

drop policy if exists estimate_lines_manage_for_members on public.estimate_lines;
drop policy if exists estimate_lines_manage_for_job_viewers on public.estimate_lines;
create policy estimate_lines_manage_for_job_viewers
  on public.estimate_lines for all to authenticated
  using (private.can_see_job(business_id, job_id))
  with check (private.can_see_job(business_id, job_id));

drop policy if exists change_orders_select_for_members on public.change_orders;
drop policy if exists change_orders_select_for_job_viewers on public.change_orders;
create policy change_orders_select_for_job_viewers
  on public.change_orders for select to authenticated
  using (private.can_see_job(business_id, job_id));

drop policy if exists change_orders_delete_as_draft on public.change_orders;
create policy change_orders_delete_as_draft
  on public.change_orders for delete to authenticated
  using (private.can_see_job(business_id, job_id) and status = 'draft');

drop policy if exists change_order_lines_select_for_members on public.change_order_lines;
drop policy if exists change_order_lines_select_for_job_viewers on public.change_order_lines;
create policy change_order_lines_select_for_job_viewers
  on public.change_order_lines for select to authenticated
  using (private.can_see_change_order(business_id, change_order_id));
-- (change_order_lines_delete_for_drafts from 003 uses can_edit_change_order, updated above.)

drop policy if exists approvals_select_for_members on public.approvals;
drop policy if exists approvals_select_for_job_viewers on public.approvals;
create policy approvals_select_for_job_viewers
  on public.approvals for select to authenticated
  using (private.can_see_change_order(business_id, change_order_id));

drop policy if exists change_order_photos_select_for_members on public.change_order_photos;
drop policy if exists change_order_photos_select_for_job_viewers on public.change_order_photos;
create policy change_order_photos_select_for_job_viewers
  on public.change_order_photos for select to authenticated
  using (private.can_see_change_order(business_id, change_order_id));

-- ---------------------------------------------------------------------------
-- The saved routines from 006, 011 and 013 run with their own permissions, so the rules above
-- don't stop them. These guards do: any signed-in person creating, sending, undoing or deleting
-- a change order, or adding/removing a photo, must be able to see the job. The customer's
-- approval link has no signed-in user, so it isn't affected.
-- ---------------------------------------------------------------------------

create or replace function private.guard_change_order_job_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_table_name = 'change_orders' then
    if not private.can_see_job(v_row.business_id, v_row.job_id) then
      raise exception 'That job is not available to your account.';
    end if;
  elsif tg_op = 'DELETE' and not exists (
    select 1 from public.change_orders as change_order where change_order.id = v_row.change_order_id
  ) then
    -- The change order itself was just deleted (by someone allowed to), and its photo rows go with it.
    null;
  elsif not private.can_see_change_order(v_row.business_id, v_row.change_order_id) then
    raise exception 'That change order is not available to your account.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists change_orders_job_access_guard on public.change_orders;
create trigger change_orders_job_access_guard
  before insert or update or delete on public.change_orders
  for each row execute function private.guard_change_order_job_access();

drop trigger if exists change_order_photos_job_access_guard on public.change_order_photos;
create trigger change_order_photos_job_access_guard
  before insert or delete on public.change_order_photos
  for each row execute function private.guard_change_order_job_access();
