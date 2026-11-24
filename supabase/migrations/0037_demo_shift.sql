-- Keep a demo company current: move its whole timeline forward so the sample world reads as of today.
-- Only for companies marked tenants.settings.demo = true; run by VIA staff through the service role:
--   select merch.demo_shift('<tenant id>', <days>);
-- Dates (milestones, samples, styles, alerts, in-store) move by p_days. Timestamps before the last anchor
-- (settings.demo_asof) move by the same amount; activity since the anchor is compressed into the gap up to now,
-- so order is kept and nothing lands in the future. Dates written inside message texts move too.
-- The ledger, agent memory and ESG submissions are append-only and are left as they are.

create or replace function merch.shift_text_dates(p_text text, p_days int) returns text
language plpgsql immutable as $$
declare
  en text[] := array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  es text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  pats text[] := array[
    '\m(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\M',
    '(\d{1,2})月(\d{1,2})日',
    '\m(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\M',
    '\m(20\d{2})-(\d{2})-(\d{2})\M',
    '(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])'];
  out text := p_text; m text[]; src text; dst text; d date; y int; mo int; dy int; i int; k int := 0;
  srcs text[] := '{}'; dsts text[] := '{}';
begin
  if p_text is null or p_days = 0 then return p_text; end if;
  for i in 1..array_length(pats, 1) loop
    for m in select regexp_matches(p_text, pats[i], 'g') loop
      begin
        if i = 1 then dy := m[1]::int; mo := array_position(en, m[2]);
        elsif i = 2 then mo := m[1]::int; dy := m[2]::int;
        elsif i = 3 then dy := m[1]::int; mo := array_position(es, m[2]);
        elsif i = 4 then y := m[1]::int; mo := m[2]::int; dy := m[3]::int;
        else dy := m[1]::int; mo := m[2]::int; end if;
        if mo is null or mo < 1 or mo > 12 or dy < 1 or dy > 31 then continue; end if;
        if i <> 4 then y := case when mo >= 7 then 2026 else 2027 end; end if;
        d := make_date(y, mo, dy) + p_days;
        src := case i when 1 then m[1]||' '||m[2] when 2 then m[1]||'月'||m[2]||'日' when 3 then m[1]||' de '||m[2] when 4 then m[1]||'-'||m[2]||'-'||m[3] else m[1]||'/'||m[2] end;
        dst := case i
          when 1 then extract(day from d)::int||' '||en[extract(month from d)::int]
          when 2 then extract(month from d)::int||'月'||extract(day from d)::int||'日'
          when 3 then extract(day from d)::int||' de '||es[extract(month from d)::int]
          when 4 then to_char(d, 'YYYY-MM-DD')
          else extract(day from d)::int||'/'||extract(month from d)::int end;
        if not src = any(srcs) then srcs := srcs || src; dsts := dsts || dst; end if;
      exception when others then continue; -- an impossible date (31/2) stays as written
      end;
    end loop;
  end loop;
  -- two passes through placeholders, so a moved date is never moved again
  for i in 1..coalesce(array_length(srcs, 1), 0) loop out := replace(out, srcs[i], chr(1)||i||chr(2)); end loop;
  for i in 1..coalesce(array_length(srcs, 1), 0) loop out := replace(out, chr(1)||i||chr(2), dsts[i]); end loop;
  return out;
end $$;

create or replace function merch.demo_shift(p_tenant uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = merch, public as $$
declare
  s jsonb; t0 timestamptz; n0 timestamptz; k double precision; off interval; n int; res jsonb := '{}';
begin
  select settings into s from merch.tenants where id = p_tenant;
  if s is null or coalesce((s->>'demo')::boolean, false) is not true then raise exception 'not a demo company'; end if;
  if p_days < 1 or p_days > 120 then raise exception 'days must be 1 to 120'; end if;
  t0 := coalesce((s->>'demo_asof')::timestamptz, now() - make_interval(days => p_days));
  n0 := least(t0 + make_interval(days => p_days), now() - interval '10 minutes');
  off := n0 - t0;
  k := greatest(extract(epoch from (now() - n0)), 0) / greatest(extract(epoch from (now() - t0)), 1);

  -- f(ts): before the anchor, moved by off; since the anchor, compressed into [n0, now]
  update merch.milestones set plan_date = plan_date + p_days, expected_date = expected_date + p_days, actual_date = actual_date + p_days, forecast_date = forecast_date + p_days,
    updated_at = case when updated_at < t0 then updated_at + off else n0 + (updated_at - t0) * k end where tenant_id = p_tenant;
  get diagnostics n = row_count; res := res || jsonb_build_object('milestones', n);
  update merch.dev_milestones set plan_date = plan_date + p_days, expected_date = expected_date + p_days, actual_date = actual_date + p_days where tenant_id = p_tenant;
  update merch.orders set instore_date = instore_date + p_days,
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    updated_at = case when updated_at < t0 then updated_at + off else n0 + (updated_at - t0) * k end where tenant_id = p_tenant;
  update merch.samples set requested_at = requested_at + p_days, due_at = due_at + p_days, sent_at = sent_at + p_days, received_at = received_at + p_days where tenant_id = p_tenant;
  update merch.styles set target_delivery = target_delivery + p_days where tenant_id = p_tenant;
  update merch.messages set
    received_at = case when received_at < t0 then received_at + off else n0 + (received_at - t0) * k end,
    sent_at = case when sent_at < t0 then sent_at + off else n0 + (sent_at - t0) * k end,
    processed_at = case when processed_at < t0 then processed_at + off else n0 + (processed_at - t0) * k end,
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    text = merch.shift_text_dates(text, p_days), text_en = merch.shift_text_dates(text_en, p_days)
    where tenant_id = p_tenant;
  get diagnostics n = row_count; res := res || jsonb_build_object('messages', n);
  update merch.threads set
    last_message_at = case when last_message_at < t0 then last_message_at + off else n0 + (last_message_at - t0) * k end,
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    summary_at = case when summary_at < t0 then summary_at + off else n0 + (summary_at - t0) * k end,
    subject = merch.shift_text_dates(subject, p_days), summary = merch.shift_text_dates(summary, p_days)
    where tenant_id = p_tenant;
  update merch.drafts set
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    decided_at = case when decided_at < t0 then decided_at + off else n0 + (decided_at - t0) * k end,
    waiting_since = case when waiting_since < t0 then waiting_since + off else n0 + (waiting_since - t0) * k end
    where tenant_id = p_tenant;
  update merch.agent_messages set
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    closed_at = case when closed_at < t0 then closed_at + off else n0 + (closed_at - t0) * k end,
    due_at = case when due_at < t0 then due_at + off else n0 + (due_at - t0) * k end
    where tenant_id = p_tenant;
  update merch.records set
    created_at = case when created_at < t0 then created_at + off else n0 + (created_at - t0) * k end,
    confirmed_at = case when confirmed_at < t0 then confirmed_at + off else n0 + (confirmed_at - t0) * k end
    where tenant_id = p_tenant;
  -- open alerts were raised against the old dates; the hourly pass raises them again from the new ones
  update merch.alerts set status = 'resolved', resolved_at = now(), resolution = 'Demo timeline moved forward' where tenant_id = p_tenant and status = 'open';
  get diagnostics n = row_count; res := res || jsonb_build_object('alerts_resolved', n);

  update merch.tenants set settings = s || jsonb_build_object('demo_asof', now()) where id = p_tenant;
  perform merch.ledger_append(p_tenant => p_tenant, p_channel => 'Console', p_actor => 'VIA admin', p_actor_user => null, p_counterparty => null,
    p_stream => 'Setup', p_order => null, p_what => format('Demo timeline moved forward %s days', p_days), p_gate => 'Logged', p_gated => false, p_ref => res,
    p_track => 'production', p_style => null);
  return res || jsonb_build_object('days', p_days, 'anchor_was', t0, 'now', now());
end $$;

revoke all on function merch.demo_shift(uuid, int) from public, anon, authenticated;
revoke all on function merch.shift_text_dates(text, int) from public, anon, authenticated;
