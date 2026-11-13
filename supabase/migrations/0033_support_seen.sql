-- 0033: notification bells on the support desk. Who last did something on a ticket, and who has looked since:
-- the person's bell counts tickets where VIA Labs replied or moved the status after the person last opened it;
-- the console's bell counts tickets the person opened or wrote on after VIA Labs last opened it.
alter table merch.support_tickets
  add column if not exists person_activity_at timestamptz,   -- the person opened the ticket or wrote
  add column if not exists via_activity_at timestamptz,      -- VIA Labs staff replied or moved the status
  add column if not exists person_seen_at timestamptz,       -- the person last opened the ticket
  add column if not exists via_seen_at timestamptz;          -- VIA Labs last opened it in the console
update merch.support_tickets set person_activity_at = coalesce(person_activity_at, last_message_at);
create index if not exists support_tickets_via_unseen on merch.support_tickets (person_activity_at desc);
