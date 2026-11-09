// The order agent's brief on the order page: what it believes about this PO, each line linked to its evidence.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { BriefRow } from '@/lib/agents/order-agent';

export async function OrderBrief({ slug, tenantId, orderId, tz }: { slug: string; tenantId: string; orderId: string; tz: string }) {
  const t = await getTranslations('orders.agent');
  const sb = await supabaseServer();
  const { data: me } = await sb.from('agents').select('parent:agents!agents_parent_agent_id_fkey(name)').eq('order_id', orderId).eq('layer', 'order').maybeSingle();
  const reportsTo = (me?.parent as unknown as { name: string } | null)?.name || null;
  const { data } = await sb.from('agent_memory').select('id, version, brief, sources, created_at, reason').eq('tenant_id', tenantId).eq('order_id', orderId).order('version', { ascending: false }).limit(6);
  const rows = (data || []) as BriefRow[];
  const cur = rows[0];
  const msgIds = (cur?.sources || []).filter((s) => s.startsWith('m:')).map((s) => s.slice(2));
  const { data: msgs } = msgIds.length ? await sb.from('messages').select('id, thread_id').in('id', msgIds) : { data: [] };
  const threadOf = new Map((msgs || []).map((m) => [m.id as string, m.thread_id as string | null]));
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const src = (s: string) => {
    const [kind, id] = [s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1)];
    const href = kind === 'm' ? (threadOf.get(id) ? `/app/${slug}/threads/${threadOf.get(id)}` : null) : kind === 'l' ? `/app/${slug}/ledger` : kind === 'd' ? `/app/${slug}/queue` : kind === 'ms' ? `#ms-${id}` : null;
    const label = ['m', 'l', 'd', 'ms'].includes(kind) ? t(`src.${kind}` as never) : kind;
    return href ? <Link className="pill" href={href} style={{ fontSize: 10.5 }}>{label}</Link> : <span className="pill" style={{ fontSize: 10.5 }}>{label}</span>;
  };
  const list = <T extends { source: string }>(title: string, xs: T[], line: (x: T) => React.ReactNode) => !!xs.length && (
    <div className="mt-3"><div className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{title}</div>
      <ul className="mt-1 grid gap-1">{xs.map((x, i) => <li key={i} className="flex gap-2 items-start"><span className="min-w-0 flex-1">{line(x)}</span>{src(x.source)}</li>)}</ul></div>
  );
  return (
    <div className="card small">
      <div className="flex items-center gap-2"><span className="pill agent">PO</span><h3>{t('title')}</h3>{cur && <span className="muted ml-auto" style={{ fontSize: 11 }}>{t('version', { n: cur.version, when: when(cur.created_at) })}</span>}</div>
      {!cur ? <p className="muted mt-2">{t('none')}</p> : <>
        <p className="mt-2 font-medium">{cur.brief.status_line}</p>
        <p className="mt-1" style={{ color: 'var(--fg2)' }}>{cur.brief.summary}</p>
        {cur.brief.next_action && <div className="notice mt-3" style={{ padding: '8px 10px' }}><b>{t('next')}:</b> {cur.brief.next_action.what}{cur.brief.next_action.due ? ` · ${cur.brief.next_action.due}` : ''}{cur.brief.next_action.owner ? ` · ${cur.brief.next_action.owner}` : ''}</div>}
        {list(t('asks'), cur.brief.open_asks, (x) => <><b>{x.owed_by}</b>: {x.what}{x.since ? <span className="muted"> · {x.since}</span> : null}</>)}
        {list(t('commitments'), cur.brief.commitments, (x) => <><b>{x.by}</b>: {x.what}{x.due ? <span className="muted"> · {x.due}</span> : null}</>)}
        {list(t('risks'), cur.brief.risks, (x) => <><span className={`pill ${x.severity === 'high' ? 'crit' : x.severity === 'medium' ? 'warn' : ''}`} style={{ fontSize: 10.5 }}>{t(`sev.${x.severity}` as never)}</span> {x.what}</>)}
        {list(t('contact'), cur.brief.last_contact, (x) => <>{x.direction === 'in' ? '← ' : '→ '}{x.party} <span className="muted">· {x.date}</span></>)}
        {rows.length > 1 && <details className="mt-3"><summary className="muted" style={{ cursor: 'pointer' }}>{t('history')}</summary>
          <ul className="mt-1 grid gap-1">{rows.slice(1).map((r) => <li key={r.id} className="muted">v{r.version} · {when(r.created_at)} · {r.brief.status_line}</li>)}</ul></details>}
      </>}
      {reportsTo && <p className="muted mt-3" style={{ fontSize: 11 }}>{t('reportsTo', { name: reportsTo })}</p>}
      <p className="muted mt-1" style={{ fontSize: 11 }}>{t('sub')}</p>
    </div>
  );
}
