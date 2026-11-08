-- Alerts (Phase 29): the safety net for what no connector can capture.
-- silence: a milestone is due or overdue and nothing has come in from the party who owns it.
-- unsent: an approved reply with no connected channel has not been marked sent.
-- send_failed: an approved reply could not be sent on its connected channel.
-- Raised once per key by the hourly pass in /api/jobs/drain, emailed to the person responsible,
-- escalated to owners and managers after 24 hours, and cleared automatically when the gap closes.
-- Members read; only the service role writes. party_id is set null when a party is purged, so alerts
-- never count as a party's activity.
create table if not exists merch.alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  kind text not null check (kind in ('silence', 'unsent', 'send_failed')),
  key text not null,
  order_id uuid references merch.orders(id) on delete cascade,
  party_id uuid references merch.parties(id) on delete set null,
  message_id uuid references merch.messages(id) on delete cascade,
  milestone text,
  due_date date,
  assignee_user_id uuid references auth.users(id),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  detail jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution text,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create index if not exists alerts_open on merch.alerts (tenant_id, status, created_at desc);
alter table merch.alerts enable row level security;
create policy member_read on merch.alerts for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
revoke all on merch.alerts from anon;
revoke insert, update, delete, truncate on merch.alerts from authenticated;
grant select on merch.alerts to authenticated;
