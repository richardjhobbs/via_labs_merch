-- 0017: a tech pack is read after the upload has been acknowledged (next/server after()), because a server
-- action that waits a minute for the model is cut off by the platform. read_status says where a record is.
alter table merch.records add column if not exists read_status text not null default 'done';
alter table merch.records add constraint records_read_status_check check (read_status in ('pending', 'done', 'failed', 'skipped'));
