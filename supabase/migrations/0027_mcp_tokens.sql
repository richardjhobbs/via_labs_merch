-- Applied to Supabase on 10 Nov 2026 under the name 0025_mcp_tokens, before 0025_lessons_library and 0026_working_hours were
-- numbered in parallel sessions; the file is 0027 so the repo sequence stays unique.
-- MCP server, phase 1 (docs/mcp.md): a member issues a personal token so an agent of their own (any MCP client)
-- can read what they can see and queue gated work. Only the hash is stored; the secret is shown once.
-- Tracks and writes are capped by the membership on issue and intersected again on every call.
create table merch.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  membership_id uuid not null references merch.memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  prefix text not null unique check (prefix ~ '^[A-Za-z0-9]{12}$'),
  hash text not null,                                  -- sha256 hex of the full secret
  tracks text[] not null default '{production}',
  writes boolean not null default false,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  last_client text,                                    -- clientInfo.name from the MCP initialize call
  calls integer not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on merch.mcp_tokens (tenant_id, membership_id);

alter table merch.mcp_tokens enable row level security;
-- The person reads their own tokens; owners and managers read everyone's in their company; platform admins read all.
-- No insert, update or delete for signed-in callers: issue and revoke go through server code under the service role
-- after a role check, each with a ledger row.
create policy own_read on merch.mcp_tokens for select using (
  user_id = auth.uid() or merch.my_role(tenant_id) in ('owner', 'manager') or merch.is_platform_admin()
);

-- Call counting for the per-minute limit without a second table: the route increments and the minute window is
-- read from agent_runs (trigger = 'mcp'), so this stays a plain counter for the settings page.
comment on table merch.mcp_tokens is 'Personal MCP tokens (docs/mcp.md). Hash only; secret shown once at issue.';
