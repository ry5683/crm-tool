-- 010: Declines now carry a reason. The customer picks one from a fixed list and may add a note
-- (required for 'other'), up to 300 characters. Run after 006.
alter table public.approvals
  add column decline_reason text
    check (decline_reason in ('too_expensive', 'not_needed', 'other_quote', 'need_to_discuss', 'other')),
  add column decline_note text
    check (decline_note is null or pg_catalog.char_length(decline_note) <= 300),
  -- Approved answers never carry a reason; declined ones always do.
  add constraint approvals_decline_reason_matches_decision check (
    (decision = 'declined' and decline_reason is not null)
    or (coalesce(decision, 'approved') = 'approved' and decline_reason is null and decline_note is null)
    or decision is null and decline_reason is null and decline_note is null
  ) not valid;

-- Replace the 3-argument routine with one that takes the reason and note.
drop function if exists public.decide_public_approval(text, text, text);

create or replace function public.decide_public_approval(
  p_token_hash text,
  p_decision text,
  p_approver_name text,
  p_decline_reason text default null,
  p_decline_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_change_order public.change_orders%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_name text := pg_catalog.btrim(p_approver_name);
  v_note text := nullif(pg_catalog.btrim(p_decline_note), '');
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if p_decision is null or p_decision not in ('approved', 'declined') then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 120 then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if p_decision = 'declined' then
    if p_decline_reason is null
      or p_decline_reason not in ('too_expensive', 'not_needed', 'other_quote', 'need_to_discuss', 'other')
      or (v_note is not null and pg_catalog.char_length(v_note) > 300)
      or (p_decline_reason = 'other' and v_note is null) then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
  else
    v_note := null;
    if p_decline_reason is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
  end if;

  select approval.*
    into v_approval
  from public.approvals as approval
  where approval.token_hash = p_token_hash
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

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

  if v_approval.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;
  if v_change_order.status <> 'sent'
    or v_change_order.version <> v_approval.version then
    return pg_catalog.jsonb_build_object('status', 'outdated');
  end if;

  update public.approvals
  set
    decision = p_decision,
    approver_name = v_name,
    decided_at = v_now,
    decline_reason = case when p_decision = 'declined' then p_decline_reason end,
    decline_note = v_note
  where id = v_approval.id
    and decision is null;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'already_decided');
  end if;

  update public.change_orders
  set status = p_decision
  where id = v_change_order.id
    and business_id = v_change_order.business_id
    and status = 'sent'
    and version = v_approval.version;
  if not found then
    raise exception 'The change-order state changed while recording the decision.';
  end if;

  return pg_catalog.jsonb_build_object('status', 'decided');
end;
$$;

revoke all on function public.decide_public_approval(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_public_approval(text, text, text, text, text)
  to anon, authenticated;
