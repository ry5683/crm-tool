-- 004: A saved routine (a function) the app can call to create a job, plus a new customer if needed,
-- plus all the estimate lines, in one go. Saving everything in one routine means it's all-or-nothing:
-- if any step fails, nothing is half-saved, so you never end up with a job that has no lines.
create or replace function public.create_job_with_estimate(
  p_business_id uuid,
  p_customer_id uuid,
  p_new_customer_name text,
  p_new_customer_email text,
  p_new_customer_phone text,
  p_new_customer_address text,
  p_job_description text,
  p_assigned_tech_id uuid,
  p_estimate_lines jsonb
)
-- When it's done, it hands back the new job's ID.
returns uuid
language plpgsql
-- 'Invoker' means it runs with the caller's own permissions, so the row-level locks from 003 still apply.
security invoker
-- This makes every table name get spelled out in full (public.whatever), so nothing sneaky can be swapped in.
set search_path = ''
as $$
declare
  -- A couple of scratch notes the routine keeps while it works.
  v_customer_id uuid;
  v_job_id uuid;
begin
  -- First, make sure the person's actually on this company's team. If not, we stop right here.
  if not private.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business.';
  end if;

  -- A job needs a description. We trim off stray spaces first so a bunch of blanks doesn't sneak through.
  if nullif(pg_catalog.btrim(p_job_description), '') is null then
    raise exception 'A job description is required.';
  end if;

  -- The estimate lines have to show up as a proper list...
  if p_estimate_lines is null
    or pg_catalog.jsonb_typeof(p_estimate_lines) is distinct from 'array' then
    raise exception 'Estimate lines must be provided as a list.';
  end if;

  -- ...and it can't be empty, because a job with no estimate lines doesn't make much sense.
  if pg_catalog.jsonb_array_length(p_estimate_lines) = 0 then
    raise exception 'At least one estimate line is required.';
  end if;

  -- Here we go through every line and refuse if any is missing a description, or has a quantity or price that's blank, zero or negative.
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

  -- No customer picked? Then we create a new one (which needs a name). If one was picked, we look it up instead.
  if p_customer_id is null then
    if nullif(pg_catalog.btrim(p_new_customer_name), '') is null then
      raise exception 'A customer must be selected or created.';
    end if;

    -- Saving the new customer. Any optional box left blank is stored as truly empty instead of a few spaces.
    insert into public.customers (
      business_id,
      name,
      email,
      phone,
      address
    )
    values (
      p_business_id,
      pg_catalog.btrim(p_new_customer_name),
      nullif(pg_catalog.btrim(p_new_customer_email), ''),
      nullif(pg_catalog.btrim(p_new_customer_phone), ''),
      nullif(pg_catalog.btrim(p_new_customer_address), '')
    )
    returning id into v_customer_id;
  else
    -- Looking up the picked customer, but only within THIS company. That stops anyone from using another company's customer.
    select customer.id
      into v_customer_id
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.business_id = p_business_id;

    if v_customer_id is null then
      raise exception 'The selected customer is not available to this business.';
    end if;
  end if;

  -- If a tech was chosen, they have to be a tech on this company's team, or we refuse.
  if p_assigned_tech_id is not null and not exists (
    select 1
    from public.members as member
    where member.business_id = p_business_id
      and member.user_id = p_assigned_tech_id
      and member.role = 'tech'
  ) then
    raise exception 'The selected technician is not available to this business.';
  end if;

  -- Now we save the job itself, starting out as 'open'.
  insert into public.jobs (
    business_id,
    customer_id,
    assigned_tech_id,
    status,
    description
  )
  values (
    p_business_id,
    v_customer_id,
    p_assigned_tech_id,
    'open',
    pg_catalog.btrim(p_job_description)
  )
  returning id into v_job_id;

  -- And one estimate line gets saved for every item in the list, all attached to the new job.
  insert into public.estimate_lines (
    business_id,
    job_id,
    description,
    quantity_milli,
    unit_price_cents
  )
  select
    p_business_id,
    v_job_id,
    pg_catalog.btrim(line.description),
    line.quantity_milli,
    line.unit_price_cents
  from pg_catalog.jsonb_to_recordset(p_estimate_lines) as line(
    description text,
    quantity_milli integer,
    unit_price_cents integer
  );

  -- All done, so we give the new job's ID back to the app.
  return v_job_id;
end;
$$;

-- Permissions: by default nobody can run this, logged-out visitors included...
revoke all on function public.create_job_with_estimate(
  uuid, uuid, text, text, text, text, text, uuid, jsonb
) from public, anon;
-- ...and then we let signed-in users run it.
grant execute on function public.create_job_with_estimate(
  uuid, uuid, text, text, text, text, text, uuid, jsonb
) to authenticated;
