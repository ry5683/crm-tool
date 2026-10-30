-- Test for 014: act as a Harbor Rooter tech, then the owner, and record what each can see.
-- Needs the seed data. Run it in the Supabase SQL editor; the test job it creates is deleted again at the end.
-- Expected: tech sees only their jobs (0 others), 0 estimate lines on others' jobs, the whole customer list,
-- a new job lands on themselves even when they picked tech2, the owner sees every Harbor job, and 0 leftovers.
begin;

create temporary table test_ids as
select email, id from auth.users
where email in ('harbor.tech@example.com', 'harbor.tech2@example.com', 'harbor.owner@example.com');
create temporary table test_results (step serial, check_name text, result text);
create temporary table test_new_job (id uuid);
grant select on test_ids to authenticated;
grant all on test_results, test_new_job to authenticated;
grant usage on sequence test_results_step_seq to authenticated;

-- As the tech.
select set_config('request.jwt.claims',
  (select json_build_object('sub', id, 'role', 'authenticated')::text from test_ids where email = 'harbor.tech@example.com'), true);
set local role authenticated;

insert into test_results (check_name, result)
select 'tech: jobs visible', count(*)::text from public.jobs;
insert into test_results (check_name, result)
select 'tech: visible jobs NOT assigned to them (should be 0)', count(*)::text
from public.jobs where assigned_tech_id is distinct from auth.uid();
insert into test_results (check_name, result)
select 'tech: estimate lines on other people''s jobs (should be 0)', count(*)::text
from public.estimate_lines as el
where not exists (select 1 from public.jobs as j where j.id = el.job_id and j.assigned_tech_id = auth.uid());
insert into test_results (check_name, result)
select 'tech: customers visible (whole team list)', count(*)::text from public.customers;

-- The tech creates ONE job and picks the OTHER tech.
insert into test_new_job (id)
select public.create_job_with_estimate(
  (select m.business_id from public.members as m where m.user_id = auth.uid()),
  (select c.id from public.customers as c order by c.id limit 1),
  null, null, null, null,
  'TEST JOB from 014 test',
  (select t2.id from test_ids as t2 where t2.email = 'harbor.tech2@example.com'),
  '[{"description":"Test line","quantity_milli":1000,"unit_price_cents":100}]'::jsonb
);

-- It should end up assigned to the tech who made it, and they should still see it.
insert into test_results (check_name, result)
select 'tech: new job (picked tech2) is assigned to', t.email
from public.jobs as j join test_ids as t on t.id = j.assigned_tech_id
where j.id = (select id from test_new_job);

-- As the owner.
reset role;
select set_config('request.jwt.claims',
  (select json_build_object('sub', id, 'role', 'authenticated')::text from test_ids where email = 'harbor.owner@example.com'), true);
set local role authenticated;

insert into test_results (check_name, result)
select 'owner: jobs visible (Harbor has 10, plus the 1 test job)', count(*)::text from public.jobs;

-- Clean up the test job.
reset role;
delete from public.estimate_lines where job_id in (select id from public.jobs where description = 'TEST JOB from 014 test');
delete from public.jobs where description = 'TEST JOB from 014 test';

commit;

insert into test_results (check_name, result)
select 'leftover test jobs (should be 0)', count(*)::text from public.jobs where description = 'TEST JOB from 014 test';

select check_name, result from test_results order by step;
