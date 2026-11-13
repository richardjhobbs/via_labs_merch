// One support conversation: the thread, its status, and the reply box.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { supportMe, ticketFor } from '@/lib/helpdesk/desk';
import { supabaseAdmin } from '@/lib/supabase/server';
import { Composer } from '../../../composer';
import { StatusPill } from '../../../status-pill';
import { Thread } from '../../../thread';
import { CloseButton } from '../../../close-button';

export const maxDuration = 60;

export default async function TicketPage({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ e?: string }> }) {
  const [{ tenant: slug, id }, { e }] = await Promise.all([params, searchParams]);
  const me = await supportMe(slug);
  const found = await ticketFor(id);
  if (!found || found.ticket.tenant_id !== me.tenant.id) notFound();
  const { ticket, messages } = found;
  // opening your own ticket clears it from your bell
  if (ticket.opened_by === me.user.id) await supabaseAdmin().from('support_tickets').update({ person_seen_at: new Date().toISOString() }).eq('id', ticket.id);
  const [t, locale] = await Promise.all([getTranslations('help'), getLocale()]);
  const closed = ticket.status === 'closed';
  const note = ['with_via', 'logged', 'planned', 'building', 'shipped', 'declined'].includes(ticket.status) ? t(`note.${ticket.status}`) : '';
  return (
    <div>
      <Link href={`/support/${slug}`} className="small">← {t('back')}</Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        <span className="mono muted">#{ticket.number}</span>
        <h1 style={{ fontSize: 20 }}>{ticket.title}</h1>
        <StatusPill status={ticket.status} label={t(`status.${ticket.status}`)} />
      </div>
      <div className="muted small mt-1">{t(`kind.${ticket.kind}`)} · {t('by', { name: ticket.opened_by_name || '?' })} · {new Date(ticket.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      {note && <div className="notice mt-3">{note}</div>}
      {e && ['limit', 'agent'].includes(e) && <div className="notice warn mt-3">{t(`err.${e}`)}</div>}
      <Thread messages={messages.map((m) => ({ id: m.id, kind: m.author_kind, name: m.author_kind === 'agent' ? t('agent') : m.author_kind === 'via' ? `${t('staff')}${m.author_name ? ` · ${m.author_name}` : ''}` : m.author_user === me.user.id ? t('you') : m.author_name || '?', body: m.body, files: (m.attachments || []).length, when: new Date(m.created_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: me.tenant.tz || 'UTC' }) }))} />
      {closed
        ? <div className="notice mt-4">{t('closedNote')}</div>
        : <div className="card mt-4"><Composer slug={slug} ticketId={ticket.id} /><div className="mt-3 flex"><CloseButton slug={slug} id={ticket.id} label={t('close')} /></div></div>}
      {!closed && <p className="muted small mt-2">{t('warn')}</p>}
    </div>
  );
}
