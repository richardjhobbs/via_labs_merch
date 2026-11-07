-- 0011: three gaps from the compliance work.
--
-- 1. Orders carry a destination country (ISO two-letter), so market rules (EU, US, UK) apply by where the
--    goods go. Existing orders take their customer's country as a first guess.
--
-- 2. Partners: people at a customer or supplier who sign in to see, and supply, the compliance records that
--    concern their company (merchandiser-records rule 7). A membership with role 'partner' and
--    scopes.parties = [their party]. merch.my_tenants() no longer returns partner memberships, so every
--    existing member policy shuts them out of orders, messages, drafts, ledger and the rest; the policies
--    below open only:
--      * tasks where their company is the supplier, or the issuer of the programme;
--      * those tasks' requirements, programmes and submissions;
--      * reports of programmes their company issued, once approved;
--      * their own membership row, the company name, and their own party row.
--    Partners write nothing directly: the app submits for them under the service role after checking scope.
--
-- 3. Ledger and function grants: ledger_append could be called by any signed-in user for any company, and
--    with any actor id. It now requires membership (or a support grant) and that the actor id, if given, is
--    the caller. Anonymous callers lose execute on the merch helper functions, and tick() is for cron only.

set search_path = merch, public, extensions;

-- 1 ------------------------------------------------------------ destination
alter table merch.orders add column if not exists destination text check (destination is null or destination ~ '^[A-Z]{2}$');
update merch.orders o set destination = upper(p.country) from merch.parties p
 where o.customer_id = p.id and o.destination is null and p.country ~* '^[a-z]{2}$';

-- 2 ------------------------------------------------------------ partners
alter type merch.member_role add value if not exists 'partner';
alter table merch.invites add column if not exists scopes jsonb not null default '{}'::jsonb;

create or replace function merch.my_tenants() returns setof uuid language sql stable security definer set search_path = merch as $$
  select tenant_id from merch.memberships where user_id = auth.uid() and role::text <> 'partner';
$$;

-- The parties a partner speaks for in one company (empty for everyone else).
create or replace function merch.partner_parties(p_tenant uuid) returns uuid[] language sql stable security definer set search_path = merch as $$
  select coalesce((select array(select jsonb_array_elements_text(scopes->'parties')::uuid) from merch.memberships
                   where user_id = auth.uid() and tenant_id = p_tenant and role::text = 'partner'), '{}'::uuid[]);
$$;

create or replace function merch.partner_task_ok(p_task uuid) returns boolean language sql stable security definer set search_path = merch as $$
  select exists (
    select 1 from merch.esg_tasks t join merch.esg_programmes p on p.id = t.programme_id
     where t.id = p_task
       and (t.party_id = any(merch.partner_parties(t.tenant_id)) or p.issuer_party_id = any(merch.partner_parties(t.tenant_id))));
$$;

create policy partner_read on merch.esg_tasks for select using (merch.partner_task_ok(id));
create policy partner_read on merch.esg_submissions for select using (merch.partner_task_ok(task_id));
create policy partner_read on merch.esg_requirements for select using (exists (select 1 from merch.esg_tasks t where t.requirement_id = esg_requirements.id and merch.partner_task_ok(t.id)));
create policy partner_read on merch.esg_programmes for select using (
  issuer_party_id = any(merch.partner_parties(tenant_id))
  or exists (select 1 from merch.esg_tasks t where t.programme_id = esg_programmes.id and t.party_id = any(merch.partner_parties(esg_programmes.tenant_id))));
create policy partner_read on merch.esg_reports for select using (
  status in ('approved', 'sent') and exists (select 1 from merch.esg_programmes p where p.id = esg_reports.programme_id and p.issuer_party_id = any(merch.partner_parties(esg_reports.tenant_id))));
create policy own_membership on merch.memberships for select using (user_id = auth.uid());
create policy partner_read on merch.tenants for select using (exists (select 1 from merch.memberships m where m.tenant_id = tenants.id and m.user_id = auth.uid()));
create policy partner_read on merch.parties for select using (id = any(merch.partner_parties(tenant_id)));

-- 3 ------------------------------------------------------------ ledger guard and grants
create or replace function merch.ledger_append(
  p_tenant uuid, p_channel text, p_actor text, p_actor_user uuid, p_counterparty text,
  p_stream text, p_order uuid, p_what text, p_gate text, p_gated boolean, p_ref jsonb default '{}'::jsonb
) returns merch.ledger language plpgsql security definer set search_path = merch, extensions as $$
declare prev text; row merch.ledger; payload text;
begin
  -- signed-in callers write only to their own company's ledger, and only as themselves;
  -- the service role (no auth.uid()) is the app acting after its own checks
  if auth.uid() is not null then
    if not (p_tenant in (select merch.my_tenants()) or merch.has_support_access(p_tenant)) then
      raise exception 'not a member of this company';
    end if;
    if p_actor_user is not null and p_actor_user <> auth.uid() then
      raise exception 'the ledger actor must be the signed-in person';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  select hash into prev from merch.ledger where tenant_id = p_tenant order by id desc limit 1;
  payload := coalesce(prev, 'VIA-MERCH-GENESIS-v1') || '|' || p_tenant || '|' || now()::text || '|' || p_actor || '|' || coalesce(p_stream, '') || '|' || coalesce(p_order::text, '') || '|' || p_what || '|' || coalesce(p_gate, '') || '|' || coalesce(p_ref::text, '{}');
  insert into merch.ledger (tenant_id, channel, actor, actor_user_id, counterparty, stream, order_id, what, gate, gated, ref, prev_hash, hash)
  values (p_tenant, p_channel, p_actor, p_actor_user, p_counterparty, p_stream, p_order, p_what, p_gate, p_gated, coalesce(p_ref, '{}'::jsonb), prev, encode(digest(payload, 'sha256'), 'hex'))
  returning * into row;
  return row;
end $$;

revoke execute on function merch.ledger_append(uuid, text, text, uuid, text, text, uuid, text, text, boolean, jsonb) from public, anon;
revoke execute on function merch.ledger_verify(uuid) from public, anon;
revoke execute on function merch.my_role(uuid) from public, anon;
revoke execute on function merch.my_tenants() from public, anon;
revoke execute on function merch.is_platform_admin() from public, anon;
revoke execute on function merch.has_support_access(uuid) from public, anon;
revoke execute on function merch.partner_parties(uuid) from public, anon;
revoke execute on function merch.partner_task_ok(uuid) from public, anon;
revoke execute on function merch.tick() from public, anon, authenticated;
grant execute on function merch.ledger_append(uuid, text, text, uuid, text, text, uuid, text, text, boolean, jsonb) to authenticated, service_role;
grant execute on function merch.ledger_verify(uuid) to authenticated, service_role;
grant execute on function merch.my_role(uuid) to authenticated, service_role;
grant execute on function merch.my_tenants() to authenticated, service_role;
grant execute on function merch.is_platform_admin() to authenticated, service_role;
grant execute on function merch.has_support_access(uuid) to authenticated, service_role;
grant execute on function merch.partner_parties(uuid) to authenticated, service_role;
grant execute on function merch.partner_task_ok(uuid) to authenticated, service_role;
grant execute on function merch.tick() to service_role;

-- Fixed search path on the older trigger functions (Supabase advisor 0011).
alter function merch.ledger_block_change() set search_path = merch;
alter function merch.touch_updated_at() set search_path = merch;
alter function merch.gate_cap_check() set search_path = merch;
alter function merch.bank_account_guard() set search_path = merch;
