-- Settings: a member's phone number for calls and avatar, and the company logo (owner only, set through server code).
-- Images live in the private bucket merch-media at <tenant_id>/<kind>/<file>; no storage policies, so only the
-- service role reads or writes it, and /api/media serves a file by signed link after a membership check.
alter table merch.memberships add column if not exists phone text, add column if not exists avatar_path text;
alter table merch.memberships drop constraint if exists memberships_phone_chk;
alter table merch.memberships add constraint memberships_phone_chk check (phone is null or phone ~ '^\+?[0-9][0-9 ().-]{5,23}$');
alter table merch.tenants add column if not exists logo_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-media', 'merch-media', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
