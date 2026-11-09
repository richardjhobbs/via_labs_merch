-- Layered agents, phase 1: one agent per order and its memory (the order brief).
-- agents gains its place in the structure; agent_memory keeps every version of what an agent believes,
-- each fact pointing at its evidence. Only the service role writes; members of the company read.
alter table merch.agents
  add column if not exists layer text not null default 'manager' check (layer in ('order', 'desk', 'manager')),
  add column if not exists parent_agent_id uuid references merch.agents(id) on delete set null,
  add column if not exists order_id uuid references merch.orders(id) on delete cascade,
  add column if not exists person_id uuid references merch.memberships(id) on delete set null,
  add column if not exists soul text,
  add column if not exists ceilings jsonb not null default '{}',
  add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'closed'));
create unique index if not exists agents_one_per_order on merch.agents (order_id) where layer = 'order';
create index if not exists agents_parent on merch.agents (parent_agent_id);

create table if not exists merch.agent_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  agent_id uuid not null references merch.agents(id) on delete cascade,
  order_id uuid references merch.orders(id) on delete cascade,
  version integer not null,
  brief jsonb not null,
  narrative text,
  sources text[] not null default '{}',
  reason text,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
create index if not exists agent_memory_order on merch.agent_memory (order_id, version desc);
alter table merch.agent_memory enable row level security;
create policy member_read on merch.agent_memory for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
grant select on merch.agent_memory to authenticated;

-- append-only: a new belief is a new version
create or replace function merch.agent_memory_guard() returns trigger language plpgsql as $$
begin raise exception 'agent_memory is append-only'; end $$;
drop trigger if exists agent_memory_no_change on merch.agent_memory;
create trigger agent_memory_no_change before update or delete on merch.agent_memory
  for each row when (pg_trigger_depth() = 0) execute function merch.agent_memory_guard(); -- cascades from an order or company delete still run

-- open orders that have no brief yet, oldest first (the drain builds a few each minute)
create or replace function merch.orders_without_brief(p_n integer) returns table (order_id uuid, tenant_id uuid)
language sql stable security definer set search_path = merch, public as $$
  select o.id, o.tenant_id from merch.orders o
  where o.status = 'open' and not exists (select 1 from merch.agent_memory m where m.order_id = o.id)
  order by o.created_at limit p_n
$$;
revoke all on function merch.orders_without_brief(integer) from public, anon, authenticated;
grant execute on function merch.orders_without_brief(integer) to service_role;
