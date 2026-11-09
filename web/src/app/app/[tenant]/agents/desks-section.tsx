// Desks on the Agents page: each desk agent, the orders under it, what is waiting at it, and its ceilings,
// plus the messages passing between the layers. Owners and managers add and edit desks; only an owner sets ceilings.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { saveDesk, closeDesk } from './desk-actions';
import type { DeskRule } from '@/lib/agents/authority';

const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];
type Desk = { id: string; name: string; desk_rule: DeskRule | null; person_id: string | null; ceilings: Record<string, number> | null };

export async function DesksSection({ slug, tenantId, role, tz }: { slug: string; tenantId: string; role: string; tz: string }) {
  const t = await getTranslations('agents.desks');
  const sb = await supabaseServer();
  const [{ data: desksRaw }, { data: people }, { data: parties }, { data: orders }, { data: gates }, { data: orderAgents }, { data: openEsc }, { data: log }, { data: allAgents }] = await Promise.all([
    sb.from('agents').select('id, name, desk_rule, person_id, ceilings').eq('tenant_id', tenantId).eq('layer', 'desk').eq('status', 'active').order('created_at'),
    sb.from('memberships').select('id, display_name, role').eq('tenant_id', tenantId).neq('role', 'partner').order('display_name'),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenantId).is('archived_at', null).order('name'),
    sb.from('orders').select('id, po, category').eq('tenant_id', tenantId).eq('status', 'open').order('po'),
    sb.from('gates').select('stream, level, locked').eq('tenant_id', tenantId).eq('track', 'production').order('stream'),
    sb.from('agents').select('parent_agent_id').eq('tenant_id', tenantId).eq('layer', 'order').eq('status', 'active'),
    sb.from('agent_messages').select('to_agent_id').eq('tenant_id', tenantId).eq('kind', 'escalation').eq('status', 'open'),
    sb.from('agent_messages').select('id, kind, from_agent_id, to_agent_id, body, status, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(15),
    sb.from('agents').select('id, name').eq('tenant_id', tenantId),
  ]);
  const desks = (desksRaw || []) as Desk[];
  const canEdit = ['owner', 'manager'].includes(role), owner = role === 'owner';
  const customers = (parties || []).filter((p) => CUSTOMER.includes(p.kind)), suppliers = (parties || []).filter((p) => ['factory', 'mill'].includes(p.kind));
  const categories = [...new Set((orders || []).map((o) => o.category).filter(Boolean))] as string[];
  const nameOf = new Map((allAgents || []).map((a) => [a.id as string, a.name as string]));
  const personName = new Map((people || []).map((p) => [p.id as string, (p.display_name as string) || '?']));
  const count = (id: string) => (orderAgents || []).filter((a) => a.parent_agent_id === id).length;
  const waiting = (id: string) => (openEsc || []).filter((m) => m.to_agent_id === id).length;
  const ruleText = (r: DeskRule | null) => {
    if (!r) return '';
    const names = (ids: string[] | undefined) => (ids || []).map((i) => (parties || []).find((p) => p.id === i)?.name || (orders || []).find((o) => o.id === i)?.po || '?').join(', ');
    return r.by === 'category' ? `${t('by.category')}: ${(r.categories || []).join(', ')}` : r.by === 'list' ? `${t('by.list')}: ${names(r.order_ids)}` : `${t(`by.${r.by}` as never)}: ${names(r.ids)}`;
  };
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const form = (d: Desk | null) => (
    <form action={saveDesk} className="grid gap-3 mt-3">
      <input type="hidden" name="slug" value={slug} />{d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="f" style={{ margin: 0 }}><span>{t('name')}</span><input className="input" name="name" required maxLength={60} defaultValue={d?.name || ''} placeholder={t('namePh')} /></label>
        <label className="f" style={{ margin: 0 }}><span>{t('person')}</span><select className="input" name="person" defaultValue={d?.person_id || ''}><option value="">—</option>{(people || []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
      </div>
      <label className="f" style={{ margin: 0 }}><span>{t('groupBy')}</span><select className="input" name="by" defaultValue={d?.desk_rule?.by || 'customer'}>{(['customer', 'supplier', 'category', 'list'] as const).map((b) => <option key={b} value={b}>{t(`by.${b}`)}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="f" style={{ margin: 0 }}><span>{t('by.customer')}</span><select className="input" name="customers" multiple size={Math.min(5, Math.max(2, customers.length))} defaultValue={d?.desk_rule?.by === 'customer' ? d.desk_rule.ids : []}>{customers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="f" style={{ margin: 0 }}><span>{t('by.supplier')}</span><select className="input" name="suppliers" multiple size={Math.min(5, Math.max(2, suppliers.length))} defaultValue={d?.desk_rule?.by === 'supplier' ? d.desk_rule.ids : []}>{suppliers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="f" style={{ margin: 0 }}><span>{t('by.category')}</span><input className="input" name="categories" defaultValue={d?.desk_rule?.by === 'category' ? (d.desk_rule.categories || []).join(', ') : ''} placeholder={categories.slice(0, 3).join(', ') || t('categoryPh')} /></label>
        <label className="f" style={{ margin: 0 }}><span>{t('by.list')}</span><select className="input" name="orders" multiple size={Math.min(5, Math.max(2, (orders || []).length))} defaultValue={d?.desk_rule?.by === 'list' ? d.desk_rule.order_ids : []}>{(orders || []).map((o) => <option key={o.id} value={o.id}>PO {o.po}</option>)}</select></label>
      </div>
      <p className="muted small" style={{ marginTop: -4 }}>{t('groupHelp')}</p>
      <div>
        <div className="small font-medium">{t('ceilings')}</div>
        <p className="muted small mt-1">{owner ? t('ceilingsHelp') : t('ceilingsOwner')}</p>
        <div className="card tw mt-2" style={{ padding: 0 }}><table className="t"><thead><tr><th>{t('stream')}</th><th>{t('gate')}</th><th>{t('ceiling')}</th></tr></thead><tbody>
          {(gates || []).map((g) => { const capped = g.locked != null; const cur = d ? (d.ceilings?.[g.stream] ?? 1) : capped ? 1 : Math.min(g.level, 2); return (
            <tr key={g.stream}><td className="small">{g.stream}</td><td className="small muted">L{g.level}{capped ? ` · ${t('capped')}` : ''}</td>
              <td>{capped ? <span className="muted small">{t('aPerson')}</span> : owner ? <select className="input" name={`ceil:${g.stream}`} defaultValue={String(cur)} style={{ width: 'auto', padding: '3px 8px' }}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>L{n}</option>)}</select> : <span className="pill">L{cur}</span>}</td></tr>); })}
        </tbody></table></div>
      </div>
      <div><button className="btn primary sm">{d ? t('save') : t('add')}</button></div>
    </form>
  );

  return (
    <div id="desks" className="card">
      <div className="flex items-center gap-3"><span className="pill agent" style={{ fontSize: 14, padding: '4px 10px' }}>D</span><div><div className="font-medium" style={{ fontSize: 16 }}>{t('title')}</div><div className="muted small">{t('sub')}</div></div></div>
      {!desks.length && <p className="muted small mt-3">{t('none')}</p>}
      <div className="grid gap-3 mt-3">
        {desks.map((d) => (
          <div key={d.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
            <div className="flex items-center gap-2 flex-wrap"><b>{d.name}</b><span className="muted">· {d.person_id ? personName.get(d.person_id) : t('noPerson')}</span>
              <span className="pill">{t('orders', { n: count(d.id) })}</span>{waiting(d.id) > 0 && <span className="pill warn">{t('waiting', { n: waiting(d.id) })}</span>}</div>
            <div className="muted mt-1">{ruleText(d.desk_rule)}</div>
            <div className="muted mt-1">{t('ceilings')}: {Object.entries(d.ceilings || {}).filter(([, n]) => n >= 2).map(([s, n]) => `${s} L${n}`).join(' · ') || t('allL1')}</div>
            {canEdit && <details className="mt-2"><summary className="muted" style={{ cursor: 'pointer' }}>{t('edit')}</summary>{form(d)}
              <form action={closeDesk} className="mt-2"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={d.id} /><button className="btn sm red">{t('close')}</button></form></details>}
          </div>
        ))}
      </div>
      {canEdit && <details className="mt-4" open={!desks.length}><summary className="btn sm" style={{ listStyle: 'none', display: 'inline-flex' }}>{t('new')}</summary>{form(null)}</details>}

      <div className="mt-6 small font-medium">{t('log')}</div>
      <p className="muted small mt-1">{t('logSub')}</p>
      {!log?.length && <p className="muted small mt-2">{t('logNone')}</p>}
      <div className="mt-2 grid gap-2">
        {(log || []).map((m) => { const b = (m.body || {}) as { title?: string; status?: string; po?: string; decision?: string; by?: string; waiting_for?: string; why?: string; factory?: string; priority?: string[]; rationale?: string; text?: string; needs_person?: boolean }; return (
          <div key={m.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
            <div className="flex items-center gap-2 flex-wrap"><span className={`pill ${m.kind === 'escalation' ? (m.status === 'open' ? 'warn' : '') : m.kind === 'decision' ? 'ok' : 'agent'}`}>{t(`kind.${m.kind}` as never)}</span>
              <span>{m.from_agent_id ? nameOf.get(m.from_agent_id) : b.by || t('aPerson')} → {m.to_agent_id ? nameOf.get(m.to_agent_id) : '—'}</span><span className="muted ml-auto">{when(m.created_at)}</span></div>
            <div className="muted mt-1">{m.kind === 'report' ? `PO ${b.po}: ${b.status}` : b.factory ? `${t('capacity', { factory: b.factory })}: ${(b.priority || []).join(' > ')}. ${b.rationale || ''}${b.needs_person ? ` ${t('needsPerson')}` : ''}` : m.kind === 'instruction' ? b.text : m.kind === 'decision' ? `${b.decision === 'approved' || b.decision === 'rejected' ? t(`decision.${b.decision}`) : b.decision} · ${b.title}` : `${b.title}${b.waiting_for ? ` · ${t('waitingFor', { name: b.waiting_for })}` : ''}`}</div>
          </div>); })}
      </div>
      <div className="mt-3"><Link className="btn sm" href={`/app/${slug}/queue`}>{t('openQueue')}</Link></div>
    </div>
  );
}
