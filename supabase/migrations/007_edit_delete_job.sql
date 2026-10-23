-- 007: Two saved routines, one to edit a job (with its customer and estimate lines) and one to delete a job.
-- Each is all-or-nothing, so a failure part-way never leaves a half-edited or half-deleted job.
-- Same money rules as before: cents for prices, thousandths for quantities.
--
-- Routine 1: edit a job. It updates the customer's details, the tech, the description and swaps in the new estimate lines.
create or replace function public.update_job_with_estimate(
  p_job_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_address text,
  p_job_description text,
  p_assigned_tech_id uuid,
  p_estimate_lines jsonb
)
returns void
language plpgsql
-- It runs with the caller's own permissions, so the row-level locks from 003 still apply.
security invoker
set search_path = ''
as $$
declare
  -- A copy of the job row to work from.
  v_job public.jobs%rowtype;
begin
  -- Grab the job and lock it ('for update') so nobody else changes it while we're working.
  select job.*
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  -- If the job doesn't exist, or the locks hide it (say, it's another company's), we stop.
  if not found then
    raise exception 'That job is not available to your account.';
  end if;
  -- Make sure the person's on this job's company team.
  if not private.is_business_member(v_job.business_id) then
    raise exception 'You are not a member of this business.';
  end if;
  -- A job needs a description.
  if nullif(pg_catalog.btrim(p_job_description), '') is null then
    raise exception 'A job description is required.';
  end if;
  -- And the customer needs a name.
  if nullif(pg_catalog.btrim(p_customer_name), '') is null then
    raise exception 'A customer name is required.';
  end if;
  -- The estimate has to be a list with at least one line.
  if p_estimate_lines is null
    or pg_catalog.jsonb_typeof(p_estimate_lines) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_estimate_lines) = 0 then
    raise exception 'At least one estimate line is required.';
  end if;

  -- Every line needs a description plus a quantity and price above zero.
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_estimate_lines) as line(
      description text,
      quantity_milli integer,
      unit_price_cents integer
    )
    where nullif(pg_catalog.btrim(line.description), '') is null
      or line.quantity_milli is null
      or line.quantity_milli <= 0
      or line.unit_price_cents is null
      or line.unit_price_cents <= 0
  ) then
    raise exception 'Each estimate line needs a description, positive quantity, and positive price.';
  end if;

  -- The picked customer has to belong to this same company.
  if not exists (
    select 1
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.business_id = v_job.business_id
  ) then
    raise exception 'The selected customer is not available to this business.';
  end if;

  -- If a tech is chosen, they have to be a tech on this company's team.
  if p_assigned_tech_id is not null and not exists (
    select 1
    from public.members as member
    where member.business_id = v_job.business_id
      and member.user_id = p_assigned_tech_id
      and member.role = 'tech'
  ) then
    raise exception 'The selected technician is not available to this business.';
  end if;

  -- Update the customer's name, email, phone and address. Blank optional boxes become truly empty. Note this changes the customer everywhere, not just on this job.
  update public.customers
  set
    name = pg_catalog.btrim(p_customer_name),
    email = nullif(pg_catalog.btrim(p_customer_email), ''),
    phone = nullif(pg_catalog.btrim(p_customer_phone), ''),
    address = nullif(pg_catalog.btrim(p_customer_address), '')
  where id = p_customer_id
    and business_id = v_job.business_id;

  -- Update the job's customer, tech and description.
  update public.jobs
  set
    customer_id = p_customer_id,
    assigned_tech_id = p_assigned_tech_id,
    description = pg_catalog.btrim(p_job_description)
  where id = v_job.id
    and business_id = v_job.business_id;

  -- Clear out the old estimate lines...
  delete from public.estimate_lines
  where job_id = v_job.id
    and business_id = v_job.business_id;

  -- ...and put the new ones in. Doing both in one routine means a failure can't leave the job with no lines.
  insert into public.estimate_lines (
    business_id,
    job_id,
    description,
    quantity_milli,
    unit_price_cents
  )
  select
    v_job.business_id,
    v_job.id,
    pg_catalog.btrim(line.description),
    line.quantity_milli,
    line.unit_price_cents
  from pg_catalog.jsonb_to_recordset(p_estimate_lines) as line(
    description text,
    quantity_milli integer,
    unit_price_cents integer
  );
end;
$$;

-- Owners only. Jobs with a sent, approved or declined change order are kept
-- because those are the customer-facing record; draft change orders go with the job.
-- Routine 2: deleting a job and everything hanging off it.
create or replace function public.delete_job(p_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  select job.*
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'That job is not available to your account.';
  end if;
  -- Only owners can delete a job. Techs can't.
  if not private.is_business_owner(v_job.business_id) then
    raise exception 'Only a business owner can delete a job.';
  end if;
  -- If any change order has already gone out (sent, approved or declined), we refuse. Those are the customer's record.
  if exists (
    select 1
    from public.change_orders as change_order
    where change_order.job_id = v_job.id
      and change_order.business_id = v_job.business_id
      and change_order.status <> 'draft'
  ) then
    raise exception 'This job has change orders that were sent to the customer, so it cannot be deleted.';
  end if;

  -- Now the cleanup, kids before parents, since links would block it the other way round. First the lines on the draft change orders...
  delete from public.change_order_lines
  where business_id = v_job.business_id
    and change_order_id in (
      select change_order.id
      from public.change_orders as change_order
      where change_order.job_id = v_job.id
        and change_order.business_id = v_job.business_id
    );

  -- ...then the draft change orders themselves...
  delete from public.change_orders
  where job_id = v_job.id
    and business_id = v_job.business_id;

  -- ...then the estimate lines...
  delete from public.estimate_lines
  where job_id = v_job.id
    and business_id = v_job.business_id;

  -- ...and finally the job. If any step fails, nothing gets deleted.
  delete from public.jobs
  where id = v_job.id
    and business_id = v_job.business_id;
end;
$$;

-- Permissions: nobody can run these by default, logged-out visitors included, then signed-in users get the okay.
revoke all on function public.update_job_with_estimate(
  uuid, uuid, text, text, text, text, text, uuid, jsonb
) from public, anon;
revoke all on function public.delete_job(uuid) from public, anon;
grant execute on function public.update_job_with_estimate(
  uuid, uuid, text, text, text, text, text, uuid, jsonb
) to authenticated;
grant execute on function public.delete_job(uuid) to authenticated;
