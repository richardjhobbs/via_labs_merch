// My day: the approval queue and the numbers that matter for this person.
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';

export default async function MyDay({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('day');
  const sb = await supabaseServer();
  const [{ count: queued }, { count: orders }, { count: approvedToday }] = await Promise.all([
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'queued'),
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'open'),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('status', 'sent').gte('decided_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tenant.tz }));
  const period = h < 12 ? t('morning') : h < 18 ? t('afternoon') : t('evening');
  return (
    <div className="max-w-5xl">
      <h1>{t('greeting', { period, name: (membership.display_name || '').split(' ')[0] || '' })}</h1>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${queued ? 'warn' : 'ok'}`}><div className="n">{queued ?? 0}</div><div className="l">{t('waiting')}</div></div>
        <div className="kpi"><div className="n">0</div><div className="l">{t('exceptions')}</div></div>
        <div className="kpi"><div className="n">0/{orders ?? 0}</div><div className="l">{t('offplan')}</div></div>
        <div className="kpi ok"><div className="n">{approvedToday ?? 0}</div><div className="l">{t('approved')}</div></div>
      </div>
      <div className="card mt-4">{queued ? <p>{queued} drafts</p> : <p className="muted">{t('empty')}</p>}</div>
      {!orders && <div className="notice mt-4">{t('noOrders')}</div>}
    </div>
  );
}
