-- Agent runtime support: usage counters, queue wrappers for the job worker,
-- gate cap enforcement, ledger chain verification.

-- Daily usage, one upsert per agent run.
create or replace function merch.usage_add(p_tenant uuid, p_runs int, p_in int, p_out int, p_tokens_in bigint, p_tokens_out bigint, p_cost numeric)
returns void language sql security definer set search_path = merch as $$
  insert into merch.usage_daily (tenant_id, day, messages_in, messages_out, agent_runs, tokens_in, tokens_out, cost_usd)
  values (p_tenant, current_date, p_in, p_out, p_runs, p_tokens_in, p_tokens_out, p_cost)
  on conflict (tenant_id, day) do update set
    messages_in = merch.usage_daily.messages_in + excluded.messages_in,
    messages_out = merch.usage_daily.messages_out + excluded.messages_out,
    agent_runs = merch.usage_daily.agent_runs + excluded.agent_runs,
    tokens_in = merch.usage_daily.tokens_in + excluded.tokens_in,
    tokens_out = merch.usage_daily.tokens_out + excluded.tokens_out,
    cost_usd = merch.usage_daily.cost_usd + excluded.cost_usd;
$$;

-- pgmq wrappers (the pgmq schema is not exposed through the API). Service role only.
create or replace function merch.q_send(p_queue text, p_msg jsonb) returns bigint
language sql security definer set search_path = pgmq, merch as $$ select pgmq.send(p_queue, p_msg); $$;

create or replace function merch.q_read(p_queue text, p_n int)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer set search_path = pgmq, merch as $$
  select msg_id, read_ct, message from pgmq.read(p_queue, 90, p_n);
$$;

create or replace function merch.q_delete(p_queue text, p_id bigint) returns boolean
language sql security definer set search_path = pgmq, merch as $$ select pgmq.delete(p_queue, p_id); $$;

revoke execute on function merch.usage_add(uuid, int, int, int, bigint, bigint, numeric) from public, anon, authenticated;
revoke execute on function merch.q_send(text, jsonb) from public, anon, authenticated;
revoke execute on function merch.q_read(text, int) from public, anon, authenticated;
revoke execute on function merch.q_delete(text, bigint) from public, anon, authenticated;
grant execute on function merch.usage_add(uuid, int, int, int, bigint, bigint, numeric) to service_role;
grant execute on function merch.q_send(text, jsonb) to service_role;
grant execute on function merch.q_read(text, int) to service_role;
grant execute on function merch.q_delete(text, bigint) to service_role;

-- A manager may not raise a stream above its cap.
create or replace function merch.gate_cap_check() returns trigger language plpgsql as $$
begin
  if new.locked is not null and new.level > new.locked then
    raise exception 'stream % is capped at L%', new.stream, new.locked;
  end if;
  return new;
end $$;
drop trigger if exists gate_cap on merch.gates;
create trigger gate_cap before insert or update on merch.gates for each row execute function merch.gate_cap_check();

-- Walk the chain and report breaks. Members can call it for their own tenant.
create or replace function merch.ledger_verify(p_tenant uuid)
returns table (rows_checked bigint, breaks bigint, first_break_id bigint)
language plpgsql security definer set search_path = merch, extensions as $$
declare r record; prev text := null; expected text; n bigint := 0; b bigint := 0; fb bigint := null;
begin
  if not (p_tenant in (select merch.my_tenants()) or merch.is_platform_admin()) then raise exception 'not a member'; end if;
  for r in select * from merch.ledger where tenant_id = p_tenant order by id loop
    n := n + 1;
    expected := encode(digest(coalesce(prev, 'VIA-MERCH-GENESIS-v1') || '|' || r.tenant_id || '|' || r.at::text || '|' || r.actor || '|' || coalesce(r.stream, '') || '|' || coalesce(r.order_id::text, '') || '|' || r.what || '|' || coalesce(r.gate, '') || '|' || coalesce(r.ref::text, '{}'), 'sha256'), 'hex');
    if r.hash <> expected or r.prev_hash is distinct from prev then b := b + 1; if fb is null then fb := r.id; end if; end if;
    prev := r.hash;
  end loop;
  return query select n, b, fb;
end $$;

-- Drafts: a person's decision is recorded through ledger rows; members already have update rights.
-- Agent runs and messages are written by the service role; members read them.
