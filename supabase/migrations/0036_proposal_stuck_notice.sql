-- 0036: a greenlit build that stops anywhere between the Greenlight click and production tells VIA Labs once
-- (lib/helpdesk/stuck.ts, called by the minute drain). stuck_reason is the state last reported; a new state
-- reports again, shipping or declining clears it. (0035 is held by another branch.)
alter table merch.change_proposals
  add column if not exists stuck_reason text,
  add column if not exists stuck_notified_at timestamptz;
