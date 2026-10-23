-- 003: Security. This is where row-level security (RLS) gets set up. Picture a lock on every table
-- that checks who's asking before it shows or changes a row. It's what keeps Valley Plumbing
-- from ever peeking at Summit Pipe Co's customers, jobs or prices.
--
-- We start with a few helper routines. A 'schema' is like a separate drawer, and this 'private'
-- one is kept away from the public website so nobody can tamper with the helpers.
create schema if not exists private;
-- First, nobody gets into that drawer...
revoke all on schema private from public, anon, authenticated;
-- ...then we let signed-in users reach in. Logged-out visitors stay out.
grant usage on schema private to authenticated;

-- Helper 1: answers yes or no to 'is the person signed in right now on this company's team?'
-- It's a security definer, which just means it can peek at the members list even though the lock would normally hide it.
create or replace function private.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Helper 2: same question, but it only says yes if they're an owner. We use it for owner-only stuff like the price list.
create or replace function private.is_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as m
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Helper 3: 'can this person edit this change order's lines?' Yes only if they're on the team
-- and the change order is still a draft. Once it's sent, it's frozen, so nobody can quietly
-- change what the customer agreed to.
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
    join public.members as m
      on m.business_id = co.business_id
    where co.business_id = target_business_id
      and co.id = target_change_order_id
      and co.status = 'draft'
      and m.user_id = (select auth.uid())
  );
$$;

-- Only signed-in users can run these helpers. Logged-out visitors (anon) can't.
revoke all on function private.is_business_member(uuid) from public, anon;
revoke all on function private.is_business_owner(uuid) from public, anon;
revoke all on function private.can_edit_change_order(uuid, uuid) from public, anon;
grant execute on function private.is_business_member(uuid) to authenticated;
grant execute on function private.is_business_owner(uuid) to authenticated;
grant execute on function private.can_edit_change_order(uuid, uuid) to authenticated;

-- Now we flip the lock on for every table. With the lock on, you get nothing
-- unless a policy below says you can. Each policy is a rule that opens one specific door.
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.pricebook_items enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.change_orders enable row level security;
alter table public.change_order_lines enable row level security;
alter table public.approvals enable row level security;

-- Policies, in plain terms: 'select' means look, 'insert' means add, 'update' means change, 'delete' means remove.
-- 'Using' decides which existing rows you can touch, and 'with check' tests what you're trying to save.
--
-- Businesses: team members can see their own company, and that's it. Nobody can add or change companies from here.
create policy businesses_select_for_members
  on public.businesses
  for select
  to authenticated
  using (private.is_business_member(id));

-- Members: you can see the team roster for your own company only. No editing it from the app.
create policy members_select_for_members
  on public.members
  for select
  to authenticated
  using (private.is_business_member(business_id));

-- Customers: anyone on the team, owner or tech, can look at, add, change and delete their own company's customers.
create policy customers_manage_for_members
  on public.customers
  for all
  to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

-- Jobs: same deal. Anyone on the team can do everything with their own company's jobs.
create policy jobs_manage_for_members
  on public.jobs
  for all
  to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

-- Price list: everyone on the team can look at it...
create policy pricebook_select_for_members
  on public.pricebook_items
  for select
  to authenticated
  using (private.is_business_member(business_id));

-- ...but only owners can add, change or remove prices, so a tech can't quietly change what jobs cost.
create policy pricebook_manage_for_owners
  on public.pricebook_items
  for all
  to authenticated
  using (private.is_business_owner(business_id))
  with check (private.is_business_owner(business_id));

-- Estimate lines: anyone on the team can look at, add, change and delete their company's estimate lines.
create policy estimate_lines_manage_for_members
  on public.estimate_lines
  for all
  to authenticated
  using (private.is_business_member(business_id))
  with check (private.is_business_member(business_id));

-- Change orders: anyone on the team can look at their company's, whatever status they're in.
create policy change_orders_select_for_members
  on public.change_orders
  for select
  to authenticated
  using (private.is_business_member(business_id));

-- You can only start a new change order as a draft. You can't create one that's already marked 'sent' or 'approved'.
create policy change_orders_insert_as_draft
  on public.change_orders
  for insert
  to authenticated
  with check (
    private.is_business_member(business_id)
    and status = 'draft'
  );

-- You can edit one only while it's a draft, and it has to still be a draft afterward. Sending and approving go through the saved routines in 006.
create policy change_orders_update_as_draft
  on public.change_orders
  for update
  to authenticated
  using (
    private.is_business_member(business_id)
    and status = 'draft'
  )
  with check (
    private.is_business_member(business_id)
    and status = 'draft'
  );

-- Only drafts can be deleted. Once it's gone out to the customer, we keep it on record.
create policy change_orders_delete_as_draft
  on public.change_orders
  for delete
  to authenticated
  using (
    private.is_business_member(business_id)
    and status = 'draft'
  );

-- Change order lines: anyone on the team can look at their company's lines.
create policy change_order_lines_select_for_members
  on public.change_order_lines
  for select
  to authenticated
  using (private.is_business_member(business_id));

-- Adding, changing or deleting lines is only allowed while the change order is still a draft. Helper 3 above does that check.
create policy change_order_lines_insert_for_drafts
  on public.change_order_lines
  for insert
  to authenticated
  with check (
    private.can_edit_change_order(business_id, change_order_id)
  );

create policy change_order_lines_update_for_drafts
  on public.change_order_lines
  for update
  to authenticated
  using (
    private.can_edit_change_order(business_id, change_order_id)
  )
  with check (
    private.can_edit_change_order(business_id, change_order_id)
  );

create policy change_order_lines_delete_for_drafts
  on public.change_order_lines
  for delete
  to authenticated
  using (
    private.can_edit_change_order(business_id, change_order_id)
  );

-- Approvals: the team can look at their company's approval requests, but there's no add, change or delete rule.
-- So the app can't touch them directly; only the saved routines in 006 can.
create policy approvals_select_for_members
  on public.approvals
  for select
  to authenticated
  using (private.is_business_member(business_id));
