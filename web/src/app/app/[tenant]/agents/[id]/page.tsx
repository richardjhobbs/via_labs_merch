// One agent, opened: who it is (soul), what it currently believes (memory, linked to evidence), what it has
// run and what it has said to the layers above and below. Read only; overrides live on the agent tree.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { OrderBrief } from '@/components/order-brief';

type B = { headline?: string; sections?: { title: string; lines: string[] }[]; top_actions?: { what: string; who: string; po: string | null }[] };

export default async function AgentDetail({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: slug, id } = await params;
  const { tenant } = await requireTenant(slug);
  const [t, ta] = await Promise.all([getTranslations('agents.tree'), getTranslations('agents')]);
  const TRIG: Record<string, string> = { chat: ta('trigChat'), inbound: ta('trigInbound'), schedule: ta('trigSchedule'), partner: ta('trigPartner'), brief: ta('trigBrief'), manager: ta('trigManager') };
  const sb = await supabaseServer();
  const [{ data: a }, { data: runs }, { data: msgs }, { data: names }] = await Promise.all([
    sb.from('agents').select('id, name, layer, status, soul, ceilings, desk_rule, order_id, person_id, parent_agent_id, orders(po), person:memberships!agents_person_id_fkey(display_name), parent:agents!agents_parent_agent_id_fkey(name)').eq('tenant_id', tenant.id).eq('id', id).maybeSingle(),
    sb.from('agent_runs').select('id, trigger, model, cost_usd, ms, error, output, created_at').eq('tenant_id', tenant.id).eq('agent_id', id).order('created_at', { ascending: false }).limit(10),
    sb.from('agent_messages').select('id, kind, from_agent_id, to_agent_id, body, status, created_at').eq('tenant_id', tenant.id).or(`from_agent_id.eq.${id},to_agent_id.eq.${id}`).order('created_at', { ascending: false }).limit(20),
    sb.from('agents').select('id, name').eq('tenant_id', tenant.id),
  ]);
  if (!a) notFound();
  const { data: mem } = a.layer !== 'order' ? await sb.from('agent_memory').select('brief, created_at').eq('agent_id', id).order('version', { ascending: false }).limit(1).maybeSingle() : { data: null };
  const nameOf = new Map((names || []).map((n) => [n.id as string, n.name as string]));
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const po = (a.orders as unknown as { po: string } | null)?.po;
  const personName = (a.person as unknown as { display_name: string } | null)?.display_name;
  const parentName = (a.parent as unknown as { name: string } | null)?.name;
  const ceilings = Object.entries((a.ceilings || {}) as Record<string, number>).filter(([, n]) => n >= 2);
  const b = (mem?.brief || null) as B | null;
  return (
    <div className="max-w-5xl">
      <Link href={`/app/${slug}/agents/tree`} className="small">← {t('title')}</Link>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap"><h1>{a.name}</h1><span className="pill agent">{t(`layer.${a.layer}` as never)}</span>{a.status !== 'active' && <span className="pill warn">{t(a.status === 'paused' ? 'paused' : 'closed')}</span>}</div>
      <div className="split mt-4" style={{ '--side': '320px' } as React.CSSProperties}>
        <div className="grid gap-4">
          {a.layer === 'order' && a.order_id ? <OrderBrief slug={slug} tenantId={tenant.id} orderId={a.order_id} tz={tenant.tz} /> : (
            <div className="card small"><h3>{t('memory')}</h3>
              {!b ? <p className="muted mt-2">{t('noMemory')}</p> : <>
                <p className="mt-2 font-medium">{b.headline}</p><p className="muted" style={{ fontSize: 11 }}>{when(mem!.created_at)}</p>
                {!!b.top_actions?.length && <ol className="mt-2 grid gap-1" style={{ paddingLeft: 18, listStyle: 'decimal' }}>{b.top_actions.map((x, i) => <li key={i}>{x.po ? `PO ${x.po} · ` : ''}{x.what} <span className="muted">· {x.who}</span></li>)}</ol>}
                {(b.sections || []).map((s, i) => <div key={i} className="mt-2"><b>{s.title}</b><ul className="mt-1 grid gap-1" style={{ color: 'var(--fg2)' }}>{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}
              </>}
            </div>)}
          <div className="card small"><h3>{t('runs')}</h3>
            {!runs?.length && <p className="muted mt-2">{t('noRuns')}</p>}
            {(runs || []).map((r) => <div key={r.id} className="mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
              <div className="flex gap-2 flex-wrap"><span className="pill agent">{TRIG[r.trigger] || r.trigger}</span><span className="muted">{when(r.created_at)} · {r.model} · ${Number(r.cost_usd || 0).toFixed(4)} · {Math.round((r.ms || 0) / 100) / 10}s</span></div>
              {r.error ? <div className="mt-1" style={{ color: 'var(--crit)' }}>{r.error}</div> : r.output && <div className="mt-1 muted">{String(r.output).slice(0, 300)}</div>}
            </div>)}
          </div>
          <div className="card small"><h3>{t('messages')}</h3>
            {!msgs?.length && <p className="muted mt-2">{t('logNone')}</p>}
            {(msgs || []).map((m) => { const bd = (m.body || {}) as { title?: string; status?: string; po?: string; factory?: string; priority?: string[]; text?: string; decision?: string }; return (
              <div key={m.id} className="mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
                <div className="flex gap-2 flex-wrap"><span className="pill">{t(`kinds.${m.kind}` as never)}</span><span>{m.from_agent_id === id ? `→ ${m.to_agent_id ? nameOf.get(m.to_agent_id as string) || '?' : '—'}` : `← ${m.from_agent_id ? nameOf.get(m.from_agent_id as string) || '?' : t('aPerson')}`}</span><span className="muted ml-auto">{when(m.created_at as string)}</span></div>
                <div className="muted mt-1">{bd.status || bd.text || (bd.factory ? `${bd.factory}: ${(bd.priority || []).join(' > ')}` : bd.title) || ''}</div>
              </div>); })}
          </div>
        </div>
        <div className="grid gap-4 self-start">
          <div className="card small"><h3>{t('soul')}</h3>
            <dl className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'max-content minmax(0,1fr)', columnGap: 12 }}>
              <dt className="muted">{t('worksFor')}</dt><dd>{personName || t('noPerson')}</dd>
              <dt className="muted">{t('reportsTo')}</dt><dd>{parentName || '—'}</dd>
              {po && <><dt className="muted">PO</dt><dd><Link href={`/app/${slug}/orders/${encodeURIComponent(po)}`}>{po}</Link></dd></>}
              <dt className="muted">{t('ceilings')}</dt><dd>{ceilings.length ? ceilings.map(([s, n]) => `${s} L${n}`).join(' · ') : t('allL1')}</dd>
            </dl>
            <p className="mt-3" style={{ color: 'var(--fg2)', whiteSpace: 'pre-wrap' }}>{a.soul || t(`soulDefault.${a.layer}` as never)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
