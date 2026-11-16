// The safety net between Greenlight and production (docs/support.md). The build runs in a Claude Code session
// the app cannot see, so the minute drain looks at each greenlit proposal's row and tells VIA Labs once when
// it has stopped moving: the build never started, it stopped without merging, it stopped and needs the
// founder, or it merged and production has not picked it up. A database read per minute; no model calls.
import { supabaseAdmin } from '@/lib/supabase/server';
import { notifyVia } from './desk';
import { stuckReason, type StuckRow as Row } from './stuck-rules';

export async function notifyStuck(): Promise<number> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('change_proposals').select('id, number, title, status, risk_flags, merged_sha, decided_at, updated_at, plan, stuck_reason').in('status', ['greenlit', 'building', 'pr_open', 'planned']).not('decided_at', 'is', null).limit(20);
  let n = 0;
  for (const p of (data || []) as Row[]) {
    const why = stuckReason(p);
    if (!why || why === p.stuck_reason) continue;
    const { data: claimed } = await sb.from('change_proposals').update({ stuck_reason: why, stuck_notified_at: new Date().toISOString() }).eq('id', p.id).eq('updated_at', p.updated_at).select('id');
    if (!claimed?.length) continue;
    const last = (p.plan || '').split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 600);
    await notifyVia(`P${p.number} is stuck: ${p.title}`, [why, ...(last ? [`Last note from the build: ${last}`] : []), 'Open the console: "Build again" restarts it once the cause is dealt with.'], '/admin/support');
    n++;
  }
  return n;
}
