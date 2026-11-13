'use server';
// VIA Labs' side of the support desk: reply on a ticket, move its status, and decide a change proposal.
// requireAdmin() on every action; the person who opened the ticket is emailed and the company's ledger records it.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { STATUSES, TICKET_COLS, ledger, notifyPerson, type Ticket, type TicketStatus } from '@/lib/helpdesk/desk';

async function load(id: string) {
  const { data } = await supabaseAdmin().from('support_tickets').select(`${TICKET_COLS}, tenants(slug)`).eq('id', id).maybeSingle();
  if (!data) return null;
  return { ticket: data as unknown as Ticket, slug: (data.tenants as unknown as { slug: string }).slug };
}

export async function viaReply(form: FormData) {
  const m = await requireAdmin();
  const id = String(form.get('id') || ''), body = String(form.get('body') || '').trim().slice(0, 8000);
  const found = await load(id);
  if (!found || !body) redirect(`/admin/support/${id}?error=${encodeURIComponent('Write a reply first.')}`);
  const sb = supabaseAdmin();
  const name = String(form.get('name') || '').trim().slice(0, 60) || 'VIA Labs';
  await sb.from('support_messages').insert({ tenant_id: found.ticket.tenant_id, ticket_id: id, author_kind: 'via', author_user: m.user.id, author_name: name, body });
  await sb.from('support_tickets').update({ last_message_at: new Date().toISOString(), via_activity_at: new Date().toISOString(), via_seen_at: new Date().toISOString(), ...(found.ticket.status === 'open' ? { status: 'with_via' } : {}) }).eq('id', id);
  await notifyPerson(found.ticket, found.slug, `VIA Labs replied: ${body.slice(0, 500)}`);
  revalidatePath(`/admin/support/${id}`);
  redirect(`/admin/support/${id}?saved=1`);
}

export async function setTicketStatus(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') || ''), status = String(form.get('status') || '') as TicketStatus;
  const found = await load(id);
  if (!found || !STATUSES.includes(status)) redirect('/admin/support');
  if (status !== found.ticket.status) {
    await supabaseAdmin().from('support_tickets').update({ status, closed_at: status === 'closed' ? new Date().toISOString() : null, via_activity_at: new Date().toISOString() }).eq('id', id);
    await ledger(found.ticket.tenant_id, 'VIA Labs', null, `Support ticket #${found.ticket.number} set to ${status.replace('_', ' ')} by VIA Labs`, { support_ticket: id });
  }
  revalidatePath('/admin/support');
  redirect(`/admin/support/${id}?saved=1`);
}

// proposal status → what the person sees on the ticket
const MIRROR: Record<string, TicketStatus> = { planned: 'planned', greenlit: 'planned', building: 'building', pr_open: 'building', shipped: 'shipped', declined: 'declined' };
const LINE: Record<string, string> = { planned: 'VIA Labs has planned this change.', building: 'VIA Labs is working on this change.', shipped: 'This change is now live.', declined: 'VIA Labs has decided not to make this change for now.' };

export async function decideProposal(form: FormData) {
  const m = await requireAdmin();
  const id = String(form.get('id') || ''), status = String(form.get('status') || ''), note = String(form.get('note') || '').trim().slice(0, 1000);
  const lane = String(form.get('lane') || ''), pr = String(form.get('pr_url') || '').trim().slice(0, 300);
  if (!MIRROR[status]) redirect(`/admin/support?error=${encodeURIComponent('That decision did not come through. Try again.')}`);
  const sb = supabaseAdmin();
  const { data: p } = await sb.from('change_proposals').select('id, number, title, status, tenant_id, ticket_id').eq('id', id).maybeSingle();
  if (!p) redirect('/admin/support');
  const { error: failed } = await sb.from('change_proposals').update({ status, decided_by_email: m.user.email, decided_at: new Date().toISOString(), ...(note ? { decision_note: note } : {}), ...(['proceed', 'greenlight'].includes(lane) ? { lane } : {}), ...(/^https:\/\/github\.com\//.test(pr) ? { pr_url: pr } : {}) }).eq('id', id);
  if (failed) redirect(`/admin/support?error=${encodeURIComponent(failed.message)}`);
  const shown = MIRROR[status];
  if (p.ticket_id) {
    const found = await load(p.ticket_id);
    if (found && found.ticket.status !== shown && found.ticket.status !== 'closed') {
      await sb.from('support_tickets').update({ status: shown, via_activity_at: new Date().toISOString() }).eq('id', p.ticket_id);
      await notifyPerson(found.ticket, found.slug, `${LINE[shown]}${note && shown === 'declined' ? ` ${note}` : ''}`);
    }
  }
  await ledger(p.tenant_id, 'VIA Labs', null, `Change proposal #${p.number} (${p.title}) set to ${status.replace('_', ' ')} by VIA Labs`, { change_proposal: p.id });
  revalidatePath('/admin/support');
  redirect('/admin/support?saved=1');
}
