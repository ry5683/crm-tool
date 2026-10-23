-- 001: This file builds every table the app keeps its info in.
-- Think of each table as a spreadsheet tab: one tab per kind of thing, one row per record.
-- Foreign keys are the glue that ties records together, like a job pointing at its customer.
-- Two habits to know: money is stored in whole cents ($145.00 = 14500) so nothing gets
-- rounded oddly, and quantities in thousandths (1 unit = 1000, so 1.5 hours = 1500).
--
-- First tab: businesses. One row = one plumbing company using the app.
create table public.businesses (
  -- Every row gets its own random ID, like a work-order number nobody could guess. The database fills it in for you.
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- A timestamp for when the record was made. Filled in automatically.
  created_at timestamptz not null default now()
);

-- Members: one row = one person on one company's team, plus their role.
-- It's how the app knows who works for whom.
create table public.members (
  -- Which company they're on. 'Cascade' means if the company is ever deleted, its team rows get cleaned up too.
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Which login account this is. Those accounts live in Supabase's built-in sign-in system.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Are they an owner or a tech? The check only lets those two words in, so a typo gets bounced.
  role text not null check (role in ('owner', 'tech')),
  created_at timestamptz not null default now(),
  -- The pair of company + person has to be unique, so nobody's listed twice on the same team.
  primary key (business_id, user_id)
);

-- Customers: one row = one of a company's customers, the folks you do the work for.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  name text not null,
  -- Email, phone and address can be left blank. You will need an email later though, to send a change order for approval.
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

-- Jobs: one row = one job a company is doing for a customer.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  -- Who the job's for. The link is spelled out in the foreign key further down.
  customer_id uuid not null,
  -- Which tech got the job. It can stay empty until someone's assigned.
  assigned_tech_id uuid,
  -- Where the job stands. New jobs start out 'open'.
  status text not null default 'open',
  description text not null,
  created_at timestamptz not null default now(),
  -- This looks redundant (the id is already unique), but it lets other tables link on company AND id together.
  -- That way a record can never end up pointing at a different company's customer.
  unique (business_id, id),
  -- These two links are double-locked: the customer has to exist AND belong to this same company.
  -- Same deal for the assigned tech, who has to be on this company's team.
  foreign key (business_id, customer_id)
    references public.customers (business_id, id),
  foreign key (business_id, assigned_tech_id)
    references public.members (business_id, user_id)
);

-- Pricebook: one row = one thing on a company's price list, like a part or an hour of labor.
create table public.pricebook_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  name text not null,
  -- What you're counting, like 'each' or 'hour'.
  unit text not null,
  -- Price for one unit, in whole cents ($95.00 = 9500). Zero or negative prices get refused.
  price_cents integer not null check (price_cents > 0),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

-- Estimate lines: one row = one line on the original quote for a job,
-- like 'Kitchen faucet, 1 each, $145.00'.
create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  job_id uuid not null,
  description text not null,
  -- How many, in thousandths: 1 unit = 1000, 1.5 hours = 1500. Has to be more than zero.
  quantity_milli integer not null check (quantity_milli > 0),
  -- Price for one unit, in cents. Has to be more than zero.
  unit_price_cents integer not null check (unit_price_cents > 0),
  created_at timestamptz not null default now(),
  -- Ties the line to its job, and only a job from the same company.
  foreign key (business_id, job_id)
    references public.jobs (business_id, id)
);

-- Change orders: one row = one 'hey, we need to add or change work on this job' form
-- that the customer has to okay before you go ahead.
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  job_id uuid not null,
  -- A plain-words explanation of why the extra work is needed.
  reason text not null,
  -- Which revision this is. It starts at 1, and an approval link is tied to one specific version.
  version integer not null default 1 check (version > 0),
  -- Where it is in its life: draft (still editable), sent (waiting on the customer),
  -- then approved or declined. The check below only allows those four words.
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'declined')),
  -- The grand total of all its lines, in whole cents.
  total_cents integer not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  -- Ties the change order to its job, same company only.
  foreign key (business_id, job_id)
    references public.jobs (business_id, id)
);

-- Change order lines: one row = one item (a part or some labor) on a change order.
create table public.change_order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  change_order_id uuid not null,
  description text not null,
  -- How many, in thousandths again (1 unit = 1000).
  quantity_milli integer not null check (quantity_milli > 0),
  -- Price per unit in cents. It's copied from the price list when the line's made, so a later price change won't rewrite an old change order.
  unit_price_cents integer not null check (unit_price_cents > 0),
  created_at timestamptz not null default now(),
  -- Ties the line to its change order, same company only.
  foreign key (business_id, change_order_id)
    references public.change_orders (business_id, id)
);

-- Approvals: one row = one 'please approve this' request sent to a customer,
-- and later on, what they answered.
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  change_order_id uuid not null,
  -- Which version of the change order this request was for.
  version integer not null check (version > 0),
  -- The customer's link has a secret code in it, and we only keep a scrambled fingerprint (a hash) of it.
  -- So even someone reading the database couldn't use it to open the link. 'Unique' means no two match.
  token_hash text not null unique,
  -- After this moment, the link stops working.
  expires_at timestamptz not null,
  -- When the customer answered. Empty until they do.
  decided_at timestamptz,
  -- The name the customer typed in when they answered.
  approver_name text,
  -- Their answer, either 'approved' or 'declined'. Empty while we're still waiting.
  decision text check (decision in ('approved', 'declined')),
  created_at timestamptz not null default now(),
  -- Ties the approval to its change order, same company only.
  foreign key (business_id, change_order_id)
    references public.change_orders (business_id, id),
  -- The three answer fields travel together: either all blank (still waiting) or all filled in (answered).
  -- A half-recorded answer gets refused.
  check (
    (decision is null and decided_at is null and approver_name is null)
    or
    (decision is not null and decided_at is not null and approver_name is not null)
  )
);

-- Indexes are like the tab dividers in a binder. They help the database jump straight to the right rows
-- (by company, then name, date and so on) instead of paging through everything. They only change speed, never your data.
create index customers_business_id_name_idx
  on public.customers (business_id, name);
create index jobs_business_id_created_at_idx
  on public.jobs (business_id, created_at desc);
create index jobs_business_id_customer_id_idx
  on public.jobs (business_id, customer_id);
create index jobs_business_id_assigned_tech_id_idx
  on public.jobs (business_id, assigned_tech_id);
create index pricebook_items_business_id_name_idx
  on public.pricebook_items (business_id, name);
create index estimate_lines_business_id_job_id_idx
  on public.estimate_lines (business_id, job_id);
create index change_orders_business_id_job_id_idx
  on public.change_orders (business_id, job_id);
create index change_order_lines_business_id_change_order_id_idx
  on public.change_order_lines (business_id, change_order_id);
create index approvals_business_id_change_order_id_idx
  on public.approvals (business_id, change_order_id);
