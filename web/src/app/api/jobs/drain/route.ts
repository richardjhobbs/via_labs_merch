// Called every minute by Supabase pg_cron (merch.tick) with the shared secret.
// Drains the pgmq queues in small batches so each call stays well under the function limit,
// then gives one company its hourly proactive pass.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { processInbound } from '@/lib/agents/inbound';
import { runProactive, lastPass } from '@/lib/agents/proactive';
import { hasLlm } from '@/lib/llm';

export const maxDuration = 55;
const BUDGET_MS = 40_000;

export async function POST(req: NextRequest) {
  if (!process.env.JOBS_SECRET || req.headers.get('x-merch-jobs') !== process.env.JOBS_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const done: Record<string, number> = { inbound: 0, jobs: 0, proactive: 0, failed: 0 };
  const errors: string[] = [];
  const left = () => BUDGET_MS - (Date.now() - t0);

  if (hasLlm()) {
    // 1. inbound messages
    const { data: batch } = await sb.rpc('q_read', { p_queue: 'merch_inbound', p_n: 5 });
    for (const item of (batch || []) as { msg_id: number; read_ct: number; message: { message_id: string } }[]) {
      if (left() < 12_000) break;
      try { await processInbound(item.message.message_id); await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id }); done.inbound++; }
      catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); if (item.read_ct >= 3) await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id }); }
    }
    // 2. explicit agent jobs (a proactive pass requested by the sample loader or the console)
    const { data: jobs } = await sb.rpc('q_read', { p_queue: 'merch_agent_runs', p_n: 2 });
    for (const job of (jobs || []) as { msg_id: number; read_ct: number; message: { type: string; tenant_id: string } }[]) {
      if (left() < 20_000) break;
      try {
        if (job.message.type === 'proactive') { await runProactive(job.message.tenant_id, { force: true }); done.proactive++; }
        await sb.rpc('q_delete', { p_queue: 'merch_agent_runs', p_id: job.msg_id }); done.jobs++;
      } catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); if (job.read_ct >= 2) await sb.rpc('q_delete', { p_queue: 'merch_agent_runs', p_id: job.msg_id }); }
    }
    // 3. hourly pass for the company that has waited longest
    if (left() > 25_000 && done.proactive === 0) {
      const { data: tenants } = await sb.from('tenants').select('id').order('created_at');
      let pick: string | null = null, oldest = -1;
      for (const t of tenants || []) {
        const lp = await lastPass(t.id); const age = lp ? Date.now() - Date.parse(lp) : Number.MAX_SAFE_INTEGER;
        if (age > 60 * 60_000 && age > oldest) { pick = t.id; oldest = age; }
      }
      if (pick) { try { const r = await runProactive(pick); if ('queued' in r) done.proactive++; } catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); } }
    }
  }

  const { data: depth } = await sb.rpc('queue_depth');
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ms: Date.now() - t0, done, errors: errors.slice(0, 3), llm: hasLlm(), depth });
}

export async function GET() { return NextResponse.json({ ok: true, service: 'merch-jobs' }); }
