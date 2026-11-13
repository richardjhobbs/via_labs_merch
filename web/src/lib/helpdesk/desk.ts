// The support desk (docs/support.md): who is asking, their tickets, and the few writes around a ticket.
// Reads go through the signed-in person's own client (RLS: own tickets, the company's for owners and
// managers, all for VIA Labs). Writes go through the service role after the checks here.
import { redirect } from 'next/navigation';
import { requireMe, type Membership } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { sendMail, brandedHtml } from '@/lib/mail';

export const SUPPORT_BUCKET = 'merch-support';
export const KINDS = ['question', 'error', 'request', 'suggestion'] as const;
export type TicketKind = (typeof KINDS)[number];
export const STATUSES = ['open', 'answered', 'with_via', 'logged', 'planned', 'building', 'shipped', 'declined', 'closed'] as const;
export type TicketStatus = (typeof STATUSES)[number];
export const DONE: TicketStatus[] = ['shipped', 'declined', 'closed'];
export const AGENT_NAME = 'VIA Support';
// A person's agent replies per hour across all their tickets: enough for a long conversation, not for a loop.
export const HOURLY_LIMIT = 40;

export type Attachment = { path: string; name: string; mime: string; bytes: number };
export type Ticket = { id: string; tenant_id: string; number: number; opened_by: string | null; opened_by_name: string | null; opened_by_email: string | null; opened_by_role: string | null; kind: TicketKind; title: string; status: TicketStatus; page: string | null; locale: string | null; created_at: string; last_message_at: string; closed_at: string | null };
export type Message = { id: string; ticket_id: string; author_kind: 'person' | 'agent' | 'via'; author_user: string | null; author_name: string | null; body: string; attachments: Attachment[]; created_at: string };
export const TICKET_COLS = 'id, tenant_id, number, opened_by, opened_by_name, opened_by_email, opened_by_role, kind, title, status, page, locale, created_at, last_message_at, closed_at';
export const MESSAGE_COLS = 'id, ticket_id, author_kind, author_user, author_name, body, attachments, created_at';

// The support desk on its own host when NEXT_PUBLIC_SUPPORT_URL is set (https://support.getvia.xyz), else
// the same pages under /support on the workspace host.
export const supportBase = () => (process.env.NEXT_PUBLIC_SUPPORT_URL || '').replace(/\/$/, '');
export const supportHref = (path = '') => `${supportBase()}/support${path}`;

// Any member of the company, partners included. VIA Labs staff use the console, not the desk.
export async function supportMe(slug: string) {
  const m = await requireMe();
  const membership = m.memberships.find((x) => x.tenants.slug === slug);
  if (!membership) redirect('/support');
  return { ...m, membership: membership as Membership, tenant: membership.tenants };
}

export async function ticketFor(id: string): Promise<{ ticket: Ticket; messages: Message[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const [{ data: ticket }, { data: messages }] = await Promise.all([
    sb.from('support_tickets').select(TICKET_COLS).eq('id', id).maybeSingle(),
    sb.from('support_messages').select(MESSAGE_COLS).eq('ticket_id', id).order('created_at'),
  ]);
  if (!ticket) return null;
  return { ticket: ticket as Ticket, messages: (messages || []) as Message[] };
}

export async function overLimit(userId: string) {
  const { count } = await supabaseAdmin().from('agent_runs').select('id', { count: 'exact', head: true }).eq('trigger', 'support').eq('user_id', userId).gt('created_at', new Date(Date.now() - 3600_000).toISOString());
  return (count || 0) >= HOURLY_LIMIT;
}

// Only image paths this person just uploaded under their own company and user folder are accepted.
export function cleanAttachments(raw: unknown, tenantId: string, userId: string): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const prefix = `${tenantId}/${userId}/`;
  return raw.slice(0, 3).flatMap((a) => {
    const x = a as Partial<Attachment>;
    if (typeof x.path !== 'string' || !x.path.startsWith(prefix) || x.path.includes('..')) return [];
    return [{ path: x.path, name: String(x.name || 'screenshot').slice(0, 120), mime: String(x.mime || 'image/png').slice(0, 40), bytes: Number(x.bytes) || 0 }];
  });
}

export async function ledger(tenantId: string, actor: string, actorUser: string | null, what: string, ref: Record<string, unknown>) {
  await supabaseAdmin().rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Support', p_actor: actor, p_actor_user: actorUser, p_counterparty: 'VIA Labs', p_stream: 'Setup', p_order: null, p_what: what, p_gate: actorUser ? 'PERSON · support' : 'AUTO · support', p_gated: false, p_ref: ref });
}

export async function notifyVia(subject: string, paragraphs: string[], path: string) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz'}${path}`;
  await sendMail({ to, subject, text: `${paragraphs.join('\n\n')}\n\n${url}`, html: brandedHtml({ title: subject, paragraphs, cta: { label: 'Open in the console', url } }) }).catch(() => {});
}

// Tell the person who opened the ticket that VIA Labs replied or the status moved.
export async function notifyPerson(ticket: Pick<Ticket, 'id' | 'number' | 'title' | 'opened_by_email'>, slug: string, line: string) {
  if (!ticket.opened_by_email) return;
  const url = `${supportBase() || process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz'}/support/${slug}/t/${ticket.id}`;
  const subject = `VIA Merch support #${ticket.number}: ${ticket.title}`;
  await sendMail({ to: ticket.opened_by_email, subject, text: `${line}\n\n${url}`, html: brandedHtml({ title: subject, paragraphs: [line], cta: { label: 'Open the conversation', url } }) }).catch(() => {});
}
