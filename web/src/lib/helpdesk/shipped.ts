// A change proposal that has gone live: tell the person who asked and VIA Labs, once. Only confirmDeployed()
// below sets status 'shipped' (there is no manual "shipped" button), so "now live" is never said before
// production runs the merge. Each proposal is claimed first, so two drains cannot both send.
import { supabaseAdmin } from '@/lib/supabase/server';
import { ledger, notifyVia, tellPerson } from './desk';
import { STOP_FLAGS } from './stuck-rules';

// A merged proposal (status 'pr_open', merged_sha set, no stop flag) is live once the production deployment
// running this code contains it: either it was built from that very commit, or its build started after the
// merge was recorded (a production build of main includes every merge before it). The build session cannot
// see Vercel, so the app confirms the deploy itself.
export async function confirmDeployed(): Promise<number> {
  if (process.env.VERCEL_ENV !== 'production') return 0;
  const sha = process.env.MERCH_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '';
  const builtAt = process.env.MERCH_BUILD_AT || '';
  const sb = supabaseAdmin();
  const { data: rows } = await sb.from('change_proposals').select('id, merged_sha, risk_flags, updated_at, plan').eq('status', 'pr_open').not('merged_sha', 'is', null).limit(10);
  let n = 0;
  for (const p of rows || []) {
    if ((p.risk_flags || []).some((f: string) => STOP_FLAGS.includes(f))) continue;
    const live = (sha && p.merged_sha === sha) || (builtAt && builtAt > new Date(p.updated_at).toISOString());
    if (!live) continue;
    const note = `Live in production (deployment ${sha.slice(0, 7) || 'unknown'}), confirmed by the app.`;
    const { data: done } = await sb.from('change_proposals').update({ status: 'shipped', stuck_reason: null, plan: p.plan ? `${p.plan}\n\n${note}` : note }).eq('id', p.id).eq('status', 'pr_open').select('id');
    if (done?.length) n++;
  }
  return n;
}

export async function notifyShipped(): Promise<number> {
  await confirmDeployed();
  const sb = supabaseAdmin();
  const { data: rows } = await sb.from('change_proposals').select('id, number, title, tenant_id, ticket_id, pr_url').eq('status', 'shipped').is('shipped_notified_at', null).limit(5);
  let n = 0;
  for (const p of rows || []) {
    const { data: claimed } = await sb.from('change_proposals').update({ shipped_notified_at: new Date().toISOString() }).eq('id', p.id).is('shipped_notified_at', null).select('id');
    if (!claimed?.length) continue;
    let who = '';
    if (p.ticket_id) {
      const { data: tk } = await sb.from('support_tickets').select('opened_by_name, tenants(name)').eq('id', p.ticket_id).maybeSingle();
      if (tk) who = `${(tk.tenants as unknown as { name: string }).name} · ${tk.opened_by_name || ''}`;
      await tellPerson(p.ticket_id, 'liveMessage', { title: p.title }, 'shipped');
    }
    await ledger(p.tenant_id, 'VIA Labs', null, `Change proposal #${p.number} (${p.title}) is live`, { change_proposal: p.id });
    const { data: draft } = await sb.from('announcements').select('id').eq('proposal_id', p.id).eq('status', 'draft').limit(1).maybeSingle();
    await notifyVia(`P${p.number} is live: ${p.title}`, [who || 'No ticket linked', 'Built, checked, merged and running in production after your Greenlight. The person who asked has been told in their conversation, on their bell and by email.', ...(draft ? ['An update about it is waiting for you to publish in the console, under Updates.'] : []), ...(p.pr_url ? [p.pr_url] : [])], draft ? '/admin/updates' : '/admin/support');
    n++;
  }
  return n;
}
