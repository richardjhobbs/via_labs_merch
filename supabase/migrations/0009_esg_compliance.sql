-- 0009: ESG and compliance. A paid add-on (tenants.settings.addons.esg, switched on in the VIA console).
--
-- The money chain sets the requirements: a development fund lends to a bank, the bank lends to the
-- manufacturer, and each passes down ESG conditions (an Environmental and Social Action Plan, a
-- sustainability-linked loan's KPIs, a customer's code of conduct, a certification). Today those land with
-- the owner and get lost on the way down. Here they become:
--   esg_programmes    one requirement set from one issuer (the bank, fund, customer or certifier)
--   esg_requirements  each obligation, in plain words, with its discipline, owner role, frequency and evidence
--   esg_tasks         one per reporting period, generated ahead of time so people are told in good time
--   esg_submissions   what was reported for a task: versions, never overwrites (merchandiser-records rule 5)
--   esg_reports       the compiled report back to the issuer: drafted, approved by an owner or manager, sent
-- Every change goes on the ledger from the app. Evidence files sit in the private storage bucket
-- merch-evidence, reachable only through the app after a membership check.

set search_path = merch, public, extensions;

alter type merch.party_kind add value if not exists 'bank';
alter type merch.party_kind add value if not exists 'funder';

create table merch.esg_programmes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  name text not null,                               -- "HSBC sustainability-linked term loan 2026"
  kind text not null default 'loan' check (kind in ('loan', 'customer', 'certification', 'regulation', 'internal')),
  issuer_party_id uuid references merch.parties(id),-- who the report goes back to
  issuer_name text,                                 -- shown when no party is linked
  chain text,                                       -- "IFC → HSBC Bangladesh → us"
  framework text,                                   -- "IFC Performance Standards; Sustainability-Linked Loan Principles"
  reference text,                                   -- facility or agreement number
  purpose text,                                     -- what the money is for: "rooftop solar and ETP upgrade"
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  source text not null default 'manual',            -- manual | document
  source_file text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merch.esg_programmes (tenant_id, status);

create table merch.esg_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  programme_id uuid not null references merch.esg_programmes(id) on delete cascade,
  code text,                                        -- the issuer's own clause number: "ESAP 3.2", "KPI 1"
  title text not null,
  instruction text,                                 -- what has to be done, in words the person doing it understands
  discipline text not null default 'governance' check (discipline in ('energy', 'emissions', 'water', 'chemicals', 'waste', 'health_safety', 'labour', 'community', 'governance', 'traceability', 'other')),
  measure text not null default 'evidence' check (measure in ('number', 'yes_no', 'evidence', 'text')),
  unit text,                                        -- kWh, m3, tCO2e, %, count
  target numeric,
  target_note text,                                 -- "at least 20% below the 2025 baseline by 2028"
  baseline numeric,
  frequency text not null default 'quarterly' check (frequency in ('once', 'monthly', 'quarterly', 'semiannual', 'annual')),
  first_period_end date not null,                   -- end of the first period reported on
  due_days integer not null default 30 check (due_days between 0 and 180), -- report due this many days after the period ends
  lead_days integer not null default 21 check (lead_days between 1 and 120), -- start reminding this many days before it is due
  owner_role merch.member_role not null default 'compliance',
  owner_user_id uuid references auth.users(id),
  supplier_party_id uuid references merch.parties(id), -- when a supplier provides the figure (a mill's water use)
  evidence text,                                    -- what proves it: "meter readings and the utility bill"
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merch.esg_requirements (tenant_id, programme_id);

create table merch.esg_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  requirement_id uuid not null references merch.esg_requirements(id) on delete cascade,
  programme_id uuid not null references merch.esg_programmes(id) on delete cascade,
  period_label text not null,                       -- "Q1 2027", "2027-03", "FY 2027", "One-off"
  period_end date not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'submitted', 'accepted', 'returned', 'waived')),
  assignee_user_id uuid references auth.users(id),
  latest_submission_id uuid,
  reminded_stage smallint not null default 0,       -- 1 lead window, 2 a week out, 3 due tomorrow or overdue
  reminded_at timestamptz,
  supplier_asked_at timestamptz,                    -- when the agent last queued a request to the supplier
  reviewed_by uuid references auth.users(id),
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requirement_id, period_end)
);
create index on merch.esg_tasks (tenant_id, status, due_date);
create index on merch.esg_tasks (tenant_id, programme_id, period_end);

-- Versions, not overwrites: a correction is a new row that names the one it replaces.
create table merch.esg_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  task_id uuid not null references merch.esg_tasks(id) on delete cascade,
  version integer not null,
  value_num numeric,
  value_text text,
  note text,
  evidence jsonb not null default '[]'::jsonb,      -- [{name, path, bytes, sha256}]
  source text not null default 'manual' check (source in ('manual', 'agent', 'message', 'document')),
  source_message_id uuid references merch.messages(id),
  submitted_by uuid default auth.uid(),
  submitted_by_name text,
  created_at timestamptz not null default now(),
  unique (task_id, version)
);
create index on merch.esg_submissions (tenant_id, task_id);
alter table merch.esg_tasks add constraint esg_tasks_latest_fk foreign key (latest_submission_id) references merch.esg_submissions(id);

create table merch.esg_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  programme_id uuid not null references merch.esg_programmes(id) on delete cascade,
  period_label text not null,
  period_from date not null,
  period_to date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  summary text,                                     -- the covering narrative, drafted by the agent, edited by a person
  rows jsonb not null default '[]'::jsonb,          -- snapshot: requirement, target, value, status, evidence per task
  prepared_by_name text,
  approved_by uuid references auth.users(id),
  approved_by_name text,
  approved_at timestamptz,
  sent_to text,
  sent_note text,
  sent_by_name text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merch.esg_reports (tenant_id, programme_id, created_at desc);

create trigger t_upd before update on merch.esg_programmes for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.esg_requirements for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.esg_tasks for each row execute function merch.touch_updated_at();
create trigger t_upd before update on merch.esg_reports for each row execute function merch.touch_updated_at();

-- Submissions are append-only.
create or replace function merch.esg_submission_block_change() returns trigger language plpgsql as $$
begin raise exception 'ESG submissions cannot be changed or deleted. Submit a new version instead.'; end $$;
create trigger esg_submission_append_only before update or delete on merch.esg_submissions for each row execute function merch.esg_submission_block_change();

-- A report is fixed once approved: only the sent fields may be filled in, once. Only an owner or manager
-- approves (the service role, with no signed-in user, is the app acting on a checked decision).
create or replace function merch.esg_report_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'draft' and new.status = 'approved' then
    if auth.uid() is not null and merch.my_role(new.tenant_id) not in ('owner', 'manager') then
      raise exception 'Only an owner or manager can approve a compliance report.';
    end if;
    new.approved_at := now();
    if auth.uid() is not null then new.approved_by := auth.uid(); end if;
    return new;
  end if;
  if old.status in ('approved', 'sent') then
    if (new.summary, new.rows, new.period_label, new.period_from, new.period_to, new.programme_id, new.approved_by, new.approved_at)
       is distinct from (old.summary, old.rows, old.period_label, old.period_from, old.period_to, old.programme_id, old.approved_by, old.approved_at) then
      raise exception 'An approved report cannot be changed. Prepare a new one.';
    end if;
    if old.status = 'sent' then raise exception 'This report is already recorded as sent.'; end if;
    if new.status <> 'sent' then raise exception 'An approved report can only be recorded as sent.'; end if;
    new.sent_at := now();
    return new;
  end if;
  if new.status <> old.status and new.status <> 'draft' then raise exception 'A draft report is approved before it is sent.'; end if;
  return new;
end $$;
create trigger esg_report_guard before update on merch.esg_reports for each row execute function merch.esg_report_guard();
revoke delete, truncate on merch.esg_reports from authenticated;

-- RLS: members read (and VIA staff only under a support grant, as for every content table since 0006).
-- Programmes and requirements: owners, managers and compliance. Tasks and submissions: any member but viewers.
alter table merch.esg_programmes enable row level security;
alter table merch.esg_requirements enable row level security;
alter table merch.esg_tasks enable row level security;
alter table merch.esg_submissions enable row level security;
alter table merch.esg_reports enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['esg_programmes','esg_requirements','esg_tasks','esg_submissions','esg_reports']) loop
    execute format('create policy member_read on merch.%I for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id))', t);
  end loop;
  for t in select unnest(array['esg_programmes','esg_requirements','esg_reports']) loop
    execute format('create policy lead_insert on merch.%I for insert with check (merch.my_role(tenant_id) in (''owner'',''manager'',''compliance''))', t);
    execute format('create policy lead_update on merch.%I for update using (merch.my_role(tenant_id) in (''owner'',''manager'',''compliance''))', t);
  end loop;
end $$;
create policy member_insert on merch.esg_tasks for insert with check (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
create policy member_update on merch.esg_tasks for update using (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
create policy member_insert on merch.esg_submissions for insert with check (merch.my_role(tenant_id) in ('owner','manager','merchandiser','qc','compliance','logistics'));
revoke delete, truncate on merch.esg_programmes, merch.esg_requirements, merch.esg_tasks, merch.esg_submissions from authenticated;
revoke all on merch.esg_programmes, merch.esg_requirements, merch.esg_tasks, merch.esg_submissions, merch.esg_reports from anon;

-- Evidence files: private bucket, no storage policies, so only the service role reads or writes it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('merch-evidence', 'merch-evidence', false, 4194304)
on conflict (id) do nothing;

-- Fixed search path on the two trigger functions (Supabase advisor 0011).
alter function merch.esg_submission_block_change() set search_path = merch;
alter function merch.esg_report_guard() set search_path = merch;
