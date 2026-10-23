-- 005: A saved routine that creates a draft change order and all its lines at once.
-- The prices come from the company's own price list, not from the app, so a tampered
-- request can't make up prices. And it's all-or-nothing: if any step fails, nothing gets saved.
create or replace function public.create_change_order_with_lines(
  p_business_id uuid,
  p_job_id uuid,
  p_reason text,
  p_lines jsonb
)
returns uuid
language plpgsql
-- It runs with the caller's own permissions, so the row-level locks still apply.
security invoker
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
    unit_price_cents
  )
  select
    p_business_id,
    v_change_order_id,
    item.name || ' (' || item.unit || ')',
    requested.quantity_milli,
    item.price_cents
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
revoke all on function public.create_change_order_with_lines(
  uuid, uuid, text, jsonb
) from public, anon;
-- ...and then signed-in users get the okay.
grant execute on function public.create_change_order_with_lines(
  uuid, uuid, text, jsonb
) to authenticated;
