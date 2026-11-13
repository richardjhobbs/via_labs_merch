-- 0030: the support desk (docs/support.md). A signed-in member of any company, partners included, talks to the
-- support agent at /support; every conversation is a ticket with its messages stored, and a change the agent
-- cannot answer away becomes a change proposal for VIA Labs to triage. Every write goes through server code
-- under the service role after a membership check; signed-in callers only read.

create table merch.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  number bigint generated always as identity,
  opened_by uuid references auth.users(id) on delete set null,
  opened_by_name text,
  opened_by_email text,
  opened_by_role text,
  kind text not null default 'question' check (kind in ('question', 'error', 'request', 'suggestion')),
  title text not null check (length(title) between 1 and 160),
  -- open: the agent is answering; answered: the agent believes it is settled; with_via: handed to VIA Labs staff;
  -- logged: a change proposal was filed; planned, building, shipped, declined follow that proposal; closed: by the person or VIA.
  status text not null default 'open' check (status in ('open', 'answered', 'with_via', 'logged', 'planned', 'building', 'shipped', 'declined', 'closed')),
  page text,                                    -- the workspace page the person came from, if any
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index on merch.support_tickets (number);
create index on merch.support_tickets (tenant_id, last_message_at desc);
create index on merch.support_tickets (status, last_message_at desc);
create trigger t_upd before update on merch.support_tickets for each row execute function merch.touch_updated_at();

create table merch.support_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  ticket_id uuid not null references merch.support_tickets(id) on delete cascade,
  author_kind text not null check (author_kind in ('person', 'agent', 'via')),
  author_user uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null check (length(body) <= 8000),
  attachments jsonb not null default '[]'::jsonb,   -- [{ path, name, mime, bytes }] in the bucket merch-support
  agent_run_id uuid references merch.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on merch.support_messages (ticket_id, created_at);

-- A change the support agent proposes from a ticket. The plan, lane and decision are VIA Labs' own working
-- record: the person who asked sees the outcome through the ticket status, never this table.
create table merch.change_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  ticket_id uuid references merch.support_tickets(id) on delete set null,
  number bigint generated always as identity,
  kind text not null check (kind in ('bug', 'copy', 'enhancement')),
  title text not null check (length(title) between 1 and 160),
  problem text not null,
  affected text,
  suggested text,
  repro text,
  status text not null default 'proposed' check (status in ('proposed', 'planned', 'greenlit', 'declined', 'building', 'pr_open', 'shipped')),
  lane text check (lane in ('proceed', 'greenlight')),          -- set at triage: proceed = simple and global; greenlight = the founder decides
  scope text check (scope in ('global', 'client', 'package')),
  plan text,
  risk_flags text[] not null default '{}',
  github_issue integer,
  pr_url text,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on merch.change_proposals (number);
create index on merch.change_proposals (status, created_at desc);
create trigger t_upd before update on merch.change_proposals for each row execute function merch.touch_updated_at();

alter table merch.support_tickets enable row level security;
alter table merch.support_messages enable row level security;
alter table merch.change_proposals enable row level security;

-- A person reads their own tickets; owners and managers read their company's; VIA Labs reads all, because a
-- ticket is addressed to VIA Labs (unlike the company's records, which need a support grant).
create policy ticket_read on merch.support_tickets for select using (
  opened_by = auth.uid() or merch.my_role(tenant_id) in ('owner', 'manager') or merch.is_platform_admin()
);
-- Messages follow the ticket: the subquery runs under the caller's own policies.
create policy message_read on merch.support_messages for select using (
  exists (select 1 from merch.support_tickets t where t.id = ticket_id)
);
create policy proposal_read on merch.change_proposals for select using (merch.is_platform_admin());

revoke insert, update, delete, truncate on merch.support_tickets, merch.support_messages, merch.change_proposals from authenticated;
revoke all on merch.support_tickets, merch.support_messages, merch.change_proposals from anon;

-- Screenshots a person adds to a ticket: private, no storage policies, served by /api/support/file after RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-support', 'merch-support', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

comment on table merch.support_tickets is 'Support desk conversations (docs/support.md). Written only by server code.';
comment on table merch.change_proposals is 'Change proposals filed by the support agent; triaged by VIA Labs.';
