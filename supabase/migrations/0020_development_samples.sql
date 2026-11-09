-- 0020 (registered on Supabase as merch_0019_development_samples, before main gained 0019_desk_agents): development track, Stage B (docs/development-merchandising.md section 3.2): sample rounds and their
-- measurements, materials (the BOM with sourcing status), the development schedule, and cross-references.
--   samples          one row per round (proto, fit, size set, SMS, PP, TOP, shipment, lab dip, strike-off...), on a
--                    style and, from PP on, on the order; the decision is always a person's (written by server
--                    actions after a role check, never by an agent tool)
--   measurements     point of measure results per sample against the spec of the tech pack version it was made to
--   materials        BOM lines with sourcing status, supplier and swatch or lab dip state
--   dev_milestones   the development schedule: dated like production milestones but keyed from a template, not an enum
--   schedule_templates  per company or per customer: steps, planned gaps and dependencies (the default lives in code)
--   style_links      this style is like that one; this round reuses those comments
-- alerts gain style_id and sample_id so silence alerts can cover a round or a swatch.

set search_path = merch, public, extensions;

create table if not exists merch.samples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  style_id uuid references merch.styles(id) on delete cascade,
  order_id uuid references merch.orders(id) on delete set null,
  type text not null check (type in ('proto', 'fit', 'size_set', 'sms', 'pp', 'top', 'shipment', 'labdip', 'strikeoff', 'handloom', 'trim_card', 'wash', 'other')),
  round smallint not null default 1 check (round between 1 and 50),
  size text,
  colourway text,
  maker_party_id uuid references merch.parties(id) on delete set null,
  against_record_id uuid references merch.records(id) on delete set null,   -- tech pack version the sample was made to
  requested_at date,
  due_at date,
  sent_at date,
  courier text,
  awb text,
  received_at date,
  reviewed_at timestamptz,
  decision text check (decision is null or decision in ('approved', 'approved_with_comments', 'rejected', 'resubmit')),
  decided_by uuid references auth.users(id),
  decided_by_name text,                          -- the person, or "Customer: Hannah Price (Northline), by email"
  decision_source text check (decision_source is null or decision_source in ('workspace', 'customer_email', 'customer_plm', 'customer_meeting', 'other')),
  comments text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists samples_style on merch.samples (tenant_id, style_id, type, round);
create index if not exists samples_order on merch.samples (tenant_id, order_id);
create index if not exists samples_due on merch.samples (tenant_id, due_at) where received_at is null;
create trigger t_upd before update on merch.samples for each row execute function merch.touch_updated_at();

create table if not exists merch.measurements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  sample_id uuid not null references merch.samples(id) on delete cascade,
  pom_code text,
  pom_name text not null,
  size text,
  spec numeric(10,3),
  tol_minus numeric(10,3),
  tol_plus numeric(10,3),
  measured numeric(10,3),
  unit text,
  pass boolean,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists measurements_sample on merch.measurements (sample_id);

create table if not exists merch.materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  style_id uuid not null references merch.styles(id) on delete cascade,
  kind text not null check (kind in ('fabric', 'trim', 'label', 'packaging', 'thread', 'other')),
  item text not null,
  description text,
  composition text,
  construction text,
  weight text,
  colour text,
  placement text,
  qty text,
  supplier_id uuid references merch.parties(id) on delete set null,
  supplier_name text,                            -- as written in the tech pack when no party matches
  status text not null default 'to_source' check (status in ('to_source', 'swatch_requested', 'swatch_received', 'labdip_pending', 'approved', 'rejected', 'not_needed')),
  moq text,
  lead_days integer,
  price numeric(12,4),
  currency text,
  tech_pack_record_id uuid references merch.records(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_style on merch.materials (tenant_id, style_id);
create trigger t_upd before update on merch.materials for each row execute function merch.touch_updated_at();

create table if not exists merch.dev_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  style_id uuid not null references merch.styles(id) on delete cascade,
  key text not null,
  label text,
  owner_kind text,                               -- customer | factory | mill | us
  owner_party_id uuid references merch.parties(id) on delete set null,
  plan_date date not null,
  expected_date date,
  actual_date date,
  sample_id uuid references merch.samples(id) on delete set null,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (style_id, key)
);
create index if not exists dev_milestones_style on merch.dev_milestones (tenant_id, style_id);

create table if not exists merch.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  customer_id uuid references merch.parties(id) on delete cascade,  -- null: the company default
  name text not null,
  steps jsonb not null,                          -- [{key, label, gap, deps:[key], owner}] gap in days from the target delivery
  created_at timestamptz not null default now()
);
create index if not exists schedule_templates_tenant on merch.schedule_templates (tenant_id, customer_id);

create table if not exists merch.style_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  style_id uuid not null references merch.styles(id) on delete cascade,
  ref_style_id uuid references merch.styles(id) on delete cascade,
  ref_record_id uuid references merch.records(id) on delete set null,
  ref_sample_id uuid references merch.samples(id) on delete set null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists style_links_style on merch.style_links (tenant_id, style_id);

alter table merch.records add constraint records_sample_fk foreign key (sample_id) references merch.samples(id) on delete set null;
alter table merch.records add constraint records_material_fk foreign key (material_id) references merch.materials(id) on delete set null;
alter table merch.alerts add column if not exists style_id uuid references merch.styles(id) on delete cascade;
alter table merch.alerts add column if not exists sample_id uuid references merch.samples(id) on delete cascade;

-- RLS: members read; operational roles write; no deletes from the browser (archive and purge run under the service role)
do $$
declare t text;
begin
  for t in select unnest(array['samples','measurements','materials','dev_milestones','schedule_templates','style_links']) loop
    execute format('alter table merch.%I enable row level security', t);
    execute format('create policy member_read on merch.%I for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id))', t);
    execute format('create policy member_write on merch.%I for insert with check (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics''))', t);
    execute format('create policy member_update on merch.%I for update using (merch.my_role(tenant_id) in (''owner'',''manager'',''merchandiser'',''qc'',''compliance'',''logistics''))', t);
    execute format('revoke delete, truncate on merch.%I from authenticated', t);
    execute format('revoke all on merch.%I from anon', t);
  end loop;
end $$;
-- measurements of a round are replaced as a set when a review is saved, so members may delete them
grant delete on merch.measurements to authenticated;
create policy member_delete on merch.measurements for delete using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
-- a schedule can be rebuilt from the template
grant delete on merch.dev_milestones to authenticated;
create policy member_delete on merch.dev_milestones for delete using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
