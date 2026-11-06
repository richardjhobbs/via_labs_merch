-- Gmail channel (Phase 21). A merchandiser connects their own mailbox with Google OAuth.
-- Tokens are sealed in the app (AES-256-GCM, MERCH_TOKEN_KEY) into channels.auth_enc and only the
-- service role reads or writes that column. Members see the channel's status, never its tokens.
-- All channel writes go through server code (service role) after a role check, so the browser
-- client cannot create, change or remove a channel.

revoke all on merch.channels from anon;
revoke all on merch.channels from authenticated;
grant select (id, tenant_id, kind, name, owner_user_id, status, account, scope, watch_expires_at, last_sync_at, error, config, created_at, updated_at) on merch.channels to authenticated;

-- one row per mailbox per company; reconnecting the same account updates it
create unique index if not exists channels_tenant_kind_account on merch.channels (tenant_id, kind, lower(account)) where account is not null;

-- the minute worker picks approved replies waiting to go out on a connected channel
create index if not exists messages_outbound_pending on merch.messages (channel_id) where direction = 'out' and sent_at is null and channel_id is not null;
