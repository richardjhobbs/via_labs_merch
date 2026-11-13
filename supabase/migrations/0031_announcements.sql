-- 0031: updates on the support desk (docs/support.md, Stage C). VIA Labs writes an announcement in the console,
-- chooses who it is for (everyone, an add-on, a track, a feature switch, or named companies) and publishes it;
-- members see it at /support. Announcements are VIA Labs' own records, like access_requests, so they carry no
-- tenant_id: the audience decides who sees one, and members never read the table directly (server code filters
-- under the service role, lib/helpdesk/updates.ts). Per-company feature switches live in tenants.settings.features.

create table merch.announcements (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  title text not null check (length(title) between 1 and 160),
  body text not null check (length(body) <= 6000),
  translations jsonb not null default '{}'::jsonb,        -- { de: { title, body }, ... } written at publish
  audience jsonb not null default '{"kind":"all"}'::jsonb, -- all | addon+key | track+key | feature+key | tenants+ids
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  proposal_id uuid references merch.change_proposals(id) on delete set null,
  created_by_email text,
  published_by_email text,
  published_at timestamptz,
  translation_cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on merch.announcements (number);
create index on merch.announcements (status, published_at desc);
create trigger t_upd before update on merch.announcements for each row execute function merch.touch_updated_at();

create table merch.announcement_reads (
  announcement_id uuid not null references merch.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table merch.announcements enable row level security;
alter table merch.announcement_reads enable row level security;
create policy admin_read on merch.announcements for select using (merch.is_platform_admin());
create policy own_read on merch.announcement_reads for select using (user_id = auth.uid());
revoke insert, update, delete, truncate on merch.announcements, merch.announcement_reads from authenticated;
revoke all on merch.announcements, merch.announcement_reads from anon;

comment on table merch.announcements is 'Updates VIA Labs publishes to the support desk (docs/support.md). Audience decides who sees one.';
