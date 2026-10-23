-- 008: Team management. Two saved routines that let a business owner change a teammate's role or remove them.
-- The members table has no "edit" door for regular users (on purpose), so these routines open exactly two narrow ones.
-- Both run as "security definer", meaning they use the database's own permissions, and so each one checks for itself
-- that the person asking is an owner of the same business.
--
-- Routine 1: change someone's role between owner and tech.
create or replace function public.set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The business the caller owns.
  v_business_id uuid;
  v_current_role text;
begin
  -- Only the two real roles are allowed.
  if p_role not in ('owner', 'tech') then
    raise exception 'Role must be owner or tech.';
  end if;

  -- Find the business the caller owns. No business means they're not an owner, so we stop.
  select member.business_id
    into v_business_id
  from public.members as member
  where member.user_id = (select auth.uid())
    and member.role = 'owner'
  order by member.created_at asc
  limit 1;
  if v_business_id is null then
    raise exception 'Only a business owner can change roles.';
  end if;

  -- Lock the target teammate's row so two changes can't collide.
  select member.role
    into v_current_role
  from public.members as member
  where member.business_id = v_business_id
    and member.user_id = p_user_id
  for update;
  if not found then
    raise exception 'That person is not on your team.';
  end if;

  -- Never let the business end up with no owner at all.
  if v_current_role = 'owner' and p_role = 'tech' and (
    select count(*)
    from public.members as member
    where member.business_id = v_business_id
      and member.role = 'owner'
  ) <= 1 then
    raise exception 'A business needs at least one owner.';
  end if;

  update public.members
  set role = p_role
  where business_id = v_business_id
    and user_id = p_user_id;
end;
$$;

-- Routine 2: remove someone from the team. Their assigned jobs become "not assigned" first, so no job is left pointing at a person who's gone.
create or replace function public.remove_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  select member.business_id
    into v_business_id
  from public.members as member
  where member.user_id = (select auth.uid())
    and member.role = 'owner'
  order by member.created_at asc
  limit 1;
  if v_business_id is null then
    raise exception 'Only a business owner can remove team members.';
  end if;

  -- You can't remove yourself here, which also protects the last owner.
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot remove yourself from the team.';
  end if;

  perform 1
  from public.members as member
  where member.business_id = v_business_id
    and member.user_id = p_user_id
  for update;
  if not found then
    raise exception 'That person is not on your team.';
  end if;

  -- Hand their jobs back to "not assigned", then remove them.
  update public.jobs
  set assigned_tech_id = null
  where business_id = v_business_id
    and assigned_tech_id = p_user_id;

  delete from public.members
  where business_id = v_business_id
    and user_id = p_user_id;
end;
$$;

-- Only signed-in people can even try these routines, and each one re-checks ownership inside.
revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
