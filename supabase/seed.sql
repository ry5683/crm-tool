-- Sample data for the Change Orders learning project.
-- Create these four users in Supabase Authentication before running this file:
-- valley.owner@example.com, valley.tech@example.com,
-- summit.owner@example.com, summit.tech@example.com.

-- Sample data so you can try things out. It's safe to run again and again: 'on conflict ... do update'
-- refreshes a row that already exists instead of making a duplicate. The IDs are fixed so rows can point at each other.
-- Everything between begin and commit is one all-or-nothing unit.
begin;

-- A safety check first: we stop with a clear message unless all four sample logins exist, since the team and job rows need them.
do $$
begin
  if (
    select count(distinct lower(email))
    from auth.users
    where lower(email) in (
      'valley.owner@example.com',
      'valley.tech@example.com',
      'summit.owner@example.com',
      'summit.tech@example.com'
    )
  ) <> 4 then
    raise exception
      'Create all four sample users in Supabase Auth before running supabase/seed.sql.';
  end if;
end;
$$;

-- Two sample companies, so you can check that one can't see the other's stuff.
insert into public.businesses (id, name)
values
  ('10000000-0000-4000-8000-000000000001', 'Valley Plumbing'),
  ('10000000-0000-4000-8000-000000000002', 'Summit Pipe Co')
on conflict (id) do update
set name = excluded.name;

-- Putting each sample login on its company's team, one owner and one tech each. They're matched up by email.
insert into public.members (business_id, user_id, role)
select seed.business_id, users.id, seed.role
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'valley.owner@example.com', 'owner'),
    ('10000000-0000-4000-8000-000000000001'::uuid, 'valley.tech@example.com', 'tech'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'summit.owner@example.com', 'owner'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'summit.tech@example.com', 'tech')
) as seed(business_id, email, role)
join auth.users as users
  on lower(users.email) = seed.email
on conflict (business_id, user_id) do update
set role = excluded.role;

-- Three sample customers for each company.
insert into public.customers (id, business_id, name, email, phone, address)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Mia Thompson', 'mia.thompson@example.com', '555-0101', '18 Oak Street, Fresno, CA'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Carlos Rivera', 'carlos.rivera@example.com', '555-0102', '42 Cedar Avenue, Fresno, CA'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Avery Chen', 'avery.chen@example.com', '555-0103', '7 Willow Lane, Clovis, CA'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Jordan Patel', 'jordan.patel@example.com', '555-0201', '105 Pine Road, Reno, NV'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Sam Brooks', 'sam.brooks@example.com', '555-0202', '26 River Street, Sparks, NV'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Taylor Nguyen', 'taylor.nguyen@example.com', '555-0203', '311 Summit Drive, Reno, NV')
on conflict (id) do update
set business_id = excluded.business_id,
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address;

-- Sample jobs, two per company. They're open and each is assigned to that company's tech.
insert into public.jobs (
  id,
  business_id,
  customer_id,
  assigned_tech_id,
  status,
  description
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    (select id from auth.users where lower(email) = 'valley.tech@example.com'),
    'open',
    'Replace leaking kitchen faucet'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    (select id from auth.users where lower(email) = 'valley.tech@example.com'),
    'open',
    'Repair water heater connection'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000004',
    (select id from auth.users where lower(email) = 'summit.tech@example.com'),
    'open',
    'Clear slow-draining bathroom sink'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000005',
    (select id from auth.users where lower(email) = 'summit.tech@example.com'),
    'open',
    'Inspect noisy water pressure regulator'
  )
on conflict (id) do update
set business_id = excluded.business_id,
    customer_id = excluded.customer_id,
    assigned_tech_id = excluded.assigned_tech_id,
    status = excluded.status,
    description = excluded.description;

-- Sample estimate lines. Quantities are in thousandths (1000 = 1, 1500 = 1.5) and prices in cents (14500 = $145.00).
insert into public.estimate_lines (
  id,
  business_id,
  job_id,
  description,
  quantity_milli,
  unit_price_cents
)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Kitchen faucet', 1000, 14500),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Installation labor', 1500, 9500),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Flexible water connector', 2000, 1800),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Water heater service labor', 1000, 11000),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Drain cleaning labor', 1000, 12500),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Sink trap kit', 1000, 2400),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Pressure regulator inspection', 1000, 8900),
  ('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Pressure gauge', 1000, 3200)
on conflict (id) do update
set business_id = excluded.business_id,
    job_id = excluded.job_id,
    description = excluded.description,
    quantity_milli = excluded.quantity_milli,
    unit_price_cents = excluded.unit_price_cents;

-- A sample price list for each company, prices in cents. Summit's prices are a bit different from Valley's.
insert into public.pricebook_items (id, business_id, name, unit, price_cents)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Standard kitchen faucet', 'each', 14500),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Plumbing labor', 'hour', 9500),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Flexible water connector', 'each', 1800),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Quarter-turn shutoff valve', 'each', 2750),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Drain cleaning labor', 'hour', 11000),
  ('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Standard kitchen faucet', 'each', 15200),
  ('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'Plumbing labor', 'hour', 10500),
  ('50000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'Flexible water connector', 'each', 1950),
  ('50000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'Quarter-turn shutoff valve', 'each', 2900),
  ('50000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'Drain cleaning labor', 'hour', 12000)
on conflict (id) do update
set business_id = excluded.business_id,
    name = excluded.name,
    unit = excluded.unit,
    price_cents = excluded.price_cents;

-- Save it all.
commit;
