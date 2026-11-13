'use server';
// The support desk's server actions: start a conversation, reply, close, and get an upload link for a screenshot.
// Every write is under the service role after supportMe() has shown the person belongs to the company.
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hasLlm, hasDeepseek } from '@/lib/llm';
import { runSupportAgent } from '@/lib/helpdesk/agent';
import { SUPPORT_BUCKET, TICKET_COLS, cleanAttachments, ledger, notifyVia, overLimit, supportMe, ticketFor, type Ticket } from '@/lib/helpdesk/desk';

export type DeskResult = { ok: boolean; id?: string; error?: 'empty' | 'limit' | 'agent' | 'closed' | 'missing' };

async function answer(ticket: Ticket, me: Awaited<ReturnType<typeof supportMe>>): Promise<DeskResult> {
  const name = me.membership.display_name || me.user.email || 'A member';
  const live = hasLlm() || hasDeepseek();
  if (!live || (await overLimit(me.user.id))) {
    const limited = live;
    await supabaseAdmin().from('support_tickets').update({ status: 'with_via' }).eq('id', ticket.id).in('status', ['open', 'answered']);
    await notifyVia(`Support #${ticket.number}: ${limited ? 'hourly limit reached' : 'agent not available'}`, [`${me.tenant.name} · ${name}`], `/admin/support/${ticket.id}`);
    return { ok: false, id: ticket.id, error: limited ? 'limit' : 'agent' };
  }
  const r = await runSupportAgent(ticket, { userId: me.user.id, name, email: me.user.email || null, membership: me.membership, lang: await getLocale() });
  return r.text ? { ok: true, id: ticket.id } : { ok: false, id: ticket.id, error: 'agent' };
}

export async function startTicket(slug: string, text: string, attachments: unknown, page: string): Promise<DeskResult> {
  const me = await supportMe(slug);
  const body = text.trim().slice(0, 8000);
  if (!body) return { ok: false, error: 'empty' };
  const sb = supabaseAdmin();
  const name = me.membership.display_name || me.user.email || 'A member';
  const { data: ticket, error } = await sb.from('support_tickets').insert({ tenant_id: me.tenant.id, opened_by: me.user.id, opened_by_name: name, opened_by_email: me.user.email, opened_by_role: me.membership.role, title: body.replace(/\s+/g, ' ').slice(0, 80), page: page.slice(0, 200) || null, locale: await getLocale(), person_activity_at: new Date().toISOString(), person_seen_at: new Date().toISOString() }).select(TICKET_COLS).single();
  if (error || !ticket) return { ok: false, error: 'missing' };
  const t = ticket as Ticket;
  await sb.from('support_messages').insert({ tenant_id: me.tenant.id, ticket_id: t.id, author_kind: 'person', author_user: me.user.id, author_name: name, body, attachments: cleanAttachments(attachments, me.tenant.id, me.user.id) });
  await ledger(me.tenant.id, name, me.user.id, `Support ticket #${t.number} opened with VIA Labs`, { support_ticket: t.id });
  const r = await answer(t, me);
  revalidatePath(`/support/${slug}`);
  return r;
}

export async function replyTicket(slug: string, id: string, text: string, attachments: unknown): Promise<DeskResult> {
  const me = await supportMe(slug);
  const body = text.trim().slice(0, 8000);
  if (!body) return { ok: false, error: 'empty' };
  const found = await ticketFor(id);   // RLS: the person's own ticket, or the company's for an owner or manager
  if (!found || found.ticket.tenant_id !== me.tenant.id) return { ok: false, error: 'missing' };
  if (found.ticket.status === 'closed') return { ok: false, error: 'closed' };
  const sb = supabaseAdmin();
  const name = me.membership.display_name || me.user.email || 'A member';
  await sb.from('support_messages').insert({ tenant_id: me.tenant.id, ticket_id: id, author_kind: 'person', author_user: me.user.id, author_name: name, body, attachments: cleanAttachments(attachments, me.tenant.id, me.user.id) });
  // a settled ticket the person writes on again is open again; one VIA Labs holds stays with them
  const status = found.ticket.status === 'answered' ? 'open' : found.ticket.status;
  await sb.from('support_tickets').update({ status, last_message_at: new Date().toISOString(), person_activity_at: new Date().toISOString() }).eq('id', id);
  if (status === 'with_via') await notifyVia(`Support #${found.ticket.number}: new message`, [`${me.tenant.name} · ${name}`, body.slice(0, 600)], `/admin/support/${id}`);
  const r = await answer({ ...found.ticket, status }, me);
  revalidatePath(`/support/${slug}/t/${id}`);
  return r;
}

export async function closeTicket(slug: string, id: string): Promise<DeskResult> {
  const me = await supportMe(slug);
  const found = await ticketFor(id);
  if (!found || found.ticket.tenant_id !== me.tenant.id) return { ok: false, error: 'missing' };
  if (found.ticket.status === 'closed') return { ok: true, id };
  await supabaseAdmin().from('support_tickets').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id);
  await ledger(me.tenant.id, me.membership.display_name || me.user.email || 'A member', me.user.id, `Support ticket #${found.ticket.number} closed`, { support_ticket: id });
  revalidatePath(`/support/${slug}`); revalidatePath(`/support/${slug}/t/${id}`);
  return { ok: true, id };
}

// A one-time link to put one screenshot in the private bucket, under the person's own folder.
export async function screenshotLink(slug: string, filename: string, mime: string): Promise<{ ok: boolean; path?: string; url?: string }> {
  const me = await supportMe(slug);
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mime];
  if (!ext || !filename) return { ok: false };
  const path = `${me.tenant.id}/${me.user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await supabaseAdmin().storage.from(SUPPORT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false };
  return { ok: true, path, url: data.signedUrl };
}
