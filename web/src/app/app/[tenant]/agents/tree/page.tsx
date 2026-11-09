// Director view: every agent in every layer on one page. Mira, each desk, each order agent with its health,
// what is waiting and for whom, cost over 7 days, and the messages between the layers. Owners and managers can
// pause or resume an agent, move an order to another desk and close a decision left for a person.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { listOrders } from '@/lib/orders';
import { HealthPill } from '@/components/milestones';
import { setAgentStatus, pinOrder, resolveDecision } from '../tree-actions';

type A = { id: string; name: string; layer: 'order' | 'desk' | 'manager'; status: string; parent_agent_id: string | null; order_id: string | null; person_id: string | null; pinned_parent_id: string | null };

export default async function AgentTree({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ kind?: string; po?: string; desk?: string; tsaved?: string; terr?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('agents.tree');
  const sb = await supabaseServer();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: agentsRaw }, orders, { data: mem }, { data: waiting }, { data: asks }, { data: people }, { data: runs }, { data: logRaw }] = await Promise.all([
    sb.from('agents').select('id, name, layer, status, parent_agent_id, order_id, person_id, pinned_parent_id').eq('tenant_id', tenant.id).eq('track', 'production').neq('status', 'closed').order('created_at'),
    listOrders(tenant.id, { status: 'open', customers: scopeOf(membership) }),
    sb.from('agent_memory').select('order_id, version, brief').eq('tenant_id', tenant.id).not('order_id', 'is', null).order('version', { ascending: false }).limit(2000),
    sb.from('drafts').select('id, seq, title, agent_id, waiting_layer, waiting_since, assignee_user_id').eq('tenant_id', tenant.id).eq('status', 'queued').not('waiting_layer', 'is', null).order('waiting_since'),
    sb.from('agent_messages').select('id, from_agent_id, body, created_at').eq('tenant_id', tenant.id).eq('kind', 'decision').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
    sb.from('memberships').select('id, user_id, display_name').eq('tenant_id', tenant.id),
    sb.from('agent_runs').select('agent_id, cost_usd').eq('tenant_id', tenant.id).gte('created_at', since).limit(5000),
    sb.from('agent_messages').select('id, kind, from_agent_id, to_agent_id, order_id, body, status, created_at').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(200),
  ]);
  const agents = (agentsRaw || []) as A[];
  const director = ['owner', 'manager'].includes(membership.role);
  const mira = agents.find((a) => a.layer === 'manager');
  const desks = agents.filter((a) => a.layer === 'desk');
  const visible = new Set(orders.map((o) => o.id));
  const orderAgents = agents.filter((a) => a.layer === 'order' && a.order_id && visible.has(a.order_id));
  const orderOf = new Map(orders.map((o) => [o.id, o]));
  const status = new Map<string, string>();
  for (const m of mem || []) if (!status.has(m.order_id as string)) status.set(m.order_id as string, (m.brief as { status_line?: string })?.status_line || '');
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));
  const person = new Map((people || []).map((p) => [p.id as string, (p.display_name as string) || '?']));
  const personByUser = new Map((people || []).map((p) => [p.user_id as string, (p.display_name as string) || '?']));
  // cost over 7 days per agent, and rolled up to each desk and Mira
  const cost = new Map<string, number>();
  for (const r of runs || []) if (r.agent_id) cost.set(r.agent_id as string, (cost.get(r.agent_id as string) || 0) + Number(r.cost_usd || 0));
  const under = (deskId: string | null) => orderAgents.filter((a) => (deskId ? a.parent_agent_id === deskId : !desks.some((d) => d.id === a.parent_agent_id)));
  const sum = (ids: string[]) => ids.reduce((s, id) => s + (cost.get(id) || 0), 0);
  const waitAt = (agentIds: string[]) => (waiting || []).filter((w) => agentIds.includes(w.agent_id as string)).length;
  const total = [...cost.values()].reduce((s, n) => s + n, 0);
  const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
  const age = (s: string | null) => { if (!s) return ''; const h = Math.round((Date.now() - Date.parse(s)) / 36e5); return h < 24 ? t('hours', { n: h }) : t('days', { n: Math.round(h / 24) }); };
  const layerName = (l: string) => t(`layer.${l}` as never);

  const pauseBtn = (a: A) => director && (
    <form action={setAgentStatus}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value={a.status === 'paused' ? 'active' : 'paused'} />
      <button className={`btn sm ${a.status === 'paused' ? 'primary' : ''}`}>{a.status === 'paused' ? t('resume') : t('pause')}</button></form>
  );
  const orderRows = (list: A[]) => (
    <div className="card tw mt-2" style={{ padding: 0 }}><table className="t stack"><thead><tr><th>PO</th><th>{t('health')}</th><th>{t('status')}</th><th>{t('waiting')}</th><th>{t('person')}</th><th className="text-right">{t('cost7')}</th>{director && <th>{t('override')}</th>}</tr></thead><tbody>
      {list.map((a) => { const o = orderOf.get(a.order_id!); return (
        <tr key={a.id}><td><Link className="mono" href={`/app/${slug}/agents/${a.id}`}>{o?.po}</Link>{a.status === 'paused' && <span className="pill warn ml-1">{t('paused')}</span>}{a.pinned_parent_id && <span className="pill ml-1">{t('pinned')}</span>}<div className="muted small">{o?.customer?.name} · {o?.factory?.short || o?.factory?.name}</div></td>
          <td data-l={t('health')}>{o && <HealthPill h={o.health} />}</td>
          <td className="small" data-l={t('status')} style={{ maxWidth: 360 }}>{status.get(a.order_id!) || <span className="muted">{t('noBrief')}</span>}</td>
          <td data-l={t('waiting')}>{waitAt([a.id]) ? <span className="pill warn">{waitAt([a.id])}</span> : <span className="muted">0</span>}</td>
          <td className="small" data-l={t('person')}>{a.person_id ? person.get(a.person_id) : <span className="muted">—</span>}</td>
          <td className="text-right small" data-l={t('cost7')}>{usd(cost.get(a.id) || 0)}</td>
          {director && <td className="small"><div className="flex gap-1 flex-wrap items-center">{pauseBtn(a)}
            {!!desks.length && <form action={pinOrder} className="flex gap-1 items-center"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={a.id} />
              <select name="desk" className="input" defaultValue={a.pinned_parent_id || ''} style={{ width: 'auto', padding: '3px 6px' }}><option value="">{t('byRules')}</option>{desks.filter((d) => d.status === 'active').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <button className="btn sm">{t('move')}</button></form>}</div></td>}
        </tr>); })}
      {!list.length && <tr><td colSpan={7} className="muted">{t('noOrders')}</td></tr>}
    </tbody></table></div>
  );

  // the log, filtered
  const poId = q.po ? orders.find((o) => o.po.toLowerCase() === q.po!.trim().toLowerCase())?.id : null;
  const deskIds = q.desk ? new Set([q.desk, ...under(q.desk).map((a) => a.id)]) : null;
  const log = (logRaw || []).filter((m) => (!q.kind || m.kind === q.kind) && (!q.po || m.order_id === poId) && (!deskIds || deskIds.has(m.from_agent_id as string) || deskIds.has(m.to_agent_id as string))).slice(0, 50);

  return (
    <div className="max-w-6xl">
      <Link href={`/app/${slug}/agents`} className="small">← {t('back')}</Link>
      <h1 className="mt-2">{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {q.tsaved && <div className="notice mt-4">{t('saved')}</div>}
      {q.terr && <div className="notice crit mt-4">{q.terr === 'role' ? t('errRole') : t('errFields')}</div>}

      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="kpi"><div className="n">{orderAgents.filter((a) => a.status === 'active').length + desks.filter((d) => d.status === 'active').length + (mira?.status === 'active' ? 1 : 0)}</div><div className="l">{t('kActive')}</div></div>
        <div className={`kpi ${agents.some((a) => a.status === 'paused') ? 'warn' : ''}`}><div className="n">{agents.filter((a) => a.status === 'paused').length}</div><div className="l">{t('kPaused')}</div></div>
        <div className={`kpi ${(waiting || []).length ? 'warn' : 'ok'}`}><div className="n">{(waiting || []).length + (asks || []).length}</div><div className="l">{t('kWaiting')}</div></div>
        <div className="kpi"><div className="n">{usd(total)}</div><div className="l">{t('kCost')}</div></div>
      </div>

      {(!!asks?.length || !!waiting?.length) && <div className="card mt-4" style={{ borderLeft: '3px solid var(--warn)' }}>
        <h2>{t('decisions')}</h2>
        {(asks || []).map((m) => { const b = m.body as { factory?: string; priority?: string[]; rationale?: string; person_question?: string }; return (
          <div key={m.id} className="small mt-3" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
            <div className="flex gap-2 flex-wrap items-center"><span className="pill warn">{nameOf.get(m.from_agent_id as string) || '?'}</span><b>{b.person_question}</b><span className="muted ml-auto">{age(m.created_at)}</span></div>
            <div className="muted mt-1">{b.factory}: {(b.priority || []).join(' > ')}. {b.rationale}</div>
            {director && <form action={resolveDecision} className="flex gap-2 mt-2 flex-wrap"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={m.id} /><input className="input" name="note" placeholder={t('notePh')} maxLength={500} style={{ flex: '1 1 240px' }} /><button className="btn sm primary">{t('resolve')}</button></form>}
          </div>); })}
        {(waiting || []).slice(0, 15).map((w) => (
          <div key={w.id} className="small mt-2 flex gap-2 flex-wrap items-center" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
            <span className="mono muted">Q-{w.seq}</span><span>{w.title}</span><span className="pill">{layerName(w.waiting_layer as string)}</span>
            <span className="muted">{w.assignee_user_id ? t('forName', { name: personByUser.get(w.assignee_user_id as string) || '?' }) : t('forManagers')} · {age(w.waiting_since as string)}</span>
          </div>))}
        <div className="mt-3"><Link className="btn sm" href={`/app/${slug}/queue`}>{t('openQueue')}</Link></div>
      </div>}

      {mira && <div className="card mt-4">
        <div className="flex items-center gap-3 flex-wrap"><span className="pill agent" style={{ fontSize: 14, padding: '4px 10px' }}>{mira.name.slice(0, 1)}</span>
          <div><Link href={`/app/${slug}/agents/${mira.id}`} className="font-medium" style={{ fontSize: 16 }}>{mira.name}</Link><div className="muted small">{layerName('manager')}{mira.status === 'paused' ? ` · ${t('paused')}` : ''} · {t('costLine', { cost: usd(cost.get(mira.id) || 0) })}</div></div>
          <div className="ml-auto">{pauseBtn(mira)}</div></div>
        <div className="grid gap-4 mt-4">
          {desks.map((d) => { const kids = under(d.id); return (
            <details key={d.id} open={desks.length <= 3} style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
              <summary className="flex items-center gap-2 flex-wrap" style={{ cursor: 'pointer' }}><b><Link href={`/app/${slug}/agents/${d.id}`}>{d.name}</Link></b>
                <span className="muted small">· {d.person_id ? person.get(d.person_id) : t('noPerson')}</span>{d.status === 'paused' && <span className="pill warn">{t('paused')}</span>}
                <span className="pill">{t('orders', { n: kids.length })}</span>{waitAt([d.id, ...kids.map((k) => k.id)]) > 0 && <span className="pill warn">{t('waitingN', { n: waitAt([d.id, ...kids.map((k) => k.id)]) })}</span>}
                <span className="muted small ml-auto">{t('costLine', { cost: usd(sum([d.id, ...kids.map((k) => k.id)])) })}</span></summary>
              <div className="mt-2">{pauseBtn(d)}</div>
              {orderRows(kids)}
            </details>); })}
          {(() => { const kids = under(null); return !!kids.length && (
            <details open={!desks.length} style={{ borderTop: desks.length ? '1px solid var(--line2)' : 0, paddingTop: desks.length ? 10 : 0 }}>
              <summary className="flex items-center gap-2 flex-wrap" style={{ cursor: 'pointer' }}><b>{t('noDesk')}</b><span className="pill">{t('orders', { n: kids.length })}</span><span className="muted small ml-auto">{t('costLine', { cost: usd(sum(kids.map((k) => k.id))) })}</span></summary>
              {orderRows(kids)}
            </details>); })()}
        </div>
      </div>}

      <div className="card mt-4">
        <h2>{t('log')}</h2>
        <form className="flex gap-2 flex-wrap mt-2 items-end" method="get">
          <label className="f" style={{ margin: 0 }}><span>{t('kind')}</span><select className="input" name="kind" defaultValue={q.kind || ''} style={{ width: 'auto' }}><option value="">{t('all')}</option>{['report', 'escalation', 'instruction', 'decision'].map((k) => <option key={k} value={k}>{t(`kinds.${k}` as never)}</option>)}</select></label>
          <label className="f" style={{ margin: 0 }}><span>PO</span><input className="input" name="po" defaultValue={q.po || ''} style={{ width: 120 }} /></label>
          {!!desks.length && <label className="f" style={{ margin: 0 }}><span>{t('desk')}</span><select className="input" name="desk" defaultValue={q.desk || ''} style={{ width: 'auto' }}><option value="">{t('all')}</option>{desks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
          <button className="btn sm">{t('filter')}</button>
        </form>
        {!log.length && <p className="muted small mt-3">{t('logNone')}</p>}
        <div className="mt-2 grid gap-2">
          {log.map((m) => { const b = (m.body || {}) as { title?: string; status?: string; po?: string; decision?: string; by?: string; factory?: string; priority?: string[]; rationale?: string; text?: string; waiting_for?: string }; return (
            <div key={m.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
              <div className="flex items-center gap-2 flex-wrap"><span className={`pill ${m.kind === 'escalation' && m.status === 'open' ? 'warn' : m.kind === 'decision' ? 'ok' : 'agent'}`}>{t(`kinds.${m.kind}` as never)}</span>
                <span>{m.from_agent_id ? nameOf.get(m.from_agent_id as string) || '?' : b.by || t('aPerson')} → {m.to_agent_id ? nameOf.get(m.to_agent_id as string) || '?' : '—'}</span><span className="muted ml-auto">{new Date(m.created_at as string).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="muted mt-1">{m.kind === 'report' ? `PO ${b.po}: ${b.status}` : b.factory ? `${b.factory}: ${(b.priority || []).join(' > ')}. ${b.rationale || ''}` : m.kind === 'instruction' ? b.text : m.kind === 'decision' ? `${b.decision === 'approved' || b.decision === 'rejected' ? t(`decision.${b.decision}`) : b.decision} · ${b.title}${b.by ? ` · ${b.by}` : ''}` : `${b.title}${b.waiting_for ? ` · ${b.waiting_for}` : ''}`}</div>
            </div>); })}
        </div>
      </div>
    </div>
  );
}
