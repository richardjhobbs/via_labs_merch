-- Layered agents, phase 5: lessons learned from people's edits and rejections, and a knowledge library.
-- A lesson is proposed by an agent and used only once a person has confirmed it. Library documents are
-- reference text (playbooks, customer manuals, standards) searched by the agents with full-text search.
-- Only the service role writes; members of the company read.
create table if not exists merch.agent_lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  scope text not null default 'company' check (scope in ('company', 'customer', 'desk')),
  scope_id uuid,
  text text not null,
  source_draft_id uuid references merch.drafts(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'retired')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_lessons_tenant on merch.agent_lessons (tenant_id, status, created_at desc);
alter table merch.agent_lessons enable row level security;
create policy member_read on merch.agent_lessons for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
grant select on merch.agent_lessons to authenticated;

create table if not exists merch.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  scope text not null default 'company' check (scope in ('company', 'customer', 'desk')),
  scope_id uuid,
  title text not null,
  body text not null,
  filename text,
  created_by uuid,
  created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || body)) stored
);
create index if not exists knowledge_docs_tsv on merch.knowledge_docs using gin (tsv);
create index if not exists knowledge_docs_tenant on merch.knowledge_docs (tenant_id, created_at desc);
alter table merch.knowledge_docs enable row level security;
create policy member_read on merch.knowledge_docs for select using (tenant_id in (select merch.my_tenants()) or merch.has_support_access(tenant_id));
grant select on merch.knowledge_docs to authenticated;

-- search for the agents: best matches with a short highlighted passage
create or replace function merch.search_knowledge(p_tenant uuid, p_query text, p_n integer default 5)
returns table (id uuid, title text, scope text, scope_id uuid, passage text, rank real)
language sql stable security definer set search_path = merch, public as $$
  select d.id, d.title, d.scope, d.scope_id,
         ts_headline('simple', d.body, websearch_to_tsquery('simple', p_query), 'MaxWords=60, MinWords=25, MaxFragments=2') as passage,
         ts_rank(d.tsv, websearch_to_tsquery('simple', p_query)) as rank
  from merch.knowledge_docs d
  where d.tenant_id = p_tenant and d.tsv @@ websearch_to_tsquery('simple', p_query)
  order by rank desc limit greatest(1, least(p_n, 10))
$$;
revoke all on function merch.search_knowledge(uuid, text, integer) from public, anon, authenticated;
grant execute on function merch.search_knowledge(uuid, text, integer) to service_role;

-- Applied as 0025b the same day: English stemming ("report" finds "reports") and any-word matching ranked by
-- how many words match, because people ask questions, not keyword lists.
drop index if exists merch.knowledge_docs_tsv;
alter table merch.knowledge_docs drop column if exists tsv;
alter table merch.knowledge_docs add column tsv tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || body)) stored;
create index if not exists knowledge_docs_tsv on merch.knowledge_docs using gin (tsv);
create or replace function merch.search_knowledge(p_tenant uuid, p_query text, p_n integer default 5)
returns table (id uuid, title text, scope text, scope_id uuid, passage text, rank real)
language plpgsql stable security definer set search_path = merch, public as $$
declare q tsquery;
begin
  q := nullif(replace(plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery;
  if q is null then return; end if;
  return query
    select d.id, d.title, d.scope, d.scope_id,
           ts_headline('english', d.body, q, 'MaxWords=60, MinWords=25, MaxFragments=2'),
           ts_rank(d.tsv, q)
    from merch.knowledge_docs d
    where d.tenant_id = p_tenant and d.tsv @@ q
    order by 6 desc limit greatest(1, least(p_n, 10));
end $$;
revoke all on function merch.search_knowledge(uuid, text, integer) from public, anon, authenticated;
grant execute on function merch.search_knowledge(uuid, text, integer) to service_role;
