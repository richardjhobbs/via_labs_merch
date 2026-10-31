-- 0006: confidentiality by construction.
-- VIA Labs staff (platform admins) see nothing inside a company's records: parties, orders, milestones,
-- conversations, drafts, ledger, agent runs. They see only what is needed to run the service: the company,
-- its members and invites, gates, agent names, usage and cost. To read records, for troubleshooting or
-- set-up, an owner or manager of the company grants time-limited support access (72 hours, revocable,
-- written to the company's ledger). The database policies enforce this, not the app.

create table merch.support_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','granted','declined','revoked')),
  reason text not null,
  requested_by uuid,                              -- VIA staff user, null when an owner grants unasked
  requested_by_email text,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  expires_at timestamptz,                         -- set when granted
  opened_at timestamptz,                          -- first time VIA staff opened the workspace under this grant
  ended_by text,                                  -- who revoked (company member name or 'VIA Labs')
  ended_at timestamptz
);
create index support_access_tenant_idx on merch.support_access (tenant_id, status, expires_at);

create or replace function merch.has_support_access(p_tenant uuid) returns boolean language sql stable security definer set search_path = merch as $$
  select merch.is_platform_admin() and exists (
    select 1 from merch.support_access
    where tenant_id = p_tenant and status = 'granted' and expires_at > now()
  );
$$;

-- Content tables: members of the company, or VIA staff under an active grant. Replaces the blanket
-- "or merch.is_platform_admin()" from 0001 on these tables only. tenants, memberships, invites, gates,
-- agents, channels, usage_daily, sessions and access_requests keep their 0001 policies (service metadata).
do $$
declare t text;
begin
  for t in select unnest(array['parties','contacts','orders','milestones','threads','messages','attachments','drafts','ledger','agent_runs','agent_requests']) loop
    execute format('drop policy if exists member_read on merch.%I', t);
    execute format('create policy member_read on merch.%I for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id))', t);
  end loop;
  for t in select unnest(array['parties','contacts','orders','milestones','threads','messages','attachments','drafts','agent_requests']) loop
    execute format('drop policy if exists member_write on merch.%I', t);
    execute format('drop policy if exists member_update on merch.%I', t);
    execute format('create policy member_write on merch.%I for insert with check (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics'') or merch.has_support_access(tenant_id))', t);
    execute format('create policy member_update on merch.%I for update using (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics'') or merch.has_support_access(tenant_id))', t);
  end loop;
end $$;

alter table merch.support_access enable row level security;
create policy member_read on merch.support_access for select using (tenant_id in (select merch.my_tenants()) or merch.is_platform_admin());
create policy request_insert on merch.support_access for insert with check (merch.is_platform_admin() or merch.my_role(tenant_id) in ('owner','manager'));
create policy decide_update on merch.support_access for update using (merch.my_role(tenant_id) in ('owner','manager') or merch.is_platform_admin());
