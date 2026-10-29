-- Conversations: a thread per party and order, with an agent-written summary cached on it.
alter table merch.threads
  add column if not exists summary text,
  add column if not exists summary_at timestamptz,
  add column if not exists summary_count int not null default 0,
  add column if not exists kind text;                 -- email | whatsapp | wecom | zalo | portal | ...
create index if not exists threads_party_order on merch.threads (tenant_id, party_id, order_id);
create index if not exists messages_thread on merch.messages (thread_id, received_at);
