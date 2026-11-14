// A change proposal that has gone live: tell the person who asked and VIA Labs, once. The triage task (or a
// person in the console) sets status 'shipped'; the minute drain calls this, so the notice does not depend
// on who shipped it. Each proposal is claimed first, so two drains cannot both send.
import { supabaseAdmin } from '@/lib/supabase/server';
import { TICKET_COLS, ledger, notifyPerson, notifyVia, type Ticket } from './desk';

export async function notifyShipped(): Promise<number> {
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
        await notifyPerson(ticket, ticket.tenants.slug, `The change you asked for is now live: ${p.title}. Refresh the page to see it. If it is not what you expected, reply on this conversation.`);
      }
    }
    await ledger(p.tenant_id, 'VIA Labs', null, `Change proposal #${p.number} (${p.title}) is live`, { change_proposal: p.id });
    await notifyVia(`P${p.number} is live: ${p.title}`, [who || 'No ticket linked', 'Built, merged and deployed after your greenlight. The person who asked has been told.', ...(p.pr_url ? [p.pr_url] : [])], '/admin/support');
    n++;
  }
  return n;
}
