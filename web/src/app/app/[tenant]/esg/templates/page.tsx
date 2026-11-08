// The template library: common lender, customer, audit, certification, chemical, market and licence
// requirements as starting programmes. Template content is English reference data; once added it is the
// company's own record to rename and edit.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canLead, esgEnabled } from '@/lib/esg';
import { TEMPLATES as BASE, TEMPLATE_GROUPS, localizeTemplate } from '@/lib/esg-templates';
import { addFromTemplate } from '../actions';

const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];

export default async function Templates({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ error?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, locale] = await Promise.all([getTranslations('esg'), getLocale()]);
  const TEMPLATES = BASE.map((x) => localizeTemplate(x, locale));
  const sb = await supabaseServer();
  const [{ data: tn }, { data: parties }, { data: used }] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).is('archived_at', null).order('name'),
    sb.from('esg_programmes').select('template').eq('tenant_id', tenant.id).not('template', 'is', null),
  ]);
  if (!esgEnabled(tn?.settings) || !canLead(membership.role)) redirect(`/app/${slug}/esg`);
  const inUse = new Set((used || []).map((u) => u.template));
  const customers = (parties || []).filter((p) => CUSTOMER.includes(p.kind));
  const issuers = (parties || []).filter((p) => [...CUSTOMER, 'bank', 'funder', 'auditor', 'other'].includes(p.kind));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-6xl">
      <div className="small"><Link href={`/app/${slug}/esg`}>{t('title')}</Link></div>
      <h1 className="mt-1">{t('tplTitle')}</h1>
      <p className="muted small mt-1" style={{ maxWidth: '78ch' }}>{tenant.kind === 'factory' ? t('tplSubFactory') : t('tplSubOffice')}</p>
      {q.error && <div className="notice crit mt-3">{q.error}</div>}
      {TEMPLATE_GROUPS.map((g) => (
        <section key={g} className="mt-6">
          <h2 className="mb-2">{t(`tplGroup.${g}`)}</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {TEMPLATES.filter((x) => x.group === g).map((x) => (
              <details key={x.id} className="card">
                <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <div className="flex items-baseline gap-2 flex-wrap"><b>{x.name}</b>{inUse.has(x.id) && <span className="pill ok">{t('tplInUse')}</span>}<span className="muted small ml-auto">{t('nReq', { n: x.reqs.length })}</span></div>
                  <div className="muted small mt-1">{x.framework}</div>
                  <p className="small mt-2" style={{ color: 'var(--fg2)' }}>{x.summary}</p>
                </summary>
                {x.status && <div className="notice small mt-2"><b>{t('tplStatus')}</b> {x.status}</div>}
                <ul className="small mt-2 grid gap-1">{x.reqs.map((r) => <li key={r.title} className="flex gap-2 flex-wrap"><span className="pill">{r.trigger === 'per_order' ? t('trig.per_order') : r.trigger === 'expiry' ? t('trig.expiry') : t(`freq.${r.frequency || 'once'}`)}</span>{(r.suppliers || (r.site && tenant.kind !== 'factory')) && <span className="pill agent">{t('eachSupplier')}</span>}<span>{r.title}</span></li>)}</ul>
                <form action={addFromTemplate} className="mt-3 pt-3 grid gap-2" style={{ borderTop: '1px solid var(--line2)' }}>
                  <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="template" value={x.id} /><input type="hidden" name="locale" value={locale} />
                  <label className="f" style={{ margin: 0 }}><span>{t('name')}</span><input className="input sm" name="name" defaultValue={x.name} maxLength={160} /></label>
                  <label className="f" style={{ margin: 0 }}><span>{t('issuer')}</span><select className="input sm" name="issuer_party_id" defaultValue=""><option value="">{t('notOnFile')}</option>{issuers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  {x.perOrder && !!customers.length && <label className="f" style={{ margin: 0 }}><span>{t('tplCustomers')}</span><select className="input sm" name="customers" multiple size={Math.min(4, customers.length)}>{customers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                  <label className="f" style={{ margin: 0 }}><span>{t('starts')}</span><input className="input sm" type="date" name="starts_on" defaultValue={today} /></label>
                  <button className="btn primary sm">{t('tplAdd')}</button>
                </form>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="muted small mt-6">{t('tplNote')}</p>
    </div>
  );
}
