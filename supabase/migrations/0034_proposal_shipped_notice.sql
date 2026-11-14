-- 0034: a greenlit proposal is built, merged and deployed by the triage task with no further approval
-- (founder, 14 Nov 2026). When it sets status 'shipped', the minute drain tells the person who asked and
-- VIA Labs once (lib/helpdesk/shipped.ts). merged_sha is the merge commit that went live.
alter table merch.change_proposals add column if not exists merged_sha text, add column if not exists shipped_notified_at timestamptz;
update merch.change_proposals set shipped_notified_at = now() where status = 'shipped' and shipped_notified_at is null;
