-- VIA Merch: foundation schema. Everything lives in schema "merch" because the
-- Supabase project is shared with other VIA Labs apps that own "public".
-- Every table carries tenant_id and has RLS. Access is decided by membership.

set search_path = merch, public, extensions;

-- ------------------------------------------------------------ enums
create type merch.tenant_kind as enum ('buying_office', 'brand', 'factory', 'trading', 'retailer');
create type merch.member_role as enum ('owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics', 'viewer');
create type merch.party_kind as enum ('brand', 'retailer', 'store', 'buying_office', 'trading', 'factory', 'mill', 'fibre', 'forwarder', 'carrier', 'lab', 'auditor', 'other');
create type merch.channel_kind as enum ('email_gmail', 'email_m365', 'email_inbound', 'whatsapp', 'wecom', 'zalo', 'telegram', 'sheets', 'file', 'via_agent', 'portal', 'erp', 'plm', 'qc', 'compliance', 'forwarder');
create type merch.channel_status as enum ('available', 'requested', 'connecting', 'connected', 'reauth', 'error', 'off');
create type merch.draft_status as enum ('queued', 'approved', 'sent', 'rejected', 'escalated', 'expired');
create type merch.milestone_key as enum ('fabric', 'labdip', 'fit', 'pp', 'cut', 'inline', 'final', 'exf', 'etd', 'eta');

-- ------------------------------------------------------------ tenants and people
create table merch.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  kind merch.tenant_kind not null,
  plan text not null default 'retainer',       -- retainer | per_user | trial
  locale text not null default 'en',           -- default UI language for new members
  tz text not null default 'Asia/Hong_Kong',
  currency text not null default 'USD',
  settings jsonb not null default '{}'::jsonb, -- model routing, gate defaults, branding
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- VIA Labs staff who run the admin console. Separate from tenant membership.
create table merch.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table merch.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role merch.member_role not null default 'merchandiser',
  display_name text,
  initials text,
  title text,
  locale text,                                  -- overrides tenant locale
  scopes jsonb not null default '{}'::jsonb,    -- e.g. {"parties":["..."]} limits a merchandiser to customers
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index on merch.memberships (user_id);

create table merch.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  email text not null,
  role merch.member_role not null default 'merchandiser',
  display_name text,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index on merch.invites (lower(email));

-- Idle timeout: the app signs people out after 2 hours without activity.
create table merch.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null unique,              -- Supabase session id from the JWT
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,                            -- idle | logout | revoked
  user_agent text,
  ip inet
);
create index on merch.sessions (user_id, last_seen_at desc);

-- Public "request access" form on the landing page.
create table merch.access_requests (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  kind merch.tenant_kind,
  name text not null,
  email text not null,
  country text,
  message text,
  status text not null default 'new',           -- new | contacted | provisioned | declined
  tenant_id uuid references merch.tenants(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ parties (customers and suppliers)
create table merch.parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  kind merch.party_kind not null,
  name text not null,
  short text,
  country text,
  city text,
  tier smallint,                                -- 1 garment, 2 mill, 3 fibre (suppliers)
  through_party_id uuid references merch.parties(id), -- e.g. a brand reached through a buying office
  lang text not null default 'en',
  channel_pref merch.channel_kind,
  report_format text,                           -- "Meridian WIP sheet (xlsx), every Monday"
  via_tenant_id uuid references merch.tenants(id),    -- set when the party also runs VIA Merch
  via_agent_url text,                           -- partner agent endpoint for agent-to-agent
  policy jsonb not null default '{}'::jsonb,    -- audits, certs, restricted substances, uflpa, dpp
  score jsonb not null default '{}'::jsonb,     -- otd, quality, compliance, response
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merch.parties (tenant_id, kind);

create table merch.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  party_id uuid not null references merch.parties(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,                                   -- E.164, used for WhatsApp
  chat_ids jsonb not null default '{}'::jsonb,  -- {"wecom":"...","telegram":"..."}
  lang text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on merch.contacts (tenant_id, lower(email));
create index on merch.contacts (tenant_id, phone);

-- ------------------------------------------------------------ orders and the critical path
create table merch.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  po text not null,
  customer_id uuid references merch.parties(id),      -- who the goods are for
  factory_id uuid references merch.parties(id),
  mill_id uuid references merch.parties(id),
  fibre_id uuid references merch.parties(id),
  owner_user_id uuid references auth.users(id),        -- the merchandiser handling it
  style text,
  description text,
  category text,
  composition text,
  qty integer,
  sizes jsonb not null default '{}'::jsonb,
  colours text[] not null default '{}',
  fob numeric(12,4),
  currency text not null default 'USD',
  incoterm text,
  pol text,
  pod text,
  instore_date date,
  season text,
  status text not null default 'open',          -- open | shipped | closed | cancelled
  source text,                                  -- import | email | sheet | api | manual
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, po)
);
create index on merch.orders (tenant_id, status);

-- One row per milestone. Forecast is recomputed by the app from plan, actual,
-- expected and the dependency graph (fabric/labdip/fit -> pp -> cut -> inline -> final -> exf -> etd -> eta).
create table merch.milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  order_id uuid not null references merch.orders(id) on delete cascade,
  key merch.milestone_key not null,
  owner_kind text not null,                     -- mill | brand | factory | qc | forwarder
  owner_party_id uuid references merch.parties(id),
  plan_date date not null,
  expected_date date,                           -- reported revision
  actual_date date,
  forecast_date date,                           -- computed
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (order_id, key)
);
create index on merch.milestones (tenant_id, order_id);

-- ------------------------------------------------------------ channels and messages
create table merch.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  kind merch.channel_kind not null,
  name text not null,                           -- "priya@meridian.example", "+852 ... (WhatsApp)"
  owner_user_id uuid references auth.users(id), -- personal channels belong to a member
  status merch.channel_status not null default 'available',
  account text,                                 -- display identity
  scope text,                                   -- "Read, draft; send after approval"
  auth_enc bytea,                               -- tokens, encrypted with pgsodium / app key
  watch_expires_at timestamptz,                 -- Gmail watch, Graph subscription
  last_sync_at timestamptz,
  error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merch.channels (tenant_id, kind);

create table merch.threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  channel_id uuid references merch.channels(id) on delete set null,
  party_id uuid references merch.parties(id),
  order_id uuid references merch.orders(id),
  subject text,
  external_id text,                             -- Gmail threadId, WhatsApp wa_id, etc.
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index on merch.threads (tenant_id, last_message_at desc);
create index on merch.threads (tenant_id, external_id);

create table merch.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  thread_id uuid references merch.threads(id) on delete cascade,
  channel_id uuid references merch.channels(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  party_id uuid references merch.parties(id),
  contact_id uuid references merch.contacts(id),
  order_id uuid references merch.orders(id),
  external_id text,
  from_addr text,
  to_addr text[] not null default '{}',
  sender_name text,
  lang text,                                    -- detected
  text text,                                    -- original
  text_en text,                                 -- English rendering
  stream text,                                  -- classified: Production status, WIP reports, ...
  parsed jsonb,                                 -- structured extraction (order lines, dates)
  raw jsonb,                                    -- provider payload
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on merch.messages (tenant_id, received_at desc);
create index on merch.messages (tenant_id, order_id);
create unique index on merch.messages (channel_id, external_id) where external_id is not null;

create table merch.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  message_id uuid references merch.messages(id) on delete cascade,
  order_id uuid references merch.orders(id),
  storage_path text not null,                   -- Supabase Storage object
  filename text not null,
  mime text,
  bytes integer,
  parsed jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ agents, gates, drafts, ledger
create table merch.agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  name text not null,                           -- "Mira", "Northline agent"
  scope_kind text not null default 'tenant',    -- tenant | party | stream
  scope_party_id uuid references merch.parties(id),
  scope_stream text,
  model text not null default 'claude-sonnet',
  languages text[] not null default '{en}',
  tools text[] not null default '{}',           -- empty = all tools for the role
  prompt_overrides text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Autonomy per stream: L0 record only, L1 draft/human sends, L2 routine auto,
-- L3 act within limits. locked caps the level a manager may set.
create table merch.gates (
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  stream text not null,
  level smallint not null default 1 check (level between 0 and 3),
  locked smallint check (locked between 0 and 3),
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, stream)
);

create table merch.drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  seq bigint generated always as identity,
  agent_id uuid references merch.agents(id),
  assignee_user_id uuid references auth.users(id),
  role merch.member_role,                       -- which role's queue it sits in
  priority smallint not null default 2,
  stream text not null,
  order_id uuid references merch.orders(id),
  party_id uuid references merch.parties(id),
  contact_id uuid references merch.contacts(id),
  channel_id uuid references merch.channels(id),
  source_message_id uuid references merch.messages(id),
  title text not null,
  impact text,
  body text not null,                           -- the draft, in the recipient's language
  body_en text,
  lang text,
  gate_level smallint not null default 1,
  status merch.draft_status not null default 'queued',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  edited boolean not null default false,
  sent_message_id uuid references merch.messages(id),
  created_at timestamptz not null default now()
);
create index on merch.drafts (tenant_id, status, priority);

-- Append-only, hash-chained per tenant. Written only through merch.ledger_append().
create table merch.ledger (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  at timestamptz not null default now(),
  channel text,
  actor text not null,                          -- "Mira (for Priya Nair)", "Priya Nair", "Northline agent"
  actor_user_id uuid references auth.users(id),
  counterparty text,
  stream text,
  order_id uuid references merch.orders(id),
  what text not null,
  gate text,                                    -- "APPROVED 10:12 · Priya Nair", "AUTO · L2", "Logged"
  gated boolean not null default false,
  ref jsonb not null default '{}'::jsonb,       -- {draft_id, message_id, ...}
  prev_hash text,
  hash text not null
);
create index on merch.ledger (tenant_id, at desc);

create or replace function merch.ledger_append(
  p_tenant uuid, p_channel text, p_actor text, p_actor_user uuid, p_counterparty text,
  p_stream text, p_order uuid, p_what text, p_gate text, p_gated boolean, p_ref jsonb default '{}'::jsonb
) returns merch.ledger language plpgsql security definer set search_path = merch, extensions as $$
declare prev text; row merch.ledger; payload text;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  select hash into prev from merch.ledger where tenant_id = p_tenant order by id desc limit 1;
  payload := coalesce(prev, 'VIA-MERCH-GENESIS-v1') || '|' || p_tenant || '|' || now()::text || '|' || p_actor || '|' || coalesce(p_stream, '') || '|' || coalesce(p_order::text, '') || '|' || p_what || '|' || coalesce(p_gate, '') || '|' || coalesce(p_ref::text, '{}');
  insert into merch.ledger (tenant_id, channel, actor, actor_user_id, counterparty, stream, order_id, what, gate, gated, ref, prev_hash, hash)
  values (p_tenant, p_channel, p_actor, p_actor_user, p_counterparty, p_stream, p_order, p_what, p_gate, p_gated, coalesce(p_ref, '{}'::jsonb), prev, encode(digest(payload, 'sha256'), 'hex'))
  returning * into row;
  return row;
end $$;

create or replace function merch.ledger_block_change() returns trigger language plpgsql as $$
begin raise exception 'ledger is append-only'; end $$;
create trigger ledger_no_update before update or delete on merch.ledger for each row execute function merch.ledger_block_change();

create table merch.agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  agent_id uuid references merch.agents(id),
  user_id uuid references auth.users(id),       -- who asked, if a person
  trigger text not null,                        -- chat | inbound | schedule | partner
  model text,
  input jsonb,
  tools_called jsonb not null default '[]'::jsonb,
  output text,
  tokens_in integer default 0,
  tokens_out integer default 0,
  cost_usd numeric(10,5) default 0,
  ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index on merch.agent_runs (tenant_id, created_at desc);

-- Inbound requests from partner agents (MCP / A2A), answered under the gate.
create table merch.agent_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  party_id uuid references merch.parties(id),
  from_agent text not null,
  via text not null default 'mcp',
  schema_name text not null,                    -- merch.wip.v1 ...
  ask text not null,
  order_id uuid references merch.orders(id),
  gate_level smallint,
  status text not null default 'pending',       -- pending | answered | held | refused
  answer jsonb,
  answered_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table merch.usage_daily (
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  day date not null,
  messages_in integer not null default 0,
  messages_out integer not null default 0,
  agent_runs integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd numeric(12,5) not null default 0,
  primary key (tenant_id, day)
);

-- ------------------------------------------------------------ helpers
create or replace function merch.is_platform_admin() returns boolean language sql stable security definer set search_path = merch as $$
  select exists (select 1 from merch.platform_admins where user_id = auth.uid());
$$;

create or replace function merch.my_tenants() returns setof uuid language sql stable security definer set search_path = merch as $$
  select tenant_id from merch.memberships where user_id = auth.uid();
$$;

create or replace function merch.my_role(p_tenant uuid) returns merch.member_role language sql stable security definer set search_path = merch as $$
  select role from merch.memberships where user_id = auth.uid() and tenant_id = p_tenant;
$$;

create or replace function merch.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_upd before update on merch.tenants for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.parties for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.orders for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.channels for each row execute function merch.touch_updated_at();

-- ------------------------------------------------------------ RLS
-- Pattern: members read their tenant; writers are managers/owners (or the row's
-- assignee); platform admins see everything; the service role bypasses RLS.
do $$
declare t text;
begin
  for t in select unnest(array['parties','contacts','orders','milestones','channels','threads','messages','attachments','agents','gates','drafts','ledger','agent_runs','agent_requests','usage_daily']) loop
    execute format('alter table merch.%I enable row level security', t);
    execute format('create policy member_read on merch.%I for select using (tenant_id in (select merch.my_tenants()) or merch.is_platform_admin())', t);
  end loop;
end $$;

-- writes for operational tables: any member except viewer; ledger only via function; gates only manager/owner
do $$
declare t text;
begin
  for t in select unnest(array['parties','contacts','orders','milestones','threads','messages','attachments','drafts','agent_requests']) loop
    execute format('create policy member_write on merch.%I for insert with check (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics'') or merch.is_platform_admin())', t);
    execute format('create policy member_update on merch.%I for update using (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics'') or merch.is_platform_admin())', t);
  end loop;
end $$;
create policy manager_write on merch.gates for all using (merch.my_role(tenant_id) in ('owner','manager') or merch.is_platform_admin());
create policy manager_write on merch.agents for all using (merch.my_role(tenant_id) in ('owner','manager') or merch.is_platform_admin());
create policy manager_write on merch.channels for all using (merch.my_role(tenant_id) in ('owner','manager') or owner_user_id = auth.uid() or merch.is_platform_admin());

alter table merch.tenants enable row level security;
create policy member_read on merch.tenants for select using (id in (select merch.my_tenants()) or merch.is_platform_admin());
create policy admin_write on merch.tenants for all using (merch.is_platform_admin());

alter table merch.memberships enable row level security;
create policy member_read on merch.memberships for select using (tenant_id in (select merch.my_tenants()) or merch.is_platform_admin());
create policy manager_write on merch.memberships for all using (merch.my_role(tenant_id) in ('owner','manager') or merch.is_platform_admin());

alter table merch.invites enable row level security;
create policy manager_all on merch.invites for all using (merch.my_role(tenant_id) in ('owner','manager') or merch.is_platform_admin());

alter table merch.platform_admins enable row level security;
create policy admin_read on merch.platform_admins for select using (merch.is_platform_admin());

alter table merch.sessions enable row level security;
create policy own_session on merch.sessions for all using (user_id = auth.uid() or merch.is_platform_admin());

alter table merch.access_requests enable row level security;
create policy anyone_insert on merch.access_requests for insert with check (true);
create policy admin_read on merch.access_requests for select using (merch.is_platform_admin());
create policy admin_update on merch.access_requests for update using (merch.is_platform_admin());

-- ------------------------------------------------------------ queues (pgmq) and the minute tick
select pgmq.create('merch_inbound');
select pgmq.create('merch_agent_runs');
select pgmq.create('merch_outbound');
select pgmq.create('merch_connector_sync');

-- The app's job runner is called every minute by pg_cron through pg_net. The
-- URL and the shared secret are stored in merch.app_config by the admin.
create table merch.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table merch.app_config enable row level security;  -- service role only

create or replace function merch.tick() returns void language plpgsql security definer set search_path = merch, extensions as $$
declare url text; secret text;
begin
  select value into url from merch.app_config where key = 'jobs_url';
  select value into secret from merch.app_config where key = 'jobs_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('content-type', 'application/json', 'x-merch-jobs', secret), body := '{"source":"pg_cron"}'::jsonb, timeout_milliseconds := 50000);
end $$;
select cron.schedule('merch_tick', '* * * * *', $$select merch.tick()$$);
