-- 0032: an update is emailed once, on its first publish, to the owners and managers of the companies it is for.
alter table merch.announcements add column if not exists emailed_at timestamptz, add column if not exists emailed_count integer;
