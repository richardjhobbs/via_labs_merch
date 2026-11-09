-- 0023 Development track, Stage E: partner access to development, costing sheets and 3D files as records.
--   * records.kind gains 'costing' (a cost breakdown or quote, read by the model) and 'model_3d' (a Browzwear,
--     CLO or glTF file, stored and previewed, never read); records.source gains 'portal' (written by a partner).
--   * A partner (role 'partner', scopes.parties) at a customer sees that customer's styles once the company runs
--     development: the style, its confirmed records except costings, the sample rounds with the decision and
--     measurements, the schedule, and the comments and photos partners posted. Materials (suppliers and prices),
--     pending records, costings, the ledger and every conversation stay private to the company.
--   Partners write nothing under their own role; their comments go through server code under the service role.
set search_path = merch, public, extensions;

alter table merch.records drop constraint if exists records_kind_check;
alter table merch.records add constraint records_kind_check check (kind in ('brief', 'tech_pack', 'spec', 'bom', 'colourway', 'fit_comment', 'measurement_sheet', 'photo', 'scan', 'test_report', 'inspection_report', 'reference', 'costing', 'model_3d', 'other'));
alter table merch.records drop constraint if exists records_source_check;
alter table merch.records add constraint records_source_check check (source in ('plm', 'email', 'upload', 'forward', 'drive', 'whatsapp', 'zalo', 'agent', 'manual', 'portal'));
create index if not exists records_sample on merch.records (tenant_id, sample_id) where sample_id is not null;

-- A partner may see this style: it belongs to a customer they speak for and the company runs development.
create or replace function merch.partner_style_ok(p_style uuid) returns boolean language sql stable security definer set search_path = merch as $$
  select exists (
    select 1 from merch.styles s join merch.tenants t on t.id = s.tenant_id
    where s.id = p_style and s.customer_id is not null
      and s.customer_id = any(merch.partner_parties(s.tenant_id))
      and coalesce((t.settings->'tracks'->>'development')::boolean, false));
$$;
revoke execute on function merch.partner_style_ok(uuid) from public, anon;
grant execute on function merch.partner_style_ok(uuid) to authenticated, service_role;

create policy partner_read on merch.styles for select using (merch.partner_style_ok(id));
create policy partner_read on merch.records for select using (
  style_id is not null and merch.partner_style_ok(style_id) and kind <> 'costing'
  and (confirmed_at is not null or source = 'portal'));
create policy partner_read on merch.samples for select using (style_id is not null and merch.partner_style_ok(style_id));
create policy partner_read on merch.measurements for select using (
  exists (select 1 from merch.samples s where s.id = measurements.sample_id and s.style_id is not null and merch.partner_style_ok(s.style_id)));
create policy partner_read on merch.dev_milestones for select using (style_id is not null and merch.partner_style_ok(style_id));
