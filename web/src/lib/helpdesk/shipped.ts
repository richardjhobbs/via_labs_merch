// A change proposal that has gone live: tell the person who asked and VIA Labs, once. The triage task (or a
// person in the console) sets status 'shipped'; the minute drain calls this, so the notice does not depend
// on who shipped it. Each proposal is claimed first, so two drains cannot both send.
import { supabaseAdmin } from '@/lib/supabase/server';
import { TICKET_COLS, ledger, notifyPerson, notifyVia, type Ticket } from './desk';
import { LOCALES } from '@/i18n/locales';

// A merged proposal (status 'pr_open', merged_sha set, no stop flag) is live once the production deployment
// running this code contains it: either it was built from that very commit, or its build started after the
// merge was recorded (a production build of main includes every merge before it). The build session cannot
// see Vercel, so the app confirms the deploy itself.
const STOP_FLAGS = ['needs the founder', 'checks failed', 'deploy failed'];
export async function confirmDeployed(): Promise<number> {
  if (process.env.VERCEL_ENV !== 'production') return 0;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
  const builtAt = process.env.MERCH_BUILD_AT || '';
  const sb = supabaseAdmin();
  const { data: rows } = await sb.from('change_proposals').select('id, merged_sha, risk_flags, updated_at, plan').eq('status', 'pr_open').not('merged_sha', 'is', null).limit(10);
  let n = 0;
  for (const p of rows || []) {
    if ((p.risk_flags || []).some((f: string) => STOP_FLAGS.includes(f))) continue;
    const live = (sha && p.merged_sha === sha) || (builtAt && builtAt > new Date(p.updated_at).toISOString());
    if (!live) continue;
    const note = `Live in production (deployment ${sha.slice(0, 7) || 'unknown'}), confirmed by the app.`;
    const { data: done } = await sb.from('change_proposals').update({ status: 'shipped', plan: p.plan ? `${p.plan}\n\n${note}` : note }).eq('id', p.id).eq('status', 'pr_open').select('id');
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
      const { data: tk } = await sb.from('support_tickets').select(`${TICKET_COLS}, tenants(slug, name)`).eq('id', p.ticket_id).maybeSingle();
      if (tk) {
        const ticket = tk as unknown as Ticket & { tenants: { slug: string; name: string } };
        who = `${ticket.tenants.name} · ${ticket.opened_by_name || ''}`;
        if (ticket.status !== 'closed') await sb.from('support_tickets').update({ status: 'shipped', via_activity_at: new Date().toISOString() }).eq('id', ticket.id);
        // said in the conversation itself, in the person's language, so it is there when they open the ticket
        const l = (LOCALES as readonly string[]).includes(ticket.locale || '') ? (ticket.locale as string) : 'en';
        const line = ((await import(`../../../messages/${l}.json`)).default as { help: { liveMessage: string } }).help.liveMessage.replace('{title}', p.title);
        await sb.from('support_messages').insert({ tenant_id: ticket.tenant_id, ticket_id: ticket.id, author_kind: 'via', author_name: null, body: line });
        await sb.from('support_tickets').update({ last_message_at: new Date().toISOString() }).eq('id', ticket.id);
        await notifyPerson(ticket, ticket.tenants.slug, line);
      }
    }
    await ledger(p.tenant_id, 'VIA Labs', null, `Change proposal #${p.number} (${p.title}) is live`, { change_proposal: p.id });
    await notifyVia(`P${p.number} is live: ${p.title}`, [who || 'No ticket linked', 'Built, merged and deployed after your greenlight. The person who asked has been told.', ...(p.pr_url ? [p.pr_url] : [])], '/admin/support');
    n++;
  }
  return n;
}
