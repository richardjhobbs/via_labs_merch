// Called every minute by Supabase pg_cron (merch.tick) with the shared secret.
// Drains the pgmq queues in small batches so each call stays well under the function limit,
// then gives one company its hourly proactive pass and one its compliance pass.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { processInbound } from '@/lib/agents/inbound';
import { runProactive, lastPass } from '@/lib/agents/proactive';
import { hasLlm } from '@/lib/llm';
import { googleConfigured, syncGmail } from '@/lib/connectors/google';
import { microsoftConfigured, syncOutlook } from '@/lib/connectors/microsoft';
import { sendPending } from '@/lib/connectors/outbound';
import { CHANNEL_COLS, type Channel } from '@/lib/connectors/mail';
import { syncDelogue } from '@/lib/connectors/delogue';
import { purgeArchived } from '@/lib/party-lifecycle';
import { runAllAlerts } from '@/lib/alerts';
import { nextEsgTenant, runEsgPass } from '@/lib/agents/esg-pass';
import { updateBrief } from '@/lib/agents/order-agent';
import { riseAll } from '@/lib/agents/desks';
import { conflictPass, deliverBriefs, dueMorningBrief, morningBrief } from '@/lib/agents/manager';
import { capState, noteCapReached, proposeLesson, type LessonJob } from '@/lib/agents/learning';
import { capAllows, type Work } from '@/lib/agents/learning-rules';
import { hoursOf, isWorkingTime } from '@/lib/work-hours';

export const maxDuration = 55;
const BUDGET_MS = 40_000;

export async function POST(req: NextRequest) {
  if (!process.env.JOBS_SECRET || req.headers.get('x-merch-jobs') !== process.env.JOBS_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const done: Record<string, number> = { mail_in: 0, mail_out: 0, inbound: 0, jobs: 0, proactive: 0, briefs: 0, esg: 0, failed: 0 };
  const errors: string[] = [];
  const left = () => BUDGET_MS - (Date.now() - t0);
  // the company's daily spending cap: past it, the work nobody is waiting on waits for tomorrow
  const capCache = new Map<string, Awaited<ReturnType<typeof capState>>>();
  // background work (sweep, capacity decisions, compliance pass) runs only in the company's working hours
  const hoursCache = new Map<string, boolean>();
  const atWork = async (tenantId: string) => {
    if (!hoursCache.has(tenantId)) { const { data: tn } = await sb.from('tenants').select('tz, settings').eq('id', tenantId).single(); hoursCache.set(tenantId, isWorkingTime(new Date(), hoursOf(tn?.tz as string, tn?.settings))); }
    if (!hoursCache.get(tenantId)) done.after_hours = (done.after_hours || 0) + 1;
    return hoursCache.get(tenantId)!;
  };
  const capOk = async (tenantId: string, work: Work) => {
    if (['sweep', 'conflicts', 'compliance'].includes(work) && !(await atWork(tenantId))) return false;
    if (!capCache.has(tenantId)) capCache.set(tenantId, await capState(sb, tenantId));
    const c = capCache.get(tenantId)!;
    if (capAllows(work, c.spent, c.cap)) return true;
    done.capped = (done.capped || 0) + 1; await noteCapReached(sb, tenantId).catch(() => null);
    return false;
  };

  // 0. connected mailboxes (Gmail, Microsoft 365): new mail in, approved replies out (about 20 s at most)
  const kinds = [...(googleConfigured() ? ['email_gmail'] : []), ...(microsoftConfigured() ? ['email_m365'] : [])];
  if (kinds.length) {
    const until = t0 + 12_000;
    const { data: boxes } = await sb.from('channels').select(CHANNEL_COLS).in('kind', kinds).eq('status', 'connected').or(`last_sync_at.is.null,last_sync_at.lt.${new Date(Date.now() - 50_000).toISOString()}`).order('last_sync_at', { ascending: true, nullsFirst: true }).limit(5);
    for (const ch of (boxes || []) as Channel[]) {
      if (Date.now() > until - 3000) break;
      try { done.mail_in += (ch.kind === 'email_m365' ? await syncOutlook(sb, ch, until) : await syncGmail(sb, ch, until)).ingested; } catch (e) { done.failed++; errors.push(`${ch.kind} ${ch.account}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    try { const s = await sendPending(sb, t0 + 20_000); done.mail_out += s.sent; done.failed += s.failed; } catch (e) { done.failed++; errors.push(`send: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 0b. PLM connections (Delogue): the one that has waited longest, at most hourly, read only
  if (left() > 25_000) {
    const { data: plm } = await sb.from('channels').select(CHANNEL_COLS).eq('kind', 'plm').eq('status', 'connected').or(`last_sync_at.is.null,last_sync_at.lt.${new Date(Date.now() - 55 * 60_000).toISOString()}`).order('last_sync_at', { ascending: true, nullsFirst: true }).limit(1);
    for (const ch of (plm || []) as Channel[]) {
      try { const r = await syncDelogue(sb, ch, t0 + Math.min(BUDGET_MS - 8_000, left() - 8_000)); done.plm = r.styles + r.files + r.samples; } catch (e) { done.failed++; errors.push(`plm ${ch.account}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  if (hasLlm()) {
    // 1. inbound messages
    const { data: batch } = await sb.rpc('q_read', { p_queue: 'merch_inbound', p_n: 5 });
    for (const item of (batch || []) as { msg_id: number; read_ct: number; message: { message_id: string } }[]) {
      if (left() < 12_000) break;
      try { await processInbound(item.message.message_id); await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id }); done.inbound++; }
      catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); if (item.read_ct >= 3) await sb.rpc('q_delete', { p_queue: 'merch_inbound', p_id: item.msg_id }); }
    }
    // 2. explicit agent jobs: a proactive pass (sample loader, console) or an order agent's brief update after an event
    const { data: jobs } = await sb.rpc('q_read', { p_queue: 'merch_agent_runs', p_n: 4 });
    const briefed = new Set<string>();
    for (const job of (jobs || []) as { msg_id: number; read_ct: number; message: { type: string; tenant_id: string; order_id?: string; reason?: string } & Partial<Omit<LessonJob, 'type' | 'tenant_id'>> }[]) {
      if (left() < (job.message.type === 'brief' ? 12_000 : 20_000)) break;
      try {
        if (job.message.type === 'proactive') { await runProactive(job.message.tenant_id, { force: true }); done.proactive++; }
        // several events on one order in the same minute need one update: the update reads everything new since the last version
        if (job.message.type === 'lesson' && job.message.draft_id) { await proposeLesson(job.message as unknown as LessonJob); done.lessons = (done.lessons || 0) + 1; }
        if (job.message.type === 'brief' && job.message.order_id && !briefed.has(job.message.order_id)) { briefed.add(job.message.order_id); const r = await updateBrief(job.message.tenant_id, job.message.order_id, job.message.reason); if ('version' in r) done.briefs++; }
        await sb.rpc('q_delete', { p_queue: 'merch_agent_runs', p_id: job.msg_id }); done.jobs++;
      } catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); if (job.read_ct >= 2) await sb.rpc('q_delete', { p_queue: 'merch_agent_runs', p_id: job.msg_id }); }
    }
    // 2b. Mira as manager: the morning brief for one company whose day has started, and once an hour at :41
    //     the capacity clashes across desks (at most two new decisions per company per pass)
    if (left() > 25_000) {
      try { const due = await dueMorningBrief(sb); if (due && await capOk(due, 'morning')) { await morningBrief(due); done.morning = 1; } } catch (e) { done.failed++; errors.push(`morning: ${e instanceof Error ? e.message : String(e)}`); }
      // each person's copy at 07:00 in their own time zone (cheap: no model call)
      try { const n = await deliverBriefs(sb, t0 + BUDGET_MS); if (n) done.briefs_sent = n; } catch (e) { done.failed++; errors.push(`deliver: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (new Date().getUTCMinutes() === 41 && left() > 22_000) {
      const { data: ts } = await sb.from('tenants').select('id');
      for (const tn of ts || []) { if (left() < 18_000) break; try { if (!(await capOk(tn.id, 'conflicts'))) continue; const r = await conflictPass(tn.id); if ('decided' in r) done.conflicts = (done.conflicts || 0) + (r.decided || 0); } catch (e) { done.failed++; errors.push(`conflicts: ${e instanceof Error ? e.message : String(e)}`); } }
    }
    // 2c. first briefs: open orders whose agent has no memory yet, two a minute while budget allows
    if (left() > 22_000) {
      const { data: fresh } = await sb.rpc('orders_without_brief', { p_n: 2 });
      for (const f of (fresh || []) as { order_id: string; tenant_id: string }[]) {
        if (left() < 18_000) break;
        try { if (!(await capOk(f.tenant_id, 'first_briefs'))) continue; const r = await updateBrief(f.tenant_id, f.order_id, 'first brief'); if ('version' in r) done.briefs++; } catch (e) { done.failed++; errors.push(`brief: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    // 3. hourly pass for the company that has waited longest
    if (left() > 25_000 && done.proactive === 0) {
      const { data: tenants } = await sb.from('tenants').select('id').order('created_at');
      let pick: string | null = null, oldest = -1;
      for (const t of tenants || []) {
        const lp = await lastPass(t.id); const age = lp ? Date.now() - Date.parse(lp) : Number.MAX_SAFE_INTEGER;
        if (age > 60 * 60_000 && age > oldest) { pick = t.id; oldest = age; }
      }
      if (pick && await capOk(pick, 'sweep')) { try { const r = await runProactive(pick); if ('queued' in r) done.proactive++; } catch (e) { done.failed++; errors.push(e instanceof Error ? e.message : String(e)); } }
    }
  }

  // 4. hourly ESG and compliance pass (tasks, reminders, supplier requests) for one company with the add-on
  if (left() > 20_000) {
    try { const pick = await nextEsgTenant(); if (pick && await capOk(pick, 'compliance')) { const r = await runEsgPass(pick); if ('created' in r) done.esg++; } }
    catch (e) { done.failed++; errors.push(`esg: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // once an hour: silence alerts and unsent-reply reminders, raised, emailed, escalated and cleared
  if (new Date().getUTCMinutes() === 23 && left() > 12_000) { try { const r = await runAllAlerts(sb, t0 + BUDGET_MS); done.alerts = r.raised; done.alerts_resolved = r.resolved; } catch (e) { done.failed++; errors.push(`alerts: ${e instanceof Error ? e.message : String(e)}`); } }
  // once an hour: decisions open past the company's limit move up one layer (desk, then Mira's owners and managers)
  if (new Date().getUTCMinutes() === 29 && left() > 10_000) { try { done.risen = await riseAll(sb, t0 + BUDGET_MS); } catch (e) { done.failed++; errors.push(`rise: ${e instanceof Error ? e.message : String(e)}`); } }
  // once an hour: delete customers and suppliers archived more than 183 days ago
  if (new Date().getUTCMinutes() === 17 && left() > 10_000) { try { done.purged = await purgeArchived(sb, t0 + BUDGET_MS); } catch (e) { done.failed++; errors.push(`purge: ${e instanceof Error ? e.message : String(e)}`); } }
  const { data: depth } = await sb.rpc('queue_depth');
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ms: Date.now() - t0, done, errors: errors.slice(0, 3), llm: hasLlm(), depth });
}

export async function GET() { return NextResponse.json({ ok: true, service: 'merch-jobs' }); }
