-- Queue depth for the job runner's health report (service role only).
create or replace function merch.queue_depth() returns jsonb language sql security definer set search_path = merch, pgmq as $$
  select coalesce(jsonb_object_agg(q.queue_name, (pgmq.metrics(q.queue_name)).queue_length), '{}'::jsonb)
  from pgmq.list_queues() q where q.queue_name like 'merch_%';
$$;
revoke all on function merch.queue_depth() from public, anon, authenticated;
