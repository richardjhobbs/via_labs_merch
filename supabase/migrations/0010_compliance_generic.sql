-- 0010: compliance beyond the loan. The same programme / requirement / task / submission / report model now
-- covers every obligation a merchandising team carries, by three orthogonal settings on a requirement:
--   trigger    schedule   every period (monthly ... annual, or once), as in 0009
--              per_order  once per matching PO, due a set number of days before or after a milestone
--                         (a test report before final QC, a GOTS transaction certificate after ETD)
--              expiry     a certificate, licence or permit: due on the expiry date of the last accepted
--                         evidence, reminded `lead_days` ahead (up to a year for a licence renewal)
--   applies_to company    the company reports it once
--              suppliers  each matching supplier reports it (a brand code of conduct passed down to every
--                         tier 1 factory; a buying office collecting OEKO-TEX certificates from every mill)
--   filters    supplier_filter {kinds, tiers, countries}; order_filter {customer_ids, factory_countries, category}
-- Programme kinds widen to audits, licences and industry schemes. Tasks carry the PO or supplier they are for,
-- and a key that makes each one unique per requirement.

set search_path = merch, public, extensions;

alter table merch.esg_programmes drop constraint if exists esg_programmes_kind_check;
alter table merch.esg_programmes add constraint esg_programmes_kind_check check (kind in ('loan', 'customer', 'certification', 'audit', 'regulation', 'licence', 'industry', 'internal'));
alter table merch.esg_programmes add column if not exists template text;           -- template id it was started from

alter table merch.esg_requirements
  add column if not exists trigger text not null default 'schedule',
  add column if not exists applies_to text not null default 'company',
  add column if not exists supplier_filter jsonb not null default '{}'::jsonb,
  add column if not exists order_filter jsonb not null default '{}'::jsonb,
  add column if not exists milestone merch.milestone_key,
  add column if not exists milestone_offset integer not null default 0,
  add column if not exists severity text;
alter table merch.esg_requirements add constraint esg_req_trigger_check check (trigger in ('schedule', 'per_order', 'expiry'));
alter table merch.esg_requirements add constraint esg_req_applies_check check (applies_to in ('company', 'suppliers'));
alter table merch.esg_requirements add constraint esg_req_severity_check check (severity is null or severity in ('critical', 'major', 'minor'));
alter table merch.esg_requirements add constraint esg_req_offset_check check (milestone_offset between -365 and 365);
alter table merch.esg_requirements add constraint esg_req_milestone_check check (trigger <> 'per_order' or milestone is not null);
alter table merch.esg_requirements drop constraint if exists esg_requirements_lead_days_check;
alter table merch.esg_requirements add constraint esg_requirements_lead_days_check check (lead_days between 1 and 365);
alter table merch.esg_requirements alter column first_period_end drop not null;
alter table merch.esg_requirements add constraint esg_req_first_check check (trigger = 'per_order' or first_period_end is not null);

alter table merch.esg_tasks
  add column if not exists key text,
  add column if not exists order_id uuid references merch.orders(id) on delete cascade,
  add column if not exists party_id uuid references merch.parties(id) on delete cascade;
update merch.esg_tasks set key = period_end::text where key is null;
alter table merch.esg_tasks alter column key set not null;
alter table merch.esg_tasks drop constraint if exists esg_tasks_requirement_id_period_end_key;
alter table merch.esg_tasks add constraint esg_tasks_requirement_key unique (requirement_id, key);
create index if not exists esg_tasks_order_idx on merch.esg_tasks (tenant_id, order_id) where order_id is not null;
create index if not exists esg_tasks_party_idx on merch.esg_tasks (tenant_id, party_id) where party_id is not null;

-- Certificates, licences, permits and test reports carry their validity.
alter table merch.esg_submissions add column if not exists valid_from date, add column if not exists valid_until date;
