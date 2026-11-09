-- 0016 (registered on Supabase as merch_0015_development_tracks): development merchandising as a second track (docs/development-merchandising.md, Stage A).
-- Two tracks in one tenant: 'production' (everything built so far, backfilled here) and 'development'
-- (briefs, tech packs, materials, sample rounds before a PO exists). Separation is at the level of
-- streams, gates, queue, briefing, agent and navigation; storage, parties, connectors and the ledger stay
-- shared so a style's history reads as one story and handover is a pointer move.
--   track          on gates (part of the key), drafts, threads, messages, agents, ledger, alerts
--   memberships    tracks: which lines of work a person sees; both -> a switch in the workspace
--   contacts       track_default: where an ambiguous message from this person is filed
--   styles         the development file: one row per style per season per customer (orders.style_id)
--   records        every versioned artefact of both tracks (tech pack, brief, spec, BOM, photo, comment...),
--                  the original in the private bucket merch-development, the extraction in parsed, final
--                  only when a person confirms it (confirmed_at)
-- ledger_append gains p_track and p_style; the hash payload is unchanged so existing rows still verify.

set search_path = merch, public, extensions;

-- ------------------------------------------------------------ track on the shared tables
alter table merch.gates drop constraint if exists gates_pkey;
alter table merch.gates add column if not exists track text not null default 'production';
alter table merch.gates add constraint gates_track_check check (track in ('production', 'development'));
alter table merch.gates add primary key (tenant_id, track, stream);

alter table merch.drafts add column if not exists track text not null default 'production';
alter table merch.drafts add constraint drafts_track_check check (track in ('production', 'development'));
alter table merch.threads add column if not exists track text not null default 'production';
alter table merch.threads add constraint threads_track_check check (track in ('production', 'development'));
alter table merch.messages add column if not exists track text not null default 'production';
alter table merch.messages add constraint messages_track_check check (track in ('production', 'development'));
alter table merch.agents add column if not exists track text not null default 'production';
alter table merch.agents add constraint agents_track_check check (track in ('production', 'development'));
alter table merch.ledger add column if not exists track text not null default 'production';
alter table merch.alerts add column if not exists track text not null default 'production';

alter table merch.memberships add column if not exists tracks text[] not null default '{production}';
alter table merch.contacts add column if not exists track_default text;
alter table merch.contacts add constraint contacts_track_default_check check (track_default is null or track_default in ('production', 'development'));

alter type merch.party_kind add value if not exists 'sample_room';
alter type merch.party_kind add value if not exists 'designer';
alter type merch.party_kind add value if not exists 'trim_supplier';

-- ------------------------------------------------------------ styles: the development file
create table if not exists merch.styles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  customer_id uuid references merch.parties(id) on delete set null,
  code text not null,                           -- the customer's style number, as written
  name text,
  season text,
  category text,
  status text not null default 'brief' check (status in ('brief', 'developing', 'sampling', 'costing', 'adopted', 'handed_over', 'dropped')),
  owner_user_id uuid references auth.users(id),
  target_price numeric(12,4),
  currency text not null default 'USD',
  target_delivery date,
  plm_ref text,                                 -- id or link in the customer's PLM
  description text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id, code, season)
);
create index if not exists styles_tenant_status on merch.styles (tenant_id, status);
create trigger t_upd before update on merch.styles for each row execute function merch.touch_updated_at();

alter table merch.orders add column if not exists style_id uuid references merch.styles(id) on delete set null;
alter table merch.drafts add column if not exists style_id uuid references merch.styles(id) on delete set null;
alter table merch.threads add column if not exists style_id uuid references merch.styles(id) on delete set null;
alter table merch.messages add column if not exists style_id uuid references merch.styles(id) on delete set null;
alter table merch.ledger add column if not exists style_id uuid references merch.styles(id) on delete set null;
create index if not exists threads_style on merch.threads (tenant_id, style_id);
create index if not exists messages_style on merch.messages (tenant_id, style_id);
create index if not exists ledger_style on merch.ledger (tenant_id, style_id);

-- ------------------------------------------------------------ records: every versioned artefact, both tracks
create table if not exists merch.records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  track text not null default 'development' check (track in ('production', 'development')),
  kind text not null check (kind in ('brief', 'tech_pack', 'spec', 'bom', 'colourway', 'fit_comment', 'measurement_sheet', 'photo', 'scan', 'test_report', 'inspection_report', 'reference', 'other')),
  style_id uuid references merch.styles(id) on delete cascade,
  order_id uuid references merch.orders(id) on delete set null,
  sample_id uuid,                               -- Stage B: merch.samples
  material_id uuid,                             -- Stage B: merch.materials
  version integer not null default 1,
  supersedes_id uuid references merch.records(id) on delete set null,
  title text,
  source text not null default 'upload' check (source in ('plm', 'email', 'upload', 'forward', 'drive', 'whatsapp', 'zalo', 'agent', 'manual')),
  source_message_id uuid references merch.messages(id) on delete set null,
  source_ref text,                              -- PLM id, Drive file id, mail attachment name
  storage_path text,                            -- object in merch-development; null for a typed record
  filename text,
  mime text,
  bytes integer,
  sha256 text,
  lang text,
  parsed jsonb,                                 -- structured extraction (BOM, colourways, POMs, construction, translation)
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists records_style on merch.records (tenant_id, style_id, kind, version desc);
create index if not exists records_order on merch.records (tenant_id, order_id);

-- ------------------------------------------------------------ RLS
alter table merch.styles enable row level security;
create policy member_read on merch.styles for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
create policy member_write on merch.styles for insert with check (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
create policy member_update on merch.styles for update using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
revoke delete, truncate on merch.styles from authenticated;
revoke all on merch.styles from anon;

alter table merch.records enable row level security;
create policy member_read on merch.records for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
create policy member_write on merch.records for insert with check (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
-- a record is confirmed once; everything else about it is a new version
create policy member_confirm on merch.records for update using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics') and confirmed_at is null);
revoke delete, truncate on merch.records from authenticated;
revoke all on merch.records from anon;

-- Originals: private bucket, no storage policies, so only the service role reads or writes it.
-- Tech packs run to tens of megabytes, so the cap is 30 MB and uploads go straight from the browser by signed URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('merch-development', 'merch-development', false, 31457280)
on conflict (id) do nothing;

-- ------------------------------------------------------------ ledger_append with track and style
drop function if exists merch.ledger_append(uuid, text, text, uuid, text, text, uuid, text, text, boolean, jsonb);
create or replace function merch.ledger_append(
  p_tenant uuid, p_channel text, p_actor text, p_actor_user uuid, p_counterparty text,
  p_stream text, p_order uuid, p_what text, p_gate text, p_gated boolean, p_ref jsonb default '{}'::jsonb,
  p_track text default 'production', p_style uuid default null
) returns merch.ledger language plpgsql security definer set search_path = merch, extensions as $$
declare prev text; row merch.ledger; payload text;
begin
  if auth.uid() is not null then
    if not (p_tenant in (select merch.my_tenants()) or merch.has_support_access(p_tenant)) then
      raise exception 'not a member of this company';
    end if;
    if p_actor_user is not null and p_actor_user <> auth.uid() then
      raise exception 'the ledger actor must be the signed-in person';
    end if;
  end if;
  if p_track not in ('production', 'development') then raise exception 'unknown track %', p_track; end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  select hash into prev from merch.ledger where tenant_id = p_tenant order by id desc limit 1;
  payload := coalesce(prev, 'VIA-MERCH-GENESIS-v1') || '|' || p_tenant || '|' || now()::text || '|' || p_actor || '|' || coalesce(p_stream, '') || '|' || coalesce(p_order::text, '') || '|' || p_what || '|' || coalesce(p_gate, '') || '|' || coalesce(p_ref::text, '{}');
  insert into merch.ledger (tenant_id, channel, actor, actor_user_id, counterparty, stream, order_id, what, gate, gated, ref, prev_hash, hash, track, style_id)
  values (p_tenant, p_channel, p_actor, p_actor_user, p_counterparty, p_stream, p_order, p_what, p_gate, p_gated, coalesce(p_ref, '{}'::jsonb), prev, encode(digest(payload, 'sha256'), 'hex'), p_track, p_style)
  returning * into row;
  return row;
end $$;
revoke execute on function merch.ledger_append(uuid, text, text, uuid, text, text, uuid, text, text, boolean, jsonb, text, uuid) from public, anon;
grant execute on function merch.ledger_append(uuid, text, text, uuid, text, text, uuid, text, text, boolean, jsonb, text, uuid) to authenticated, service_role;

-- ------------------------------------------------------------ development gates for every company
-- Sample decisions and price never leave a person's hands: capped at L1 (draft only).
insert into merch.gates (tenant_id, track, stream, level, locked)
select t.id, 'development', s.stream, s.level, s.locked
from merch.tenants t
cross join (values
  ('Design briefs', 1, null::smallint), ('Tech packs and specs', 1, null), ('Material sourcing', 1, null), ('Sample schedule', 1, null),
  ('Sample comments and approvals', 1, 1), ('Lab dips and strike-offs', 1, null), ('Costing and quotes', 1, 1), ('Testing', 1, null), ('General enquiries', 1, null)
) as s(stream, level, locked)
on conflict do nothing;

-- 0015b (applied separately as merch_0015b_records_confirm_policy): the confirm policy's USING clause also
-- applied to the new row because it had no WITH CHECK, so setting confirmed_at was refused.
drop policy if exists member_confirm on merch.records;
create policy member_confirm on merch.records for update
  using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics') and confirmed_at is null)
  with check (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
