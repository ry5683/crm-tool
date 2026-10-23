-- 006: The customer approval workflow, as four saved routines. Here's the story: staff send a draft,
-- the customer gets a secret link, opens it, and approves or declines. A fourth routine can undo
-- a send if the email fails. Each one is all-or-nothing, so nothing ever ends up half-done.
--
-- Routine 1: sending a draft change order to the customer. Staff only.
create or replace function public.send_change_order_for_approval(
  p_change_order_id uuid,
  p_token_hash text
)
-- This hands back what the app needs to write the customer's email.
returns table (
  approval_id uuid,
  customer_email text,
  business_name text,
  job_description text,
  reason text,
  total_cents integer
)
language plpgsql
-- 'Definer' means it runs with the app's own higher permissions, so it can write to the approvals table
-- that staff can't touch directly. That's why it double-checks everything by hand inside.
security definer
set search_path = ''
as $$
declare
  -- Scratch notes the routine keeps while it works.
  v_change_order public.change_orders%rowtype;
  v_customer_email text;
  v_business_name text;
  v_job_description text;
  v_total_cents numeric;
  v_approval_id uuid;
begin
  -- First, make sure somebody's actually signed in. We don't want strangers poking around.
  if auth.uid() is null then
    raise exception 'Sign in before sending a change order.';
  end if;
  -- The secret link's fingerprint has to be exactly 64 hex characters (a SHA-256 hash). The real link itself never comes through here.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid approval token hash.';
  end if;

  -- Grab the change order and lock its row ('for update'), so two people can't send it at the exact same moment.
  select change_order.*
    into v_change_order
  from public.change_orders as change_order
  where change_order.id = p_change_order_id
  for update;

  -- If it doesn't exist, we stop.
  if not found then
    raise exception 'Change order is not available.';
  end if;
  -- Now we confirm the signed-in person is on this change order's company team.
  if not exists (
    select 1
    from public.members as member
    where member.business_id = v_change_order.business_id
      and member.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this business.';
  end if;
  -- Only drafts can be sent. That also stops it going out twice.
  if v_change_order.status <> 'draft' then
    raise exception 'Only a draft change order can be sent.';
  end if;

  -- Pulling together the customer's email, the company name and the job description for the email.
  select customer.email, business.name, job.description
    into v_customer_email, v_business_name, v_job_description
  from public.jobs as job
  join public.customers as customer
    on customer.business_id = job.business_id
   and customer.id = job.customer_id
  join public.businesses as business
    on business.id = job.business_id
  where job.business_id = v_change_order.business_id
    and job.id = v_change_order.job_id;

  -- No email on the customer? Then there's nowhere to send the link, so we stop and say so.
  if nullif(pg_catalog.btrim(v_customer_email), '') is null then
    raise exception 'Add an email address to the job customer before sending.';
  end if;

  -- Adding up the total again from the saved lines (quantity in thousandths times price in cents, divided by 1000,
  -- rounded to the cent). We recheck rather than just trust the stored number.
  select pg_catalog.sum(
    pg_catalog.floor(
      (line.quantity_milli::numeric * line.unit_price_cents + 500) / 1000
    )
  )
    into v_total_cents
  from public.change_order_lines as line
  where line.business_id = v_change_order.business_id
    and line.change_order_id = v_change_order.id;

  -- The recalculated total has to make sense: there are lines, it's not negative, and it's not absurdly big.
  if v_total_cents is null or v_total_cents < 0 or v_total_cents > 2147483647 then
    raise exception 'The change-order total is not valid.';
  end if;
  -- And it has to match the stored total, so the customer sees exactly the amount they're approving.
  if v_total_cents::integer <> v_change_order.total_cents then
    raise exception 'The stored change-order total does not match its lines.';
  end if;

  -- Saving the approval request: the hashed link, the version, and an expiry 7 days from now.
  insert into public.approvals (
    business_id,
    change_order_id,
    version,
    token_hash,
    expires_at
  )
  values (
    v_change_order.business_id,
    v_change_order.id,
    v_change_order.version,
    p_token_hash,
    pg_catalog.now() + interval '7 days'
  )
  returning id into v_approval_id;

  -- Flipping the change order to 'sent'. From here on it's frozen against edits.
  update public.change_orders
  set status = 'sent'
  where id = v_change_order.id
    and business_id = v_change_order.business_id;

  -- Handing back the details the app needs for the email.
  return query
  select
    v_approval_id,
    v_customer_email,
    v_business_name,
    v_job_description,
    v_change_order.reason,
    v_change_order.total_cents;
end;
$$;

-- Routine 2: the undo button. If the email couldn't go out, this deletes the unanswered approval
-- and turns the change order back into a draft. It returns true if it undid things, false if it didn't.
create or replace function public.rollback_unsent_approval(p_approval_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_change_order public.change_orders%rowtype;
begin
  -- Again, somebody has to be signed in.
  if auth.uid() is null then
    raise exception 'Sign in before changing an approval request.';
  end if;

  -- Find the approval, but only if the customer hasn't answered yet, and lock it. If there isn't one, we quietly return false.
  select approval.*
    into v_approval
  from public.approvals as approval
  where approval.id = p_approval_id
    and approval.decision is null
  for update;

  if not found then
    return false;
  end if;

  -- Find the matching change order and lock it too.
  select change_order.*
    into v_change_order
  from public.change_orders as change_order
  where change_order.id = v_approval.change_order_id
    and change_order.business_id = v_approval.business_id
  for update;

  -- Quietly return false unless the change order exists, is still 'sent', is the same version as the approval,
  -- and the person is on the company's team. In other words, only undo what's safe to undo.
  if not found
    or v_change_order.status <> 'sent'
    or v_change_order.version <> v_approval.version
    or not exists (
      select 1
      from public.members as member
      where member.business_id = v_approval.business_id
        and member.user_id = auth.uid()
    ) then
    return false;
  end if;

  -- Remove the unanswered approval, so its link stops working.
  delete from public.approvals
  where id = v_approval.id
    and decision is null;

  -- Put the change order back to 'draft' so staff can edit it and send again.
  update public.change_orders
  set status = 'draft'
  where id = v_change_order.id
    and business_id = v_change_order.business_id
    and status = 'sent';

  -- Undo worked, so we report success.
  return true;
end;
$$;

-- Routine 3: this is what the customer's link uses to show them the change order. They aren't signed in,
-- so it only gives back a status word and the bare minimum to display, nothing else.
create or replace function public.get_public_approval(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_change_order public.change_orders%rowtype;
  v_job public.jobs%rowtype;
  v_business_name text;
  v_lines jsonb;
begin
  -- If the link code looks wrong, we just say 'invalid' and reveal nothing else.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  select approval.*
    into v_approval
  from public.approvals as approval
  -- Look up the approval by its hashed link. No match means 'invalid'.
  where approval.token_hash = p_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  select change_order.*
    into v_change_order
  from public.change_orders as change_order
  where change_order.id = v_approval.change_order_id
    and change_order.business_id = v_approval.business_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  -- If they've already answered, say so, and include the answer and the name they gave.
  if v_approval.decision is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_decided',
      'decision', v_approval.decision,
      'approver_name', v_approval.approver_name
    );
  end if;

  -- Past the 7-day deadline? Then the answer is 'expired'.
  if v_approval.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  -- If the change order isn't 'sent' anymore, or got revised since, we say 'outdated' so nobody approves old numbers.
  if v_change_order.status <> 'sent'
    or v_change_order.version <> v_approval.version then
    return pg_catalog.jsonb_build_object('status', 'outdated');
  end if;

  -- Grab the job, since we need it for a short reference number.
  select job.*
    into v_job
  from public.jobs as job
  where job.id = v_change_order.job_id
    and job.business_id = v_change_order.business_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  select business.name
    into v_business_name
  from public.businesses as business
  where business.id = v_change_order.business_id;

  -- Gather all the lines (description, quantity in thousandths, price in cents) in a steady order.
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', line.id,
      'description', line.description,
      'quantity_milli', line.quantity_milli,
      'unit_price_cents', line.unit_price_cents
    )
    order by line.created_at, line.id
  )
    into v_lines
  from public.change_order_lines as line
  where line.business_id = v_change_order.business_id
    and line.change_order_id = v_change_order.id;

  -- Everything checks out, so we send back 'valid' with the company name, a short job reference, the reason, the total in cents and the lines.
  return pg_catalog.jsonb_build_object(
    'status', 'valid',
    'business_name', v_business_name,
    'job_reference', pg_catalog.left(v_job.id::text, 8),
    'reason', v_change_order.reason,
    'total_cents', v_change_order.total_cents,
    'lines', coalesce(v_lines, '[]'::jsonb)
  );
end;
$$;

-- Routine 4: records the customer's answer, approve or decline, from their link.
-- If anything looks off, it answers with a status word and changes nothing.
create or replace function public.decide_public_approval(
  p_token_hash text,
  p_decision text,
  p_approver_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_change_order public.change_orders%rowtype;
  -- One fixed 'now', so every time check and the recorded answer time agree.
  v_now timestamptz := pg_catalog.now();
  v_name text := pg_catalog.btrim(p_approver_name);
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  -- The answer has to be exactly 'approved' or 'declined'.
  if p_decision is null or p_decision not in ('approved', 'declined') then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  -- They have to type a name (it works like a signature), trimmed, and no longer than 120 characters.
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 120 then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  select approval.*
    into v_approval
  from public.approvals as approval
  -- Find the approval by its hashed link and lock it, so two quick clicks can't both record an answer.
  where approval.token_hash = p_token_hash
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  -- Already answered? Then we won't take a second answer.
  if v_approval.decision is not null then
    return pg_catalog.jsonb_build_object('status', 'already_decided');
  end if;

  select change_order.*
    into v_change_order
  from public.change_orders as change_order
  where change_order.id = v_approval.change_order_id
    and change_order.business_id = v_approval.business_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  -- An expired link gets turned away.
  if v_approval.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;
  if v_change_order.status <> 'sent'
    or v_change_order.version <> v_approval.version then
    return pg_catalog.jsonb_build_object('status', 'outdated');
  end if;

  -- Saving the answer, the name and the time. The 'decision is null' guard means only the first answer counts.
  update public.approvals
  set
    decision = p_decision,
    approver_name = v_name,
    decided_at = v_now
  where id = v_approval.id
    and decision is null;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'already_decided');
  end if;

  -- Setting the change order's status to the customer's answer, but only if it's still the same sent version.
  update public.change_orders
  set status = p_decision
  where id = v_change_order.id
    and business_id = v_change_order.business_id
    and status = 'sent'
    and version = v_approval.version;
  if not found then
    -- Safety net: if the change order shifted under us, the error undoes the answer too, so it's all-or-nothing.
    raise exception 'The change-order state changed while recording the decision.';
  end if;

  return pg_catalog.jsonb_build_object('status', 'decided');
end;
$$;

-- Permissions. The staff routines (send and undo) are for signed-in users only.
-- The two customer routines are open to logged-out visitors too, since the secret link is their key.
revoke all on function public.send_change_order_for_approval(uuid, text)
  from public, anon;
revoke all on function public.rollback_unsent_approval(uuid)
  from public, anon;
revoke all on function public.get_public_approval(text)
  from public, anon, authenticated;
revoke all on function public.decide_public_approval(text, text, text)
  from public, anon, authenticated;

grant execute on function public.send_change_order_for_approval(uuid, text)
  to authenticated;
grant execute on function public.rollback_unsent_approval(uuid)
  to authenticated;
grant execute on function public.get_public_approval(text)
  to anon, authenticated;
grant execute on function public.decide_public_approval(text, text, text)
  to anon, authenticated;
