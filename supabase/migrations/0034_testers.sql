-- 0034: open tester programme (docs/testers.md).
-- People the founder invites try VIA Merch in practice companies. Each tester gets a private copy
-- of a frozen practice company (brand, buying office, manufacturer), so no tester sees another
-- tester or anything another tester does. Feedback (typed, dictated or recorded) goes to VIA Labs.
--
-- These are platform tables like announcements: addressed to VIA Labs, written only by server code.

-- ------------------------------------------------------------ people and their practice companies
create table if not exists merch.testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  company text,
  trade text,                                   -- what they do: brand, buying_office, factory, trading, other
  ref text,                                     -- optional tag carried by the invitation link
  locale text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists merch.tester_sandboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null unique references merch.tenants(id) on delete cascade,
  world text not null check (world in ('brand', 'buying_office', 'factory')),
  created_at timestamptz not null default now(),
  retired_at timestamptz                         -- set when the tester starts the company again
);
create unique index if not exists tester_sandboxes_live on merch.tester_sandboxes (user_id, world) where retired_at is null;

create table if not exists merch.tester_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references merch.tenants(id) on delete set null,
  world text,
  role text,                                     -- the role the tester was working as
  track text,
  path text,                                     -- the page they were on
  locale text,
  mood text check (mood in ('good', 'confusing', 'missing', 'broken')),
  body text,
  audio_path text,                               -- private bucket merch-feedback
  audio_seconds integer,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'read', 'actioned')),
  created_at timestamptz not null default now()
);
create index if not exists tester_feedback_at on merch.tester_feedback (created_at desc);

alter table merch.testers enable row level security;
alter table merch.tester_sandboxes enable row level security;
alter table merch.tester_feedback enable row level security;   -- service role only
drop policy if exists own_row on merch.testers;
create policy own_row on merch.testers for select using (user_id = auth.uid() or merch.is_platform_admin());
drop policy if exists own_rows on merch.tester_sandboxes;
create policy own_rows on merch.tester_sandboxes for select using (user_id = auth.uid() or merch.is_platform_admin());
drop policy if exists admin_read on merch.tester_feedback;
create policy admin_read on merch.tester_feedback for select using (merch.is_platform_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('merch-feedback', 'merch-feedback', false, 4194304)
on conflict (id) do nothing;

-- ------------------------------------------------------------ background work leaves practice companies alone
-- A tester's copy (settings.sandbox) and a frozen template (settings.template.frozen_at) get no first briefs:
-- the copy arrives with the template's briefs, and chat and event updates still run when the tester acts.
create or replace function merch.orders_without_brief(p_n integer) returns table (order_id uuid, tenant_id uuid)
language sql stable security definer set search_path = merch, public as $$
  select o.id, o.tenant_id from merch.orders o join merch.tenants t on t.id = o.tenant_id
  where o.status = 'open'
    and coalesce((t.settings->>'sandbox')::boolean, false) = false
    and (t.settings->'template'->>'frozen_at') is null
    and not exists (select 1 from merch.agent_memory m where m.order_id = o.id)
    and not exists (select 1 from merch.agent_runs r join merch.agents a on a.id = r.agent_id
                    where a.order_id = o.id and r.trigger = 'brief' and r.error is not null and r.created_at > now() - interval '1 hour')
  order by o.created_at limit p_n
$$;
revoke all on function merch.orders_without_brief(integer) from public, anon, authenticated;
grant execute on function merch.orders_without_brief(integer) to service_role;

-- ------------------------------------------------------------ copy a company
-- Copies every working row of p_source into a new company and returns its id.
--   * every row gets a new id; references between rows follow
--   * dates move forward by p_days (default: whole days since the template was frozen), so the copy is current
--   * real people in the source (sign-in emails outside the reserved .example domains) are replaced by p_user:
--     their memberships collapse into one for p_user, and their names and emails in text become p_user's;
--     the made-up colleagues (.example sign-ins) stay as they are
--   * connections, invitations, tokens, support conversations, usage and agent run logs are not copied
--   * the ledger is copied in order with its hash chain recomputed for the new company
create or replace function merch.sandbox_clone(
  p_source uuid, p_user uuid, p_user_name text, p_user_email text,
  p_slug text, p_name text, p_settings jsonb default '{}'::jsonb, p_days integer default null
) returns uuid language plpgsql security definer set search_path = merch, extensions, public as $$
declare
  tables constant text[] := array['parties','contacts','memberships','styles','orders','milestones','threads','messages','agents','gates','drafts',
    'agent_memory','agent_messages','agent_lessons','agent_requests','records','samples','measurements','materials','dev_milestones','style_links',
    'schedule_templates','alerts','esg_programmes','esg_requirements','esg_tasks','esg_submissions','esg_reports','knowledge_docs','ledger'];
  uuid_re constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  src merch.tenants;
  new_t uuid := gen_random_uuid();
  days integer;
  tbl text; pos integer; cols text; ord text; has_uuid_id boolean;
  datecols text[]; tscols text[]; nullcols text[]; defer text[];
  deferred text[][] := array[]::text[][];
  keeper uuid; keeper_new uuid; dropped uuid[] := array[]::uuid[];
  scrub text[][] := array[]::text[][];
  r record; j jsonb; txt text; u text; n uuid; c text; d text[];
  prev text; h text; at_txt text;
begin
  select * into src from merch.tenants where id = p_source;
  if not found then raise exception 'source company not found'; end if;
  if p_slug !~ '^[a-z0-9-]{3,60}$' then raise exception 'bad slug'; end if;
  days := coalesce(p_days, greatest(0, current_date - coalesce((src.settings->'template'->>'frozen_at')::timestamptz::date, current_date)));

  create temp table if not exists _sbx_map (old uuid primary key, new uuid not null) on commit drop;
  truncate _sbx_map;
  insert into _sbx_map values (p_source, new_t);

  -- the new company row: same settings without the template marker, plus what the caller sets
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
    where table_schema = 'merch' and table_name = 'tenants' and is_generated = 'NEVER' and identity_generation is null;
  execute format('insert into merch.tenants (%s) select %s from jsonb_populate_record(null::merch.tenants, $1)', cols, cols)
    using to_jsonb(src) || jsonb_build_object('id', new_t, 'slug', p_slug, 'name', p_name,
      'settings', (coalesce(src.settings, '{}'::jsonb) - 'template') || coalesce(p_settings, '{}'::jsonb), 'created_at', now(), 'updated_at', now());

  -- real people in the source: the first (an owner if there is one) becomes p_user, the others fold into it
  for r in select m.id, m.user_id, m.display_name, au.email from merch.memberships m join auth.users au on au.id = m.user_id
           where m.tenant_id = p_source and au.email !~* '(\.|@)(example|invalid|test|localhost)$' and au.email !~* '@(.+\.)?example\.(com|net|org)$'
           order by (m.role = 'owner') desc, m.created_at loop
    if keeper is null then keeper := r.id; else dropped := dropped || r.id; end if;
    insert into _sbx_map values (r.user_id, p_user) on conflict (old) do nothing;
    if p_user_name is not null and length(coalesce(r.display_name, '')) >= 4 and r.display_name <> p_user_name then
      scrub := scrub || array[[trim(both '"' from to_jsonb(r.display_name)::text), trim(both '"' from to_jsonb(p_user_name)::text)]];
    end if;
    if p_user_email is not null and r.email <> p_user_email then
      scrub := scrub || array[[trim(both '"' from to_jsonb(r.email)::text), trim(both '"' from to_jsonb(p_user_email)::text)]];
    end if;
  end loop;

  -- a new id for every row that has a uuid id
  foreach tbl in array tables loop
    if exists (select 1 from information_schema.columns where table_schema = 'merch' and table_name = tbl and column_name = 'id' and data_type = 'uuid') then
      execute format('insert into _sbx_map select id, gen_random_uuid() from merch.%I where tenant_id = $1 on conflict (old) do nothing', tbl) using p_source;
    end if;
  end loop;
  if keeper is not null then
    select new into keeper_new from _sbx_map where old = keeper;
    update _sbx_map set new = keeper_new where old = any(dropped);
  end if;

  pos := 0;
  foreach tbl in array tables loop
    pos := pos + 1;
    select string_agg(quote_ident(column_name), ', '), bool_or(column_name = 'id' and data_type = 'uuid'),
           coalesce(array_agg(column_name::text) filter (where data_type = 'date'), '{}'),
           coalesce(array_agg(column_name::text) filter (where data_type = 'timestamp with time zone'), '{}')
      into cols, has_uuid_id, datecols, tscols
      from information_schema.columns
      where table_schema = 'merch' and table_name = tbl and is_generated = 'NEVER' and identity_generation is null
        and not (column_name = 'id' and data_type <> 'uuid');
    if cols is null then continue; end if;
    -- references to tables that are not copied become empty; references to tables copied later (or to the
    -- same table) are filled in once every row exists
    select coalesce(array_agg(a.attname::text) filter (where not (cl.relname = any(tables)) and cl.relname <> 'tenants'), '{}'),
           coalesce(array_agg(a.attname::text) filter (where cl.relname = any(tables) and array_position(tables, cl.relname::text) >= pos), '{}')
      into nullcols, defer
      from pg_constraint k join pg_class cl on cl.oid = k.confrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.conrelid = format('merch.%I', tbl)::regclass and ns.nspname = 'merch' and array_length(k.conkey, 1) = 1;
    foreach c in array defer loop deferred := deferred || array[[tbl, c]]; end loop;
    ord := case when tbl = 'ledger' then 'id' when exists (select 1 from information_schema.columns where table_schema = 'merch' and table_name = tbl and column_name = 'created_at') then 'created_at' else '1' end;
    if tbl = 'ledger' then prev := null; end if;

    for r in execute format('select to_jsonb(x) as j from merch.%I x where x.tenant_id = $1 order by %s', tbl, ord) using p_source loop
      j := r.j;
      if tbl = 'memberships' and (j->>'id')::uuid = any(dropped) then continue; end if;
      txt := j::text;
      for u in select distinct m[1] from regexp_matches(txt, uuid_re, 'g') m loop
        select new into n from _sbx_map where old = u::uuid;
        if found then txt := replace(txt, u, n::text); end if;
      end loop;
      if array_length(scrub, 1) is not null then
        foreach d slice 1 in array scrub loop txt := replace(txt, d[1], d[2]); end loop;
      end if;
      j := txt::jsonb;
      if days <> 0 then
        foreach c in array datecols loop
          if j->>c is not null then j := j || jsonb_build_object(c, ((j->>c)::date + days)); end if;
        end loop;
        foreach c in array tscols loop
          if j->>c is not null then j := j || jsonb_build_object(c, ((j->>c)::timestamptz + make_interval(days => days))); end if;
        end loop;
      end if;
      foreach c in array nullcols || defer loop j := j || jsonb_build_object(c, null); end loop;
      if tbl = 'memberships' and (j->>'id')::uuid = keeper_new then
        j := j || jsonb_build_object('display_name', coalesce(p_user_name, j->>'display_name'),
          'initials', case when p_user_name is null then j->>'initials' else upper(left(regexp_replace(p_user_name, '^\s*(\S)\S*\s*(\S?).*$', '\1\2'), 2)) end,
          'phone', null, 'avatar_path', null, 'locale', null);
      end if;
      if tbl = 'ledger' then
        at_txt := ((j->>'at')::timestamptz)::text;
        h := encode(digest(coalesce(prev, 'VIA-MERCH-GENESIS-v1') || '|' || new_t || '|' || at_txt || '|' || (j->>'actor') || '|' || coalesce(j->>'stream', '') || '|' || coalesce(j->>'order_id', '') || '|' || (j->>'what') || '|' || coalesce(j->>'gate', '') || '|' || coalesce((j->'ref')::text, '{}'), 'sha256'), 'hex');
        j := j || jsonb_build_object('prev_hash', prev, 'hash', h);
        prev := h;
      end if;
      execute format('insert into merch.%I (%s) select %s from jsonb_populate_record(null::merch.%I, $1)', tbl, cols, cols, tbl) using j;
    end loop;
  end loop;

  -- fill in the references that had to wait
  if array_length(deferred, 1) is not null then
    foreach d slice 1 in array deferred loop
      execute format('update merch.%1$I n set %2$I = mm.new from merch.%1$I o, _sbx_map mi, _sbx_map mm where o.tenant_id = $1 and o.%2$I is not null and mi.old = o.id and n.id = mi.new and mm.old = o.%2$I', d[1], d[2]) using p_source;
    end loop;
  end if;

  -- a source with made-up people only: p_user joins as the owner
  if keeper is null then
    insert into merch.memberships (tenant_id, user_id, role, display_name, initials, tracks)
    values (new_t, p_user, 'owner', p_user_name, upper(left(regexp_replace(coalesce(p_user_name, 'You'), '^\s*(\S)\S*\s*(\S?).*$', '\1\2'), 2)), array['production', 'development']);
  end if;

  perform merch.ledger_append(new_t, 'Console', 'VIA Merch', null, null, 'Setup', null,
    'Practice company set up from ' || src.name || coalesce(' for ' || p_user_name, ''), 'ADMIN', true, jsonb_build_object('source', p_source), 'production', null);
  return new_t;
end $$;
revoke all on function merch.sandbox_clone(uuid, uuid, text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function merch.sandbox_clone(uuid, uuid, text, text, text, text, jsonb, integer) to service_role;
