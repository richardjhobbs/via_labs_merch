-- Layered agents, phase 2: desk agents over groups of orders, typed messages between agents,
-- and drafts routed to the lowest layer able to decide them.
--   agents.desk_rule  for desk agents: {"by": "customer"|"supplier"|"category"|"list", "ids": [...], "categories": [...], "order_ids": [...]}
--   agents.ceilings   per stream {"Production status": 2, ...}; a missing stream means L1. Only an owner raises it.
--   agent_messages    report | escalation | instruction | question | answer | decision, between adjacent layers
--   drafts            waiting_layer (order, desk, manager) and waiting_since: whose decision it is and since when
alter table merch.agents add column if not exists desk_rule jsonb;
alter table merch.drafts
  add column if not exists waiting_layer text check (waiting_layer in ('order', 'desk', 'manager')),
  add column if not exists waiting_since timestamptz;

create table if not exists merch.agent_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  from_agent_id uuid references merch.agents(id) on delete set null,
  to_agent_id uuid references merch.agents(id) on delete set null,
  kind text not null check (kind in ('report', 'escalation', 'instruction', 'question', 'answer', 'decision')),
  order_id uuid references merch.orders(id) on delete cascade,
  draft_id uuid references merch.drafts(id) on delete set null,
  reply_to uuid references merch.agent_messages(id) on delete set null,
  body jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  due_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists agent_messages_to on merch.agent_messages (to_agent_id, status, created_at desc);
create index if not exists agent_messages_tenant on merch.agent_messages (tenant_id, created_at desc);
create index if not exists agent_messages_draft on merch.agent_messages (draft_id);
alter table merch.agent_messages enable row level security;
create policy member_read on merch.agent_messages for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
grant select on merch.agent_messages to authenticated;
