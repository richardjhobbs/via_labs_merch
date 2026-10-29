// Conversations: every thread with customers and suppliers, newest first, scoped to the person.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { RowLink } from '@/components/row-link';

export default async function Threads({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ side?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const scope = scopeOf(membership);
  const t = await getTranslations('threads');
  const sb = await supabaseServer();
  const [{ data: threads }, { data: lastMsgs }, { data: drafts }] = await Promise.all([
    sb.from('threads').select('id, subject, kind, last_message_at, summary, party_id, order_id, parties(name, kind), orders(po, customer_id)').eq('tenant_id', tenant.id).order('last_message_at', { ascending: false }).limit(200),
    sb.from('messages').select('thread_id, direction, sender_name, text, text_en, received_at').eq('tenant_id', tenant.id).order('received_at', { ascending: false }).limit(600),
    sb.from('drafts').select('seq, title, source_message_id, party_id, order_id').eq('tenant_id', tenant.id).in('status', ['queued', 'escalated']),
  ]);
  const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];
  const lastOf = new Map<string, NonNullable<typeof lastMsgs>[number]>(); const countOf = new Map<string, number>();
  for (const m of lastMsgs || []) { if (!m.thread_id) continue; if (!lastOf.has(m.thread_id)) lastOf.set(m.thread_id, m); countOf.set(m.thread_id, (countOf.get(m.thread_id) || 0) + 1); }
  let rows = (threads || []).filter((th) => { const o = th.orders as unknown as { customer_id: string } | null; return !scope || (th.party_id && scope.includes(th.party_id)) || (o?.customer_id && scope.includes(o.customer_id)); });
  const side = q.side === 'customers' ? 'customers' : q.side === 'suppliers' ? 'suppliers' : 'all';
  if (side !== 'all') rows = rows.filter((th) => { const k = (th.parties as unknown as { kind: string } | null)?.kind || ''; return side === 'customers' ? CUSTOMER.includes(k) : !CUSTOMER.includes(k); });
  const waiting = (th: (typeof rows)[number]) => (drafts || []).find((d) => d.order_id === th.order_id && d.party_id === th.party_id);
  return (
    <div className="max-w-6xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      <div className="flex gap-2 mt-4">{(['all', 'customers', 'suppliers'] as const).map((s) => <Link key={s} className={`btn sm ${side === s ? 'primary' : ''}`} href={`/app/${slug}/threads${s === 'all' ? '' : `?side=${s}`}`}>{t(`side.${s}`)}</Link>)}</div>
      <div className="card tw mt-4" style={{ padding: 0 }}>
        <table className="t"><thead><tr><th>{t('party')}</th><th>{t('po')}</th><th>{t('subject')}</th><th>{t('last')}</th><th></th></tr></thead><tbody>
          {rows.map((th) => { const p = th.parties as unknown as { name: string; kind: string } | null, o = th.orders as unknown as { po: string } | null, last = lastOf.get(th.id); return (
            <RowLink key={th.id} href={`/app/${slug}/threads/${th.id}`}>
              <td><Link href={`/app/${slug}/threads/${th.id}`} className="font-medium">{p?.name || '—'}</Link><div className="muted small">{CUSTOMER.includes(p?.kind || '') ? t('customer') : t(`kind.${p?.kind || 'other'}`, { default: p?.kind || '' })} · {th.kind}</div></td>
              <td>{o?.po && <Link className="mono small" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>{o.po}</Link>}</td>
              <td className="small">{th.subject || t('conversation')}<div className="muted">{countOf.get(th.id) || 0} {t('messages')}</div></td>
              <td className="small" style={{ maxWidth: 420 }}>{last && <><span className="muted">{last.direction === 'in' ? '← ' : '→ '}{last.sender_name} · {new Date(last.received_at).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' })}</span><div>{(last.text_en || last.text).slice(0, 110)}{(last.text_en || last.text).length > 110 ? '…' : ''}</div></>}</td>
              <td className="small">{(() => { const w = waiting(th); return w ? <><span className="pill warn">{t('replyWaiting')}</span><div className="muted mt-1"><span className="mono">Q-{w.seq}</span> {w.title}</div></> : last?.direction === 'out' ? <span className="pill ok">{t('ours')}</span> : last?.direction === 'in' ? <span className="pill">{t('theirs')}</span> : null; })()}</td>
            </RowLink>); })}
          {!rows.length && <tr><td colSpan={5} className="muted">{t('none')}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
