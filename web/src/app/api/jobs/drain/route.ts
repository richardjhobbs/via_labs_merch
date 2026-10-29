// Called every minute by Supabase pg_cron (merch.tick) with the shared secret.
// Drains the pgmq queues in small batches so each call stays well under the function limit.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { processInbound } from '@/lib/agents/inbound';
import { hasLlm } from '@/lib/llm';

export const maxDuration = 55;
const BUDGET_MS = 45_000;

export async function POST(req: NextRequest) {
  if (!process.env.JOBS_SECRET || req.headers.get('x-merch-jobs') !== process.env.JOBS_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const done: Record<string, number> = { inbound: 0, failed: 0 };
  const errors: string[] = [];

  if (hasLlm()) {
    const { data: batch } = await sb.rpc('q_read', { p_queue: 'merch_inbound', p_n: 5 });
    for (const item of (batch || []) as { msg_id: number; read_ct: number; message: { message_id: string } }[]) {
      if (Date.now() - t0 > BUDGET_MS) break;
      try {
        await processInbound(item.message.message_id);
        await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id });
        done.inbound++;
      } catch (e) {
        done.failed++; errors.push(e instanceof Error ? e.message : String(e));
        if (item.read_ct >= 3) await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id }); // give up after 3 tries; the message stays logged, unprocessed
      }
    }
  }

  const { data: depth } = await sb.rpc('queue_depth');
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ms: Date.now() - t0, done, errors: errors.slice(0, 3), llm: hasLlm(), depth });
}

export async function GET() { return NextResponse.json({ ok: true, service: 'merch-jobs' }); }
