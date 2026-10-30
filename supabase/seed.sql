-- Sample data for Tinkr: 12 fake plumbing companies, each with an owner, one or two techs,
-- 4-6 customers, a price list and 4-10 jobs (with estimate lines). One job per company is paid and closed.
--
-- Safe to run again and again: every row has a fixed ID made from its name (md5 turned into a uuid),
-- and 'on conflict ... do update' refreshes a row that already exists instead of making a duplicate.
-- Everything between begin and commit is one all-or-nothing unit.
--
-- The sample logins (like valley.owner@example.com) are created here WITHOUT a password, so they
-- can't sign in yet. Set one with the separate 'seed_test_passwords' query in the Supabase SQL editor.
-- That's on purpose: a password should never be written into a file that goes into git.
begin;

-- The companies. Columns: number, short name (used in the login emails), name, city, phone area code,
-- sales tax rate (thousandths of a percent, so 7975 = 7.975%), how many jobs, how many techs.
create temporary table seed_company (
  n int primary key, slug text, name text, city text, area text, tax int, jobs int, techs int
) on commit drop;

insert into seed_company values
  (1,  'valley',    'Valley Plumbing',        'Fresno, CA',      '559', 7975,  6,  1),
  (2,  'summit',    'Summit Pipe Co',         'Reno, NV',        '775', 8265,  7,  1),
  (3,  'coastal',   'Coastal Flow Plumbing',  'San Diego, CA',   '619', 7750,  9,  2),
  (4,  'desert',    'Desert Drain Pros',      'Phoenix, AZ',     '602', 8600,  5,  1),
  (5,  'riverbend', 'Riverbend Plumbing',     'Sacramento, CA',  '916', 8750,  8,  2),
  (6,  'pinecrest', 'Pinecrest Pipe & Drain', 'Flagstaff, AZ',   '928', 9181,  4,  1),
  (7,  'harbor',    'Harbor Rooter',          'Long Beach, CA',  '562', 10250, 10, 2),
  (8,  'golden',    'Golden State Plumbing',  'Bakersfield, CA', '661', 8250,  6,  1),
  (9,  'inland',    'Inland Empire Plumbing', 'Riverside, CA',   '951', 8750,  7,  2),
  (10, 'bayleak',   'Bay Leak Experts',       'Oakland, CA',     '510', 10750, 5,  1),
  (11, 'mesa',      'Mesa Water Works',       'Mesa, AZ',        '480', 8300,  8,  2),
  (12, 'cascade',   'Cascade Plumbing',       'Portland, OR',    '503', 0,     4,  1);

-- The logins: one owner and one or two techs per company.
create temporary table seed_login (email text primary key, company int, role text) on commit drop;

insert into seed_login
select slug || '.owner@example.com', n, 'owner' from seed_company
union all
select slug || '.tech@example.com', n, 'tech' from seed_company
union all
select slug || '.tech2@example.com', n, 'tech' from seed_company where techs = 2;

-- Create each login in Supabase Auth, skipping any that already exist.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  md5('tinkr-seed-user-' || l.email)::uuid,
  'authenticated',
  'authenticated',
  l.email,
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '', '', '', ''
from seed_login as l
where not exists (select 1 from auth.users as u where lower(u.email) = l.email);

-- Supabase also wants an 'identity' row per login, saying it signs in with email.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from auth.users as u
join seed_login as l on lower(u.email) = l.email
where not exists (
  select 1 from auth.identities as i where i.user_id = u.id and i.provider = 'email'
);

-- The companies themselves, with their sales tax rate.
insert into public.businesses (id, name, tax_rate_millipercent)
select md5('tinkr-seed-business-' || slug)::uuid, name, tax
from seed_company
on conflict (id) do update
set name = excluded.name,
    tax_rate_millipercent = excluded.tax_rate_millipercent;

-- Putting each login on its company's team.
insert into public.members (business_id, user_id, role)
select md5('tinkr-seed-business-' || c.slug)::uuid, u.id, l.role
from seed_login as l
join seed_company as c on c.n = l.company
join auth.users as u on lower(u.email) = l.email
on conflict (business_id, user_id) do update
set role = excluded.role;

-- Customers: 4 to 6 per company, with made-up names, emails, phones and addresses.
create temporary table seed_customer on commit drop as
select
  c.n as company,
  c.slug,
  k,
  md5('tinkr-seed-customer-' || c.slug || '-' || k)::uuid as id,
  md5('tinkr-seed-business-' || c.slug)::uuid as business_id,
  (array['Mia','Carlos','Avery','Jordan','Sam','Taylor','Priya','Marcus','Elena',
         'Devon','Grace','Luis','Hannah','Omar','Chloe','Andre','Nina','Tyler'])[1 + ((c.n * 5 + k * 7) % 18)]
    || ' ' ||
  (array['Thompson','Rivera','Chen','Patel','Brooks','Nguyen','Garcia','Kim',
         'Walker','Lopez','Hughes','Martinez','Foster','Singh','Reyes','Coleman'])[1 + ((c.n * 3 + k * 11) % 16)]
    as name,
  '(' || c.area || ') 555-0' || lpad((c.n * 10 + k)::text, 3, '0') as phone,
  (100 + k * 37 + c.n * 13)::text || ' ' ||
  (array['Oak Street','Cedar Avenue','Willow Lane','Pine Road','River Street','Maple Drive',
         'Elm Court','Sunset Boulevard','Lakeview Way','Birch Place'])[1 + ((c.n + k * 3) % 10)]
    || ', ' || c.city as address
from seed_company as c
cross join generate_series(1, 4 + c.n % 3) as k;

insert into public.customers (id, business_id, name, email, phone, address)
select
  id,
  business_id,
  name,
  lower(replace(name, ' ', '.')) || '.' || slug || '@example.com',
  phone,
  address
from seed_customer
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address;

-- A price list for each company: the same 8 items, with prices nudged up or down a little per company.
-- Labor (priced per hour) isn't taxed; parts are.
insert into public.pricebook_items (id, business_id, name, unit, price_cents, taxable)
select
  md5('tinkr-seed-item-' || c.slug || '-' || i.k)::uuid,
  md5('tinkr-seed-business-' || c.slug)::uuid,
  i.name,
  i.unit,
  (round(i.base * (92 + (c.n * 7) % 17) / 100.0 / 50) * 50)::int,
  i.unit <> 'hour'
from seed_company as c
cross join (values
  (1, 'Standard kitchen faucet',     'each', 14500),
  (2, 'Plumbing labor',              'hour', 9500),
  (3, 'Flexible water connector',    'each', 1800),
  (4, 'Quarter-turn shutoff valve',  'each', 2750),
  (5, 'Drain cleaning labor',        'hour', 11000),
  (6, '40-gallon water heater',      'each', 89900),
  (7, 'Wax ring and toilet bolts',   'each', 1500),
  (8, 'Garbage disposal (1/2 HP)',   'each', 18900)
) as i(k, name, unit, base)
on conflict (id) do update
set name = excluded.name,
    unit = excluded.unit,
    price_cents = excluded.price_cents,
    taxable = excluded.taxable;

-- Jobs: each company gets its number of jobs (4 to 10). They rotate through the customers and techs,
-- every 5th job is left unassigned, and the newest job is paid and closed.
create temporary table seed_job on commit drop as
select
  c.n as company,
  c.slug,
  c.tax,
  j,
  md5('tinkr-seed-job-' || c.slug || '-' || j)::uuid as id,
  md5('tinkr-seed-business-' || c.slug)::uuid as business_id,
  md5('tinkr-seed-customer-' || c.slug || '-' || (1 + (j - 1) % (4 + c.n % 3)))::uuid as customer_id,
  case
    when j % 5 = 0 then null
    when c.techs = 2 and j % 2 = 0 then c.slug || '.tech2@example.com'
    else c.slug || '.tech@example.com'
  end as tech_email,
  (array['Replace leaking kitchen faucet','Repair water heater connection',
         'Clear slow-draining bathroom sink','Inspect noisy water pressure regulator',
         'Install new garbage disposal','Fix running toilet','Replace corroded shutoff valves',
         'Snake main sewer line','Replace 40-gallon water heater','Repair leak under bathroom vanity',
         'Reset and reseal toilet','Unclog kitchen drain','Replace washing machine supply hoses',
         'Locate and fix slab leak sound','Install outdoor hose bib','Repipe laundry room supply lines'])
    [1 + ((c.n * 3 + j * 5) % 16)] as description,
  (j = c.jobs) as paid,
  now() - make_interval(days => (c.jobs - j) * 4 + c.n % 3 + 1) as created_at
from seed_company as c
cross join generate_series(1, c.jobs) as j;

insert into public.jobs (
  id, business_id, customer_id, assigned_tech_id, status, description,
  created_at, paid_at, tax_rate_millipercent
)
select
  sj.id,
  sj.business_id,
  sj.customer_id,
  (select u.id from auth.users as u where lower(u.email) = sj.tech_email),
  case when sj.paid then 'closed' else 'open' end,
  sj.description,
  sj.created_at,
  case when sj.paid then sj.created_at + interval '2 days' end,
  case when sj.paid then sj.tax end
from seed_job as sj
on conflict (id) do update
set customer_id = excluded.customer_id,
    assigned_tech_id = excluded.assigned_tech_id,
    status = excluded.status,
    description = excluded.description,
    created_at = excluded.created_at,
    paid_at = excluded.paid_at,
    tax_rate_millipercent = excluded.tax_rate_millipercent;

-- Estimate lines: every job gets a part and some labor, and every 3rd job gets an extra part.
-- Prices and the taxable flag are copied from that company's price list.
-- Quantities are in thousandths (1000 = 1, 1500 = 1.5 hours).
insert into public.estimate_lines (
  id, business_id, job_id, description, quantity_milli, unit_price_cents, taxable
)
select
  md5('tinkr-seed-line-' || sj.slug || '-' || sj.j || '-' || l.slot)::uuid,
  sj.business_id,
  sj.id,
  p.name,
  case
    when p.unit = 'hour' then 1000 + 500 * ((sj.j + sj.company) % 6)
    when l.item_k in (3, 7) then 2000
    else 1000
  end,
  p.price_cents,
  p.taxable
from seed_job as sj
cross join lateral (values
  (1, (array[1, 3, 4, 6, 7, 8])[1 + (sj.j + sj.company) % 6]),
  (2, case when sj.j % 2 = 0 then 5 else 2 end),
  (3, case when sj.j % 3 = 0 then (array[3, 4, 7])[1 + sj.company % 3] end)
) as l(slot, item_k)
join public.pricebook_items as p
  on p.id = md5('tinkr-seed-item-' || sj.slug || '-' || l.item_k)::uuid
on conflict (id) do update
set description = excluded.description,
    quantity_milli = excluded.quantity_milli,
    unit_price_cents = excluded.unit_price_cents,
    taxable = excluded.taxable;

-- Save it all.
commit;

-- A quick summary so you can see what's there.
select
  b.name as company,
  (select count(*) from public.members as m where m.business_id = b.id) as team,
  (select count(*) from public.customers as cu where cu.business_id = b.id) as customers,
  (select count(*) from public.jobs as jo where jo.business_id = b.id) as jobs,
  (select count(*) from public.estimate_lines as el where el.business_id = b.id) as estimate_lines
from public.businesses as b
order by b.name;
