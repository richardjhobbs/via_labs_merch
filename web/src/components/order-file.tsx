// The order file: every conversation on a PO, grouped by party and function, with the agent's
// summary of where the order stands across all of them.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { orderSummary } from '@/lib/threads';
import { refreshOrderSummary } from '@/app/app/[tenant]/threads/actions';
import { Chain } from './chain';
import { PendingDraftCard } from './pending-draft';

export async function OrderFile({ slug, tenantId, orderId, po, tz }: { slug: string; tenantId: string; orderId: string; po: string; tz: string }) {
  const t = await getTranslations('threads');
  const sb = await supabaseServer();
  const [{ data: threads }, { data: msgs }, { data: drafts }, sum] = await Promise.all([
    sb.from('threads').select('id, subject, kind, last_message_at, summary, party_id, parties(name, kind, lang)').eq('tenant_id', tenantId).eq('order_id', orderId).order('last_message_at', { ascending: false }),
    sb.from('messages').select('id, thread_id, direction, sender_name, lang, text, text_en, stream, received_at, sent_at, contacts(role)').eq('tenant_id', tenantId).eq('order_id', orderId).order('received_at'),
    sb.from('drafts').select('id, seq, title, body, body_en, lang, stream, gate_level, impact, priority, source_message_id, party_id').eq('tenant_id', tenantId).eq('order_id', orderId).in('status', ['queued', 'escalated']),
    orderSummary(tenantId, orderId),
  ]);
  const byThread = new Map<string, typeof msgs>();
  for (const m of msgs || []) { const k = m.thread_id || ''; byThread.set(k, [...(byThread.get(k) || []), m]); }
  const groups = new Map<string, { party: { name: string; kind: string; lang: string }; threads: NonNullable<typeof threads> }>();
  for (const th of threads || []) { const p = th.parties as unknown as { name: string; kind: string; lang: string } | null; const k = th.party_id || '?'; const g = groups.get(k) || { party: p || { name: '?', kind: '', lang: 'en' }, threads: [] }; g.threads.push(th); groups.set(k, g); }
  const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];
  const ordered = [...groups.values()].sort((a, b) => (CUSTOMER.includes(a.party.kind) ? 0 : 1) - (CUSTOMER.includes(b.party.kind) ? 0 : 1));
  const total = msgs?.length || 0;
  return (
    <div className="card mt-4">
      <div className="flex items-center gap-2 flex-wrap"><h2>{t('orderFile')}</h2><span className="muted small">{t('fileCount', { threads: threads?.length || 0, messages: total, parties: groups.size })}</span>
        <form action={refreshOrderSummary} className="ml-auto"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="order_id" value={orderId} /><input type="hidden" name="po" value={po} /><button className="btn sm">{t('refresh')}</button></form></div>
      {sum.summary ? (
        <div className="mt-3 p-3" style={{ background: 'var(--accent-soft)', borderRadius: 10 }}>
          <div className="small font-medium" style={{ color: 'var(--accent)' }}>{t('whereWeAre')} <span className="muted" style={{ fontWeight: 400 }}>· {sum.at ? new Date(sum.at).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
          <div className="mt-1 small" style={{ whiteSpace: 'pre-wrap' }}>{sum.summary}</div>
        </div>
      ) : total ? <div className="notice mt-3 small">{t('noSummaryYet')}</div> : <div className="muted small mt-3">{t('noConversations')}</div>}
      <div className="grid gap-4 mt-4">
        {ordered.map((g) => (
          <div key={g.party.name}>
            <div className="flex items-center gap-2 flex-wrap"><span className={`pill ${CUSTOMER.includes(g.party.kind) ? 'agent' : ''}`}>{CUSTOMER.includes(g.party.kind) ? t('customer') : t(`kind.${g.party.kind}`, { default: g.party.kind })}</span><b>{g.party.name}</b><span className="muted small">{g.party.lang}</span></div>
            <div className="grid gap-2 mt-2">
              {g.threads.map((th) => { const list = byThread.get(th.id) || []; const last = list[list.length - 1]; const open = (drafts || []).filter((d) => list.some((m) => m.id === d.source_message_id) || (d.party_id === th.party_id && !d.source_message_id)); return (
                <details key={th.id} className="p-3" style={{ border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
                  <summary className="flex items-center gap-2 flex-wrap" style={{ cursor: 'pointer', listStyle: 'none' }}>
                    <span className="font-medium small">{th.subject || t('conversation')}</span><span className="pill">{th.kind || '—'}</span><span className="muted small">{list.length} {t('messages')}</span>
                    {last && <span className="muted small" style={{ flexBasis: '100%' }}>{last.direction === 'in' ? '← ' : '→ '}{last.sender_name}{(last.contacts as unknown as { role: string } | null)?.role ? ` (${(last.contacts as unknown as { role: string }).role})` : ''} · {new Date(last.received_at).toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' })}: {(last.text_en || last.text).slice(0, 120)}{(last.text_en || last.text).length > 120 ? '…' : ''}</span>}
                    {!!open.length && <span className="pill warn">{t('draftWaiting', { n: open.length })}</span>}
                  </summary>
                  <div className="mt-3"><Chain messages={list.map((m) => ({ id: m.id, direction: m.direction as 'in' | 'out', sender_name: m.sender_name, role: (m.contacts as unknown as { role: string } | null)?.role || null, lang: m.lang, text: m.text, text_en: m.text_en, stream: m.stream, received_at: m.received_at, sent_at: m.sent_at }))} tz={tz} labels={{ original: t('original'), awaiting: t('awaitingChannel'), us: t('us') }} />
                    {open.map((d) => <div key={d.id} className="grid mt-3"><PendingDraftCard slug={slug} back={`/app/${slug}/orders/${encodeURIComponent(po)}`} d={d} labels={{ waiting: t('pendingReply'), approve: t('approve'), hold: t('hold'), reject: t('reject'), impact: t('impact'), english: t('english') }} /></div>)}
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap"><Link className="btn sm" href={`/app/${slug}/threads/${th.id}`}>{t('openThread')}</Link>{!!open.length && <Link className="btn sm" href={`/app/${slug}/queue`}>{t('openQueue')}</Link>}</div>
                </details>); })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
