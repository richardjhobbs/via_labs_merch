import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { listOrders } from '@/lib/orders';
import { LABELS, MILESTONES, isoOf } from '@/lib/core/path';
import { MsCell, HealthPill } from '@/components/milestones';

export default async function Orders({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ customer?: string; factory?: string; off?: string }> }) {
  const { tenant: slug } = await params; const f = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('orders');
  let all = await listOrders(tenant.id, { customers: scopeOf(membership) });
  const customers = [...new Map(all.map((o) => [o.customer?.id, o.customer])).values()].filter(Boolean) as { id: string; name: string }[];
  const factories = [...new Map(all.map((o) => [o.factory?.id, o.factory])).values()].filter(Boolean) as { id: string; name: string }[];
  if (f.customer) all = all.filter((o) => o.customer?.id === f.customer);
  if (f.factory) all = all.filter((o) => o.factory?.id === f.factory);
  if (f.off) all = all.filter((o) => o.health.state !== 'green');
  const open = all.filter((o) => o.status === 'open');
  const units = open.reduce((a, o) => a + (o.qty || 0), 0), fob = open.reduce((a, o) => a + (o.qty || 0) * (o.fob || 0), 0);
  const base = `/app/${slug}/orders`;
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); const s = p.toString(); return base + (s ? '?' + s : ''); };
  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1>{t('title')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p></div>
        <div className="flex gap-2 flex-wrap"><Link className="btn sm" href={`${base}/import`}>{t('import')}</Link><a className="btn sm" href={`/api/export/orders?tenant=${slug}&fmt=xlsx`}>.xlsx</a><a className="btn sm" href={`/api/export/orders?tenant=${slug}&fmt=csv`}>CSV</a><a className="btn sm" href={`/api/export/orders?tenant=${slug}&fmt=json`}>JSON</a></div>
      </div>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="kpi"><div className="n">{open.length}</div><div className="l">{t('live')}</div></div>
        <div className="kpi"><div className="n">{units.toLocaleString('en-GB')}</div><div className="l">{t('units')}</div></div>
        <div className="kpi"><div className="n">USD {Math.round(fob).toLocaleString('en-GB')}</div><div className="l">{t('fobValue')}</div></div>
        <div className={`kpi ${open.some((o) => o.health.late) ? 'crit' : 'ok'}`}><div className="n">{open.filter((o) => o.health.late).length}</div><div className="l">{t('lateMilestone')}</div></div>
        <div className={`kpi ${open.some((o) => o.health.etdSlip > 0) ? 'warn' : 'ok'}`}><div className="n">{open.filter((o) => o.health.etdSlip > 0).length}</div><div className="l">{t('etdRisk')}</div></div>
      </div>
      <div className="chips flex gap-3 flex-wrap items-center mt-4 small">
        <span className="muted">{t('filter')}</span>
        <Link className={`pill ${!f.customer ? 'agent' : ''}`} href={qs({ customer: undefined })}>{t('allCustomers')}</Link>{customers.map((c) => <Link key={c.id} className={`pill ${f.customer === c.id ? 'agent' : ''}`} href={qs({ customer: c.id })}>{c.name}</Link>)}
        <span className="muted">·</span>
        <Link className={`pill ${!f.factory ? 'agent' : ''}`} href={qs({ factory: undefined })}>{t('allFactories')}</Link>{factories.map((c) => <Link key={c.id} className={`pill ${f.factory === c.id ? 'agent' : ''}`} href={qs({ factory: c.id })}>{c.name}</Link>)}
        <span className="muted">·</span>
        <Link className={`pill ${f.off ? 'warn' : ''}`} href={qs({ off: f.off ? undefined : '1' })}>{t('offPlanOnly')}</Link>
      </div>
      {/* phones: one card per order with the next open milestone, instead of a 16-column table */}
      <div className="grid gap-2 mt-4 md:hidden">
        {all.map((o) => { const next = MILESTONES.map((k) => [k, o.health.p[k]] as const).find(([, m]) => m && m.status !== 'done'); return (
          <Link key={o.id} href={`${base}/${encodeURIComponent(o.po)}`} className="card block no-underline" style={{ color: 'inherit', padding: 12 }}>
            <div className="flex items-center gap-2"><span className="mono" style={{ color: 'var(--accent)' }}>{o.po}</span>{o.status !== 'open' && <span className="pill">{o.status}</span>}<span className="ml-auto"><HealthPill h={o.health} /></span></div>
            <div className="mt-1"><b>{o.style}</b> <span className="muted small">{o.description}</span></div>
            <div className="small muted mt-1">{o.customer?.name} · {o.factory?.short || o.factory?.name} · {o.qty?.toLocaleString('en-GB')} @ {o.fob?.toFixed(2)}</div>
            {next && <div className="small mt-1"><span className="muted">{LABELS[next[0]]}</span> <MsCell m={next[1]!} /></div>}
          </Link>); })}
        {!all.length && <div className="card muted">{t('none')}</div>}
      </div>
      <div className="card tw mt-4 hidden md:block" style={{ padding: 0 }}>
        <table className="t"><thead><tr><th>PO</th><th>{t('style')}</th><th className="text-right">{t('qty')}</th><th className="text-right">FOB</th><th>{t('health')}</th>{MILESTONES.map((k) => <th key={k}>{LABELS[k]}</th>)}<th>{t('instore')}</th></tr></thead>
          <tbody>{all.map((o) => (
            <tr key={o.id} className="click"><td><Link href={`${base}/${encodeURIComponent(o.po)}`} className="mono">{o.po}</Link>{o.status !== 'open' && <div><span className="pill">{o.status}</span></div>}</td>
              <td><b>{o.style}</b><div className="muted small">{o.description}</div><div className="small">{o.customer?.name} <span className="muted">· {o.factory?.short || o.factory?.name}</span></div></td>
              <td className="text-right">{o.qty?.toLocaleString('en-GB')}</td><td className="text-right">{o.fob?.toFixed(2)}</td><td><HealthPill h={o.health} /></td>
              {MILESTONES.map((k) => <td key={k}>{o.health.p[k] ? <MsCell m={o.health.p[k]} /> : <span className="muted">–</span>}</td>)}
              <td className="muted small">{o.instore_date}</td></tr>
          ))}{!all.length && <tr><td colSpan={16} className="muted">{t('none')}</td></tr>}</tbody></table>
      </div>
      <p className="muted small mt-2">{t('legend')} · {isoOf(Math.floor(Date.now() / 864e5))}</p>
    </div>
  );
}
