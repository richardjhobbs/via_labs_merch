-- 0022: development track, Stage D route one. Attachments on mail from known senders (and from PLM notification
-- senders when the company runs development) are stored in the private bucket merch-attachments and, when the
-- message is filed on a style, become records (source 'email' or 'plm') read in the background. A record inserted
-- with read_status 'pending' by a job (not by a browser request, which uses next/server after()) is read by the app
-- route /api/jobs/read-record, called from this trigger through pg_net with the same secret as the minute tick.
set search_path = merch, public, extensions;

alter table merch.attachments add column if not exists sha256 text;
alter table merch.attachments add column if not exists record_id uuid references merch.records(id) on delete set null;
alter table merch.attachments add column if not exists source text;        -- email_gmail | email_m365 | forward | plm

insert into storage.buckets (id, name, public, file_size_limit)
values ('merch-attachments', 'merch-attachments', false, 20971520)
on conflict (id) do nothing;

create or replace function merch.records_read_notify() returns trigger language plpgsql security definer set search_path = merch, extensions as $$
declare url text; secret text;
begin
  if new.read_status <> 'pending' or new.source not in ('email', 'plm', 'forward', 'whatsapp', 'zalo') then return new; end if;
  select value into url from merch.app_config where key = 'jobs_url';
  select value into secret from merch.app_config where key = 'jobs_secret';
  if url is null or secret is null then return new; end if;
  perform net.http_post(url := replace(url, '/api/jobs/drain', '/api/jobs/read-record'), headers := jsonb_build_object('content-type', 'application/json', 'x-merch-jobs', secret), body := jsonb_build_object('record_id', new.id), timeout_milliseconds := 5000);
  return new;
end $$;
drop trigger if exists records_read_notify on merch.records;
create trigger records_read_notify after insert on merch.records for each row execute function merch.records_read_notify();
revoke execute on function merch.records_read_notify() from public, anon, authenticated;

-- PLM connectors (Delogue first): a style or sample round synced from a PLM keeps the PLM's id so a later sync
-- updates the same row. styles.plm_ref already exists.
alter table merch.samples add column if not exists plm_ref text;
create unique index if not exists samples_plm_ref on merch.samples (tenant_id, plm_ref) where plm_ref is not null;
create unique index if not exists styles_plm_ref on merch.styles (tenant_id, plm_ref) where plm_ref is not null;
