import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { getOrder, exceptionsOf } from '@/lib/orders';
import { LABELS, MILESTONES, isoOf } from '@/lib/core/path';
import { OrderFile } from '@/components/order-file';
import { MsCell, HealthPill } from '@/components/milestones';
import { setMilestone } from '../actions';

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ tenant: string; po: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug, po } = await params; const { saved, error } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('orders');
  const o = await getOrder(tenant.id, decodeURIComponent(po));
  if (!o) notFound();
  const ex = exceptionsOf([o])[0];
  const canEdit = membership.role !== 'viewer';
  return (
    <div className="max-w-5xl">
      <Link href={`/app/${slug}/orders`} className="small">← {t('title')}</Link>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap"><h1 className="mono">{o.po}</h1><HealthPill h={o.health} /><span className="muted">{o.style} · {o.description}</span></div>
      {saved && <div className="notice mt-3">{t('saved')}</div>}{error && <div className="notice crit mt-3">{error}</div>}
      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="grid gap-4">
          <div className="card tw" style={{ padding: 0 }}>
            <div className="p-4 pb-2"><h2>{t('criticalPath')}</h2><p className="muted small">{t('pathNote')}</p></div>
            <table className="t"><thead><tr><th>{t('milestone')}</th><th>{t('owner')}</th><th>{t('plan')}</th><th>{t('forecast')}</th><th>{t('status')}</th><th>{t('reported')}</th>{canEdit && <th>{t('update')}</th>}</tr></thead><tbody>
              {MILESTONES.filter((k) => o.health.p[k]).map((k) => { const m = o.health.p[k]; const row = o.milestones.find((r) => r.key === k)!; return (
                <tr key={k}><td><b>{LABELS[k]}</b></td><td className="muted">{m.owner}</td><td className="mono">{isoOf(m.plan)}</td><td><MsCell m={m} />{m.slip > 0 && m.status !== 'done' && <span className="small" style={{ color: 'var(--warn)' }}> +{m.slip}d</span>}</td><td><span className={`pill ${m.status === 'done' ? 'ok' : m.status === 'late' ? 'crit' : m.status === 'risk' ? 'warn' : ''}`}>{m.status}</span></td>
                  <td className="small muted">{row.actual_date ? `actual ${row.actual_date}` : row.expected_date ? `expected ${row.expected_date}` : ''}{row.note ? ` · ${row.note}` : ''}</td>
                  {canEdit && <td><form action={setMilestone} className="flex gap-1 items-center"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="key" value={k} />
                    <select name="field" className="input" style={{ width: 'auto', padding: '3px 6px' }} defaultValue="expected"><option value="expected">{t('expected')}</option><option value="actual">{t('actual')}</option></select>
                    <input type="date" name="date" className="input" style={{ width: 'auto', padding: '3px 6px' }} defaultValue={row.actual_date || row.expected_date || ''} /><button className="btn sm">{t('save')}</button></form></td>}
                </tr>); })}
            </tbody></table>
          </div>
          {ex && <div className="card" style={{ borderColor: 'var(--crit-line)' }}><h2>{t('exception')}</h2><div className="mt-2"><span className={`pill ${ex.sev}`}>{ex.sev === 'crit' ? 'Critical' : 'Warning'}</span> <b>{ex.title}</b></div>
            <div className="mt-2 small">{ex.chain.map((c, i) => <span key={i}>{i ? <span className="muted"> → </span> : ''}<span style={{ color: c.cls === 'risk' ? 'var(--crit)' : c.cls === 'cost' ? 'var(--warn)' : 'inherit', fontWeight: c.cls === 'root' ? 600 : 400 }}>{c.t}</span></span>)}</div>
            <div className="mt-3 grid gap-2">{ex.opts.map((op, j) => <div key={j} className="small" style={{ padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 6 }}><b>{op[0]}</b>{j === 0 && <span className="pill agent ml-2">Mira recommends</span>}<div className="muted">{op[1]}</div></div>)}</div></div>}
        </div>
        <div className="grid gap-4 self-start">
          <div className="card small"><h3>{t('order')}</h3><dl className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
            <dt className="muted">{t('customer')}</dt><dd>{o.customer?.name}</dd><dt className="muted">{t('factory')}</dt><dd>{o.factory?.name}</dd><dt className="muted">Mill</dt><dd>{o.mill?.name || '–'}</dd><dt className="muted">Fibre</dt><dd>{o.fibre?.name || '–'}</dd>
            <dt className="muted">{t('qty')}</dt><dd>{o.qty?.toLocaleString('en-GB')}</dd><dt className="muted">FOB</dt><dd>{o.currency} {o.fob?.toFixed(2)} · {o.incoterm}</dd><dt className="muted">{t('route')}</dt><dd>{o.pol} → {o.pod}</dd><dt className="muted">{t('instore')}</dt><dd>{o.instore_date}</dd><dt className="muted">{t('composition')}</dt><dd>{o.composition}</dd>
          </dl></div>
          <div className="card small"><h3>{t('sizes')}</h3><div className="mt-2 flex gap-3 flex-wrap">{Object.entries(o.sizes || {}).map(([s, n]) => <span key={s}><b>{s}</b> {n}</span>)}</div><div className="mt-2">{o.colours.map((c) => <span key={c} className="pill mr-1">{c}</span>)}</div></div>
        </div>
      </div>
      <OrderFile slug={slug} tenantId={tenant.id} orderId={o.id} po={o.po} tz={tenant.tz} />
    </div>
  );
}
