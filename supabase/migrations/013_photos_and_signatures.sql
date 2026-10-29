-- 013: Photos on change orders, and the customer's signature on approvals.
--
-- Where the files live: two PRIVATE storage folders ("buckets") in Supabase.
--   change-order-photos   one folder per company, then per change order
--   approval-signatures   one small picture per approval
-- Nobody can read or write these folders directly from a browser: there are no storage rules
-- that let users in. Only our server can, with the master key, and only after the database
-- routines below say yes. Pictures are shown through links that stop working after a few minutes.
-- Run this after 001 to 012.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('change-order-photos', 'change-order-photos', false, 4194304, array['image/jpeg']),
  ('approval-signatures', 'approval-signatures', false, 262144, array['image/png'])
on conflict (id) do nothing;

-- One row = one photo on one change order. The file itself is in the storage folder at storage_path.
create table if not exists public.change_order_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  change_order_id uuid not null,
  -- '<business id>/<change order id>/<random id>.jpg'. Made by the database, never typed by a user.
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  -- Same-company double lock as everywhere else. If a draft change order is deleted, its photo rows go too.
  foreign key (business_id, change_order_id)
    references public.change_orders (business_id, id) on delete cascade
);

create index if not exists change_order_photos_business_id_change_order_id_idx
  on public.change_order_photos (business_id, change_order_id);

-- Lock on: team members can look at their company's photo rows. No add, change or delete rule,
-- so the only way in is through the two routines below.
alter table public.change_order_photos enable row level security;
drop policy if exists change_order_photos_select_for_members on public.change_order_photos;
create policy change_order_photos_select_for_members
  on public.change_order_photos for select to authenticated
  using (private.is_business_member(business_id));
revoke insert, update, delete on public.change_order_photos from anon, authenticated;

-- Where the approval's signature picture is stored ('<random id>.png'). Empty for declines.
alter table public.approvals
  add column if not exists signature_path text;

-- Saves a spot for one new photo and hands back where the server should put the file.
-- Checks: you're on the team, the change order is still a draft (photos freeze once it's sent,
-- just like its lines), and it has fewer than 6 photos.
create or replace function public.add_change_order_photo(p_change_order_id uuid)
returns table (photo_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change_order public.change_orders%rowtype;
  v_photo_id uuid := gen_random_uuid();
  v_path text;
begin
  select change_order.*
    into v_change_order
  from public.change_orders as change_order
  where change_order.id = p_change_order_id
  for update;

  if not found or not private.is_business_member(v_change_order.business_id) then
    raise exception 'That change order is not available to your account.';
  end if;
  if v_change_order.status <> 'draft' then
    raise exception 'Photos can only be added before the change order is sent.';
  end if;
  if (
    select count(*)
    from public.change_order_photos as photo
    where photo.business_id = v_change_order.business_id
      and photo.change_order_id = v_change_order.id
  ) >= 6 then
    raise exception 'A change order can have up to 6 photos.';
  end if;

  v_path := v_change_order.business_id::text || '/' || v_change_order.id::text || '/' || v_photo_id::text || '.jpg';

  insert into public.change_order_photos (id, business_id, change_order_id, storage_path)
  values (v_photo_id, v_change_order.business_id, v_change_order.id, v_path);

  return query select v_photo_id, v_path;
end;
$$;

-- Removes one photo from a draft change order and hands back its file's location, so the
-- server can delete the file too.
create or replace function public.remove_change_order_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.change_order_photos%rowtype;
begin
  select photo.*
    into v_photo
  from public.change_order_photos as photo
  where photo.id = p_photo_id
  for update;

  if not found or not private.is_business_member(v_photo.business_id) then
    raise exception 'That photo is not available to your account.';
  end if;
  if not exists (
    select 1
    from public.change_orders as change_order
    where change_order.business_id = v_photo.business_id
      and change_order.id = v_photo.change_order_id
      and change_order.status = 'draft'
  ) then
    raise exception 'Photos can only be removed before the change order is sent.';
  end if;

  delete from public.change_order_photos where id = v_photo.id;
  return v_photo.storage_path;
end;
$$;

revoke all on function public.add_change_order_photo(uuid) from public, anon;
revoke all on function public.remove_change_order_photo(uuid) from public, anon;
grant execute on function public.add_change_order_photo(uuid) to authenticated;
grant execute on function public.remove_change_order_photo(uuid) to authenticated;

-- The customer's approval page now also gets the photo locations. Same as 006 otherwise.
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
  v_photos jsonb;
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
  -- New in 013: the change order's photos, as private storage paths. The server turns these
  -- into short-lived links; the paths alone can't open anything.
  select pg_catalog.jsonb_agg(photo.storage_path order by photo.created_at, photo.id)
    into v_photos
  from public.change_order_photos as photo
  where photo.business_id = v_change_order.business_id
    and photo.change_order_id = v_change_order.id;

  return pg_catalog.jsonb_build_object(
    'status', 'valid',
    'business_name', v_business_name,
    'job_reference', pg_catalog.left(v_job.id::text, 8),
    'reason', v_change_order.reason,
    'total_cents', v_change_order.total_cents,
    'lines', coalesce(v_lines, '[]'::jsonb),
    'photos', coalesce(v_photos, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_approval(text) from public, anon, authenticated;
grant execute on function public.get_public_approval(text) to anon, authenticated;

-- Recording the decision now requires a signature to approve. Same as 010 otherwise.
-- The old version (without the signature) is removed so it can't be used to skip signing.
drop function if exists public.decide_public_approval(text, text, text, text, text);

create or replace function public.decide_public_approval(
  p_token_hash text,
  p_decision text,
  p_approver_name text,
  p_decline_reason text default null,
  p_decline_note text default null,
  p_signature_path text default null
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
    -- Declining needs no signature.
    if p_signature_path is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
  else
    v_note := null;
    if p_decline_reason is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
    -- New in 013: approving needs a signature, saved by the server as '<random id>.png'.
    if p_signature_path is null
      or p_signature_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$' then
      return pg_catalog.jsonb_build_object('status', 'signature_required');
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
    decline_note = v_note,
    signature_path = case when p_decision = 'approved' then p_signature_path end
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

revoke all on function public.decide_public_approval(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_public_approval(text, text, text, text, text, text)
  to anon, authenticated;
