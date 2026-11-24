-- Private member lists (founder, 24 Nov 2026; lib/private-members.ts).
-- With tenants.settings.private_members = true, only owners and platform admins read the company's members,
-- pending invites and other people's MCP tokens. Everyone else, managers included, reads only their own rows.
-- Managers in such a company no longer manage the team (they cannot see it); owners do.

create or replace function merch.members_private(p_tenant uuid) returns boolean language sql stable security definer set search_path = merch as $$
  select coalesce((select (settings->>'private_members')::boolean from merch.tenants where id = p_tenant), false);
$$;

-- May the signed-in person see who else is in this company?
create or replace function merch.sees_team(p_tenant uuid) returns boolean language sql stable security definer set search_path = merch as $$
  select merch.is_platform_admin() or merch.my_role(p_tenant) = 'owner' or not merch.members_private(p_tenant);
$$;

revoke execute on function merch.members_private(uuid) from public, anon;
revoke execute on function merch.sees_team(uuid) from public, anon;
grant execute on function merch.members_private(uuid) to authenticated, service_role;
grant execute on function merch.sees_team(uuid) to authenticated, service_role;

-- memberships: own row always (policy own_membership); the rest only when the person sees the team
drop policy if exists member_read on merch.memberships;
create policy member_read on merch.memberships for select using (
  (tenant_id in (select merch.my_tenants()) and merch.sees_team(tenant_id)) or merch.is_platform_admin());

-- the old manager_write was FOR ALL, which also let managers read every row; split it so writes carry the rule
drop policy if exists manager_write on merch.memberships;
create policy manager_insert on merch.memberships for insert with check (
  (merch.my_role(tenant_id) in ('owner','manager') and merch.sees_team(tenant_id)) or merch.is_platform_admin());
create policy manager_update on merch.memberships for update using (
  (merch.my_role(tenant_id) in ('owner','manager') and merch.sees_team(tenant_id)) or merch.is_platform_admin());
create policy manager_delete on merch.memberships for delete using (
  (merch.my_role(tenant_id) in ('owner','manager') and merch.sees_team(tenant_id)) or merch.is_platform_admin());

drop policy if exists manager_all on merch.invites;
create policy manager_all on merch.invites for all using (
  (merch.my_role(tenant_id) in ('owner','manager') and merch.sees_team(tenant_id)) or merch.is_platform_admin());

drop policy if exists own_read on merch.mcp_tokens;
create policy own_read on merch.mcp_tokens for select using (
  user_id = auth.uid()
  or (merch.my_role(tenant_id) in ('owner','manager') and merch.sees_team(tenant_id))
  or merch.is_platform_admin());

-- Meridian Sourcing: viewers, testers and managers see only themselves
update merch.tenants set settings = settings || '{"private_members": true}'::jsonb
 where id = '59c5420d-f539-4da8-98cf-603136f30c21';
