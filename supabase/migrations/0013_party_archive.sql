-- Archive and delete customers and suppliers (Phase 28).
-- A party with no activity (no orders, messages, threads, drafts, compliance tasks, bank accounts or other
-- references) can be deleted at once. A party with activity is archived: hidden from lists and pickers,
-- restorable, and deleted automatically 183 days after archiving by the hourly purge in /api/jobs/drain,
-- which first unlinks orders, messages and other records so they stay (without the party).
alter table merch.parties
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);
create index if not exists parties_archived on merch.parties (archived_at) where archived_at is not null;
