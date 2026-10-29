-- 012: Sales tax.
-- What changes, in plain words:
--   - Each business gets one sales tax rate, set by an owner (for example 7.75%).
--   - Every pricebook item, estimate line and change-order line gets a "taxable" yes/no.
--     Parts are taxable by default; labor (anything priced per hour) is not.
--   - The invoice adds tax on the taxable lines only.
--   - When an owner marks a job paid, the rate in effect that day is saved on the job,
--     so changing the rate later never rewrites a paid invoice.
-- Run this after 001 to 011.

-- The rate is stored in thousandths of a percent, so 7.75% = 7750 and 7.875% = 7875.
-- Same idea as cents: whole numbers, no rounding surprises. 0 to 20% allowed.
alter table public.businesses
  add column if not exists tax_rate_millipercent integer not null default 0
    check (tax_rate_millipercent between 0 and 20000);

-- The rate frozen onto a job when it's marked paid. Empty means "use the business's current rate".
alter table public.jobs
  add column if not exists tax_rate_millipercent integer
    check (tax_rate_millipercent between 0 and 20000);

-- Taxable flags. Everything starts as taxable...
alter table public.pricebook_items
  add column if not exists taxable boolean not null default true;
alter table public.estimate_lines
  add column if not exists taxable boolean not null default true;
alter table public.change_order_lines
  add column if not exists taxable boolean not null default true;

-- ...then existing labor items (priced per hour) are switched to not taxable.
update public.pricebook_items
set taxable = false
where pg_catalog.lower(pg_catalog.btrim(unit)) in ('hour', 'hours', 'hr', 'hrs', 'hourly');

-- Existing lines copied from those labor items follow suit. A change-order line's description
-- is "<item name> (<unit>)", so per-hour lines end in "(hour)" or similar.
update public.change_order_lines
set taxable = false
where description ~* '\((hour|hours|hr|hrs|hourly)\)$';

-- Estimate lines are typed by hand, so we guess from the words: lines that mention labor aren't taxed.
-- Owners can fix any line by editing the job.
update public.estimate_lines
set taxable = false
where description ~* '\m(labor|labour)\M';

-- The owner-only way to set the business's tax rate. Businesses have no "edit" rule for
-- regular users (see 003), so this routine is the only door, and it checks you're an owner.
create or replace function public.set_business_tax_rate(p_tax_rate_millipercent integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if p_tax_rate_millipercent is null
    or p_tax_rate_millipercent < 0
    or p_tax_rate_millipercent > 20000 then
    raise exception 'Tax rate must be between 0%% and 20%%.';
  end if;

  select member.business_id
    into v_business_id
  from public.members as member
  where member.user_id = (select auth.uid())
    and member.role = 'owner'
  order by member.created_at asc
  limit 1;
  if v_business_id is null then
    raise exception 'Only a business owner can change the tax rate.';
  end if;

  update public.businesses
  set tax_rate_millipercent = p_tax_rate_millipercent
  where id = v_business_id;
end;
$$;

revoke all on function public.set_business_tax_rate(integer) from public, anon;
grant execute on function public.set_business_tax_rate(integer) to authenticated;

-- Marking paid now also freezes the tax rate onto the job. Marking unpaid clears it,
-- so the invoice goes back to following the business's current rate.
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

  if v_business_id is null or not private.is_business_owner(v_business_id) then
    raise exception 'Only an owner of this business can change payment status.';
  end if;

  update public.jobs
  set
    paid_at = case when p_paid then pg_catalog.now() else null end,
    tax_rate_millipercent = case
      when p_paid then (
        select business.tax_rate_millipercent
        from public.businesses as business
        where business.id = v_business_id
      )
      else null
    end
  where id = p_job_id
    and business_id = v_business_id;
end;
$$;

-- The three routines below are the same as in 004, 005 and 007, with one change each:
-- they now save the "taxable" yes/no on every line. Estimate lines take it from the form
-- (taxable if not given); change-order lines copy it from the pricebook item, like the price.

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
      unit_price_cents integer,
      taxable boolean
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
    unit_price_cents,
    taxable
  )
  select
    p_business_id,
    v_job_id,
    pg_catalog.btrim(line.description),
    line.quantity_milli,
    line.unit_price_cents,
    coalesce(line.taxable, true)
  from pg_catalog.jsonb_to_recordset(p_estimate_lines) as line(
    description text,
    quantity_milli integer,
    unit_price_cents integer,
      taxable boolean
  );

  -- All done, so we give the new job's ID back to the app.
  return v_job_id;
end;
$$;

-- Permissions: by default nobody can run this, logged-out visitors included...

create or replace function public.create_change_order_with_lines(
  p_business_id uuid,
  p_job_id uuid,
  p_reason text,
  p_lines jsonb
)
returns uuid
language plpgsql
-- It runs with the caller's own permissions, so the row-level locks still apply.
security definer
set search_path = ''
as $$
declare
  v_change_order_id uuid;
  -- Scratch notes while it works: how many lines, how many matched the price list, and the running total in cents.
  v_line_count integer;
  v_available_count integer;
  v_total_cents numeric;
begin
  -- First stop: is this person on the company's team? If not, we refuse.
  if not private.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business.';
  end if;

  -- A change order needs a reason, so a blank one gets bounced.
  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  -- The lines have to arrive as a list...
  if p_lines is null
    or pg_catalog.jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Change-order lines must be provided as a list.';
  end if;

  -- ...with 1 to 50 lines. Zero is pointless, and a huge number is probably a mistake or someone misbehaving.
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  if v_line_count < 1 or v_line_count > 50 then
    raise exception 'A change order must contain between 1 and 50 lines.';
  end if;

  -- Every line needs a price-list item and a quantity above zero (remember, in thousandths: 1 unit = 1000).
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_lines) as requested(
      pricebook_item_id uuid,
      quantity_milli integer
    )
    where requested.pricebook_item_id is null
      or requested.quantity_milli is null
      or requested.quantity_milli <= 0
  ) then
    raise exception 'Each line needs a valid pricebook item and positive quantity.';
  end if;

  -- Now we count how many of the requested price-list items really exist on THIS company's price list.
  select count(*)
    into v_available_count
  from (
    select requested.pricebook_item_id
    from pg_catalog.jsonb_to_recordset(p_lines) as requested(
      pricebook_item_id uuid,
      quantity_milli integer
    )
    group by requested.pricebook_item_id
  ) as requested
  join public.pricebook_items as item
    on item.id = requested.pricebook_item_id
   and item.business_id = p_business_id;

  -- If the counts don't match, something's missing, belongs to another company, or was listed twice. So we refuse.
  if v_available_count <> v_line_count then
    raise exception 'A selected pricebook item is unavailable or duplicated.';
  end if;

  -- Next, the job has to exist and belong to this company.
  if not exists (
    select 1
    from public.jobs as job
    where job.id = p_job_id
      and job.business_id = p_business_id
  ) then
    raise exception 'The selected job is not available to this business.';
  end if;

  -- This briefly holds the price-list rows ('for share') so nobody can change a price halfway through the math.
  perform 1
  from public.pricebook_items as item
  join (
    select requested.pricebook_item_id
    from pg_catalog.jsonb_to_recordset(p_lines) as requested(
      pricebook_item_id uuid,
      quantity_milli integer
    )
  ) as requested
    on requested.pricebook_item_id = item.id
  where item.business_id = p_business_id
  for share of item;

  -- Figuring the total: for each line it's quantity times price, divided by 1000 (since quantities are in thousandths)
  -- and rounded to the nearest cent. The +500 is what does the rounding. Then we add the lines up.
  select pg_catalog.sum(
    pg_catalog.floor(
      (requested.quantity_milli::numeric * item.price_cents + 500) / 1000
    )
  )
    into v_total_cents
  from pg_catalog.jsonb_to_recordset(p_lines) as requested(
    pricebook_item_id uuid,
    quantity_milli integer
  )
  join public.pricebook_items as item
    on item.id = requested.pricebook_item_id
   and item.business_id = p_business_id;

  -- If the total's too big for the number column to hold, we refuse.
  if v_total_cents > 2147483647 then
    raise exception 'The change-order total exceeds the supported amount.';
  end if;

  -- Saving the change order itself as a draft, with that total.
  insert into public.change_orders (
    business_id,
    job_id,
    reason,
    status,
    total_cents
  )
  values (
    p_business_id,
    p_job_id,
    pg_catalog.btrim(p_reason),
    'draft',
    v_total_cents::integer
  )
  returning id into v_change_order_id;

  -- Saving each line. The name, unit and today's price get copied from the price list, so later price changes won't rewrite this change order.
  insert into public.change_order_lines (
    business_id,
    change_order_id,
    description,
    quantity_milli,
    unit_price_cents,
    taxable
  )
  select
    p_business_id,
    v_change_order_id,
    item.name || ' (' || item.unit || ')',
    requested.quantity_milli,
    item.price_cents,
    item.taxable
  from pg_catalog.jsonb_to_recordset(p_lines) as requested(
    pricebook_item_id uuid,
    quantity_milli integer
  )
  join public.pricebook_items as item
    on item.id = requested.pricebook_item_id
   and item.business_id = p_business_id;

  -- Done! We hand the new change order's ID back to the app.
  return v_change_order_id;
end;
$$;

-- Permissions: nobody can run it by default, logged-out visitors included...

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
      unit_price_cents integer,
      taxable boolean
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
    unit_price_cents,
    taxable
  )
  select
    v_job.business_id,
    v_job.id,
    pg_catalog.btrim(line.description),
    line.quantity_milli,
    line.unit_price_cents,
    coalesce(line.taxable, true)
  from pg_catalog.jsonb_to_recordset(p_estimate_lines) as line(
    description text,
    quantity_milli integer,
    unit_price_cents integer,
      taxable boolean
  );
end;
$$;

-- Owners only. Jobs with a sent, approved or declined change order are kept
-- because those are the customer-facing record; draft change orders go with the job.
-- Routine 2: deleting a job and everything hanging off it.
