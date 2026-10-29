// My day: the approval queue and the numbers that matter for this person.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { listOrders, exceptionsOf } from '@/lib/orders';
import { HealthPill } from '@/components/milestones';

export default async function MyDay({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('day');
  const sb = await supabaseServer();
  const [{ count: queued }, { count: approvedToday }, orders] = await Promise.all([
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'queued'),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'sent').gte('decided_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    listOrders(tenant.id, { status: 'open' }),
  ]);
  const ex = exceptionsOf(orders), off = orders.filter((o) => o.health.state !== 'green');
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tenant.tz }));
  const period = h < 12 ? t('morning') : h < 18 ? t('afternoon') : t('evening');
  return (
    <div className="max-w-5xl">
      <h1>{t('greeting', { period, name: (membership.display_name || '').split(' ')[0] || '' })}</h1>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${queued ? 'warn' : 'ok'}`}><div className="n">{queued ?? 0}</div><div className="l">{t('waiting')}</div></div>
        <div className={`kpi ${ex.length ? 'crit' : 'ok'}`}><div className="n">{ex.length}</div><div className="l">{t('exceptions')}</div></div>
        <div className={`kpi ${off.length ? 'warn' : ''}`}><div className="n">{off.length}/{orders.length}</div><div className="l">{t('offplan')}</div></div>
        <div className="kpi ok"><div className="n">{approvedToday ?? 0}</div><div className="l">{t('approved')}</div></div>
      </div>
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card"><h2>{t('queue')}</h2>{queued ? <p className="mt-2">{queued} drafts</p> : <p className="muted mt-2">{t('empty')}</p>}</div>
        <div className="card"><h2>{t('exceptionsTitle')}</h2>
          {ex.slice(0, 6).map((e) => <div key={e.id} className="small" style={{ padding: '8px 0', borderTop: '1px solid var(--line2)' }}><span className={`pill ${e.sev}`}>{e.sev === 'crit' ? 'Critical' : 'Warning'}</span> <Link href={`/app/${slug}/orders/${encodeURIComponent(e.po)}`}>{e.title}</Link><div className="muted">{e.chain.at(-2)?.t} · {e.chain.at(-1)?.t}</div></div>)}
          {!ex.length && <p className="muted small mt-2">{t('noExceptions')}</p>}
        </div>
      </div>
      {!!off.length && <div className="card mt-4 tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('offplanTitle')}</h2></div><table className="t"><thead><tr><th>PO</th><th>{t('style')}</th><th>{t('customer')}</th><th>{t('factory')}</th><th>{t('health')}</th></tr></thead><tbody>
        {off.slice(0, 10).map((o) => <tr key={o.id}><td><Link className="mono" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>{o.po}</Link></td><td>{o.style} <span className="muted small">{o.description}</span></td><td>{o.customer?.name}</td><td>{o.factory?.short || o.factory?.name}</td><td><HealthPill h={o.health} /></td></tr>)}
      </tbody></table></div>}
      {!orders.length && <div className="notice mt-4">{t('noOrders')} <Link href={`/app/${slug}/orders/import`}>{t('importLink')}</Link></div>}
    </div>
  );
}
