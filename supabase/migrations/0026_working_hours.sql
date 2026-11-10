-- Working hours and time zones (founder, 10 Nov 2026: sweeps and settings follow each company's and person's
-- geography). Company working hours live in tenants.settings.hours ({ days: [1..7, Monday = 1], start, end },
-- in tenants.tz); each person may set their own time zone (memberships.tz, empty = the company's).
-- Usage is now counted per company-local day, so the daily spending limit resets at the company's midnight.
alter table merch.memberships add column if not exists tz text;

create or replace function merch.usage_add(p_tenant uuid, p_runs integer, p_in integer, p_out integer, p_tokens_in bigint, p_tokens_out bigint, p_cost numeric)
returns void language sql security definer set search_path to 'merch' as $$
  insert into merch.usage_daily (tenant_id, day, messages_in, messages_out, agent_runs, tokens_in, tokens_out, cost_usd)
  values (p_tenant, (now() at time zone coalesce((select tz from merch.tenants where id = p_tenant), 'UTC'))::date, p_in, p_out, p_runs, p_tokens_in, p_tokens_out, p_cost)
  on conflict (tenant_id, day) do update set
    messages_in = merch.usage_daily.messages_in + excluded.messages_in,
    messages_out = merch.usage_daily.messages_out + excluded.messages_out,
    agent_runs = merch.usage_daily.agent_runs + excluded.agent_runs,
    tokens_in = merch.usage_daily.tokens_in + excluded.tokens_in,
    tokens_out = merch.usage_daily.tokens_out + excluded.tokens_out,
    cost_usd = merch.usage_daily.cost_usd + excluded.cost_usd;
$$;
