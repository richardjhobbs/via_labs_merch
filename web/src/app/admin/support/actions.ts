'use server';
// VIA Labs' side of the support desk: reply on a ticket, move its status, and decide a change proposal.
// requireAdmin() on every action; the person who opened the ticket is emailed and the company's ledger records it.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fireTriage, TOKEN_KEY } from '@/lib/helpdesk/fire';
import { STATUSES, TICKET_COLS, ledger, notifyPerson, tellPerson, type Ticket, type TicketStatus } from '@/lib/helpdesk/desk';

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

// The decisions on a change proposal (docs/support.md). Greenlight is the instruction to build and deploy: it
// tells the person it is approved and starts the build at once. Decline tells the person, with the reason.
// Build again restarts a greenlit build that stopped before merging. There is no manual "shipped": the app
// says a change is live only once production runs it (lib/helpdesk/shipped.ts).
export async function decideProposal(form: FormData) {
  const m = await requireAdmin();
  const id = String(form.get('id') || ''), action = String(form.get('status') || ''), note = String(form.get('note') || '').trim().slice(0, 1000);
  if (!['greenlit', 'declined', 'rebuild'].includes(action)) redirect(`/admin/support?error=${encodeURIComponent('That decision did not come through. Try again.')}`);
  const sb = supabaseAdmin();
  const { data: p } = await sb.from('change_proposals').select('id, number, title, status, tenant_id, ticket_id, merged_sha').eq('id', id).maybeSingle();
  if (!p) redirect('/admin/support');
  if (['shipped', 'declined'].includes(p.status)) redirect(`/admin/support?error=${encodeURIComponent(`P${p.number} is already ${p.status}.`)}`);
  if (p.merged_sha && action !== 'declined') redirect(`/admin/support?error=${encodeURIComponent(`P${p.number} is already merged; it goes live with the next production deployment.`)}`);
  const now = new Date().toISOString();
  const status = action === 'declined' ? 'declined' : 'greenlit';
  const { error: failed } = await sb.from('change_proposals').update({ status, decided_by_email: m.user.email, decided_at: now, stuck_reason: null, stuck_notified_at: null, ...(action === 'rebuild' ? { risk_flags: [] } : {}), ...(note ? { decision_note: note } : {}) }).eq('id', id);
  if (failed) redirect(`/admin/support?error=${encodeURIComponent(failed.message)}`);
  if (p.ticket_id && action === 'greenlit') await tellPerson(p.ticket_id, 'approvedMessage', { title: p.title }, 'building');
  if (p.ticket_id && action === 'declined') await tellPerson(p.ticket_id, 'declinedMessage', { title: p.title, reason: note ? ` ${note}` : '' }, 'declined');
  await ledger(p.tenant_id, 'VIA Labs', null, `Change proposal #${p.number} (${p.title}) ${action === 'declined' ? 'declined' : action === 'rebuild' ? 'sent to be built again' : 'greenlit'} by VIA Labs`, { change_proposal: p.id });
  revalidatePath('/admin/support');
  if (status === 'greenlit') {
    const f = await fireTriage(`P${p.number} was greenlit.`);
    if (!f.fired) await sb.from('change_proposals').update({ stuck_reason: `The build agent link failed: ${f.reason}` }).eq('id', id);
    redirect(f.fired ? `/admin/support?saved=${encodeURIComponent(`P${p.number} greenlit. The build has started; you and the person who asked are told when it is live, or you are told if it gets stuck.`)}` : `/admin/support?error=${encodeURIComponent(`P${p.number} greenlit and recorded, but the build has NOT started: the link to the build agent failed (${f.reason}). Fix the link below, then press Build again.`)}`);
  }
  redirect('/admin/support?saved=1');
}

// The build agent link: the token of the triage task's API trigger, pasted here by VIA Labs. Stored service
// role only in merch.app_config; never shown again after saving.
export async function saveTriageToken(form: FormData) {
  await requireAdmin();
  const tok = String(form.get('token') || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(tok)) redirect(`/admin/support?error=${encodeURIComponent('That does not look like the token from the Claude app (it starts with sk-ant-).')}`);
  const { error } = await supabaseAdmin().from('app_config').upsert({ key: TOKEN_KEY, value: tok, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) redirect(`/admin/support?error=${encodeURIComponent(error.message)}`);
  const f = await fireTriage('Link test from the VIA Merch console. Check for work as usual.');
  revalidatePath('/admin/support');
  redirect(`/admin/support?saved=${encodeURIComponent(f.fired ? 'Build agent link saved and tested: it answered. Greenlight now starts the build at once.' : `Saved, but the test failed: ${f.reason}`)}`);
}

export async function testTriageLink() {
  await requireAdmin();
  const f = await fireTriage('Link test from the VIA Merch console. Check for work as usual.');
  redirect(f.fired ? `/admin/support?saved=${encodeURIComponent('Build agent link works.')}` : `/admin/support?error=${encodeURIComponent(`Build agent link failed: ${f.reason}`)}`);
}
