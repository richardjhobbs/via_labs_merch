// My day: the approval queue and the numbers that matter for this person.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { Team } from './team';
import { approveDraft, rejectDraft } from './queue/actions';
import { lastPass } from '@/lib/agents/proactive';
import { supabaseServer } from '@/lib/supabase/server';
import { listOrders, exceptionsOf } from '@/lib/orders';
import { HealthPill } from '@/components/milestones';

export default async function MyDay({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('day');
  const sb = await supabaseServer();
  const scope = scopeOf(membership), manager = ['owner', 'manager'].includes(membership.role);
  const [{ data: queuedRows }, { count: approvedToday }, orders, { data: scopeNames }] = await Promise.all([
    sb.from('drafts').select('id, seq, priority, stream, title, impact, body, lang, gate_level, created_at, party_id, orders(po, customer_id), parties(name)').eq('tenant_id', tenant.id).in('status', ['queued', 'escalated']).order('priority').order('seq'),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'sent').gte('decided_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    listOrders(tenant.id, { status: 'open', customers: scope }),
    scope ? sb.from('parties').select('name').in('id', scope) : Promise.resolve({ data: null }),
  ]);
  const prepared = (queuedRows || []).filter((d) => !scope || (d.party_id && scope.includes(d.party_id)) || scope.includes((d.orders as unknown as { customer_id: string } | null)?.customer_id || ''));
  const queued = prepared.length;
  const lp = await lastPass(tenant.id);
  const { data: agent } = await sb.from('agents').select('name').eq('tenant_id', tenant.id).eq('scope_kind', 'tenant').limit(1).maybeSingle();
  const agentName = agent?.name || 'Mira';
  const ex = exceptionsOf(orders), off = orders.filter((o) => o.health.state !== 'green');
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tenant.tz }));
  const period = h < 12 ? t('morning') : h < 18 ? t('afternoon') : t('evening');
  return (
    <div className="max-w-5xl">
      <h1>{t('greeting', { period, name: (membership.display_name || '').split(' ')[0] || '' })}</h1>
      <p className="muted small mt-1">{scope ? t('yourCustomers', { names: (scopeNames || []).map((p) => p.name).join(', ') }) : t('allCustomersNote')}</p>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${queued ? 'warn' : 'ok'}`}><div className="n">{queued ?? 0}</div><div className="l">{t('waiting')}</div></div>
        <div className={`kpi ${ex.length ? 'crit' : 'ok'}`}><div className="n">{ex.length}</div><div className="l">{t('exceptions')}</div></div>
        <div className={`kpi ${off.length ? 'warn' : ''}`}><div className="n">{off.length}/{orders.length}</div><div className="l">{t('offplan')}</div></div>
        <div className="kpi ok"><div className="n">{approvedToday ?? 0}</div><div className="l">{t('approved')}</div></div>
      </div>
      {q.saved && <div className="notice ok mt-4">{t('decided')}</div>}
      {q.error && <div className="notice crit mt-4">{q.error}</div>}
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="flex items-center gap-2 flex-wrap"><span className="pill agent">{agentName.slice(0, 1)}</span><h2>{t('prepared', { name: agentName, n: queued })}</h2><span className="muted small ml-auto">{lp ? t('preparedAt', { time: new Date(lp).toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' }) }) : ''}</span></div>
          {!queued && <p className="muted mt-2 small">{t('empty')}</p>}
          <div className="grid gap-3 mt-3">
            {prepared.slice(0, 6).map((d) => { const po = (d.orders as unknown as { po: string } | null)?.po, party = (d.parties as unknown as { name: string } | null)?.name; return (
              <div key={d.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
                <div className="flex items-center gap-2 flex-wrap"><span className="mono muted">Q-{d.seq}</span><span className={`pill ${d.priority === 1 ? 'crit' : ''}`}>{d.stream}</span><span className="pill agent">L{d.gate_level}</span>{po && <Link className="pill" href={`/app/${slug}/orders/${encodeURIComponent(po)}`}>PO {po}</Link>}</div>
                <div className="mt-1 font-medium">{d.title}</div>
                {party && <div className="muted">→ {party}{d.lang && d.lang !== 'en' ? ` · ${d.lang}` : ''}</div>}
                {d.impact && <div className="muted mt-1">{d.impact}</div>}
                <details className="mt-1"><summary className="muted" style={{ cursor: 'pointer' }}>{t('showMessage')}</summary><pre className="mt-1 p-2" style={{ whiteSpace: 'pre-wrap', background: 'var(--paper)', borderRadius: 8, fontFamily: 'inherit' }}>{d.body}</pre></details>
                <form action={approveDraft} className="flex gap-2 mt-2 flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={`/app/${slug}`} />
                  <button className="btn primary sm">{t('approve')}</button><Link className="btn sm" href={`/app/${slug}/queue`}>{t('hold')}</Link><button className="btn sm" formAction={rejectDraft}>{t('reject')}</button></form>
              </div>); })}
            {queued > 6 && <Link className="small" href={`/app/${slug}/queue`}>{t('more', { n: queued - 6 })}</Link>}
          </div>
        </div>
        <div className="card"><h2>{t('exceptionsTitle')}</h2>
          {ex.slice(0, 6).map((e) => <div key={e.id} className="small" style={{ padding: '8px 0', borderTop: '1px solid var(--line2)' }}><span className={`pill ${e.sev}`}>{e.sev === 'crit' ? 'Critical' : 'Warning'}</span> <Link href={`/app/${slug}/orders/${encodeURIComponent(e.po)}`}>{e.title}</Link><div className="muted">{e.chain.at(-2)?.t} · {e.chain.at(-1)?.t}</div></div>)}
          {!ex.length && <p className="muted small mt-2">{t('noExceptions')}</p>}
        </div>
      </div>
      {!!off.length && <div className="card mt-4 tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('offplanTitle')}</h2></div><table className="t"><thead><tr><th>PO</th><th>{t('style')}</th><th>{t('customer')}</th><th>{t('factory')}</th><th>{t('health')}</th></tr></thead><tbody>
        {off.slice(0, 10).map((o) => <tr key={o.id}><td><Link className="mono" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>{o.po}</Link></td><td>{o.style} <span className="muted small">{o.description}</span></td><td>{o.customer?.name}</td><td>{o.factory?.short || o.factory?.name}</td><td><HealthPill h={o.health} /></td></tr>)}
      </tbody></table></div>}
      {manager && <Team tenantId={tenant.id} />}
      {!orders.length && <div className="notice mt-4">{t('noOrders')} <Link href={`/app/${slug}/orders/import`}>{t('importLink')}</Link></div>}
    </div>
  );
}
