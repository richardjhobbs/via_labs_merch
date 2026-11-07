-- 0012: add-on requests from inside the workspace, replacing the mailto link. An owner or manager asks for
-- an add-on (with an optional note); VIA Labs is emailed and sees it in the console, where switching the
-- add-on on (or declining) closes the request. Members of the company see the request and its outcome.
create table merch.addon_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  addon text not null check (addon in ('esg')),
  status text not null default 'requested' check (status in ('requested', 'approved', 'declined')),
  note text,
  requested_by uuid default auth.uid(),
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by_email text,
  decided_at timestamptz,
  decision_note text
);
create unique index addon_requests_one_open on merch.addon_requests (tenant_id, addon) where status = 'requested';
create index on merch.addon_requests (status, requested_at desc);

alter table merch.addon_requests enable row level security;
create policy member_read on merch.addon_requests for select using (tenant_id in (select merch.my_tenants()) or merch.is_platform_admin());
create policy lead_insert on merch.addon_requests for insert with check (merch.my_role(tenant_id) in ('owner', 'manager') and status = 'requested');
revoke update, delete, truncate on merch.addon_requests from authenticated;
revoke all on merch.addon_requests from anon;
