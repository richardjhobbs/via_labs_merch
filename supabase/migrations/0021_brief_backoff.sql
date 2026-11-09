-- First briefs: skip an order whose brief failed in the last hour, so one stubborn order cannot take the
-- drain's minute every minute (9 Nov 2026: PO 48812 failed each minute and starved the morning brief).
create or replace function merch.orders_without_brief(p_n integer) returns table (order_id uuid, tenant_id uuid)
language sql stable security definer set search_path = merch, public as $$
  select o.id, o.tenant_id from merch.orders o
  where o.status = 'open'
    and not exists (select 1 from merch.agent_memory m where m.order_id = o.id)
    and not exists (select 1 from merch.agent_runs r join merch.agents a on a.id = r.agent_id
                    where a.order_id = o.id and r.trigger = 'brief' and r.error is not null and r.created_at > now() - interval '1 hour')
  order by o.created_at limit p_n
$$;
revoke all on function merch.orders_without_brief(integer) from public, anon, authenticated;
grant execute on function merch.orders_without_brief(integer) to service_role;
