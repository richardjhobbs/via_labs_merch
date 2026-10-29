-- Company website on access requests.
alter table merch.access_requests add column if not exists url text;
