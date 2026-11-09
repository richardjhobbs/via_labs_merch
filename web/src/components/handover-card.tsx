// On the style file: hand the style over to production as a new PO, or link an existing PO that names no style.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { handoverStyle } from '@/app/app/[tenant]/styles/[id]/handover-actions';
import type { StyleRow } from '@/lib/styles';

type Party = { id: string; name: string; kind: string };
type Order = { id: string; po: string; style: string | null; customer_id: string | null; status: string };

export async function HandoverCard({ slug, s, parties, orders, linked, canEdit, techPackVersion }: { slug: string; s: StyleRow; parties: Party[]; orders: Order[]; linked: { id: string; po: string; status: string }[]; canEdit: boolean; techPackVersion: number | null }) {
  const t = await getTranslations('handover');
  const factories = parties.filter((p) => ['factory', 'trading', 'other'].includes(p.kind));
  const free = orders.filter((o) => !o.customer_id || o.customer_id === s.customer?.id);
  return (
    <div className="card" id="handover">
      <div className="flex items-center gap-2 flex-wrap"><h2>{t('cardTitle')}</h2>{s.status === 'handed_over' && <span className="pill ok">{t('done')}</span>}</div>
      {!!linked.length && <div className="small mt-2">{t('linkedOrders')}: {linked.map((o) => <Link key={o.id} className="pill mr-1" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>PO {o.po}{o.status !== 'open' ? ` · ${o.status}` : ''}</Link>)}</div>}
      <p className="muted small mt-1">{t('cardNote')}{techPackVersion ? ` ${t('withTechPack', { v: techPackVersion })}` : ` ${t('noTechPack')}`}</p>
      {canEdit && (
        <details className="mt-3" open={s.status === 'adopted'}><summary className="small font-medium" style={{ cursor: 'pointer' }}>{s.status === 'handed_over' ? t('another') : t('handOver')}</summary>
          <form action={handoverStyle} className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={s.id} />{s.status === 'handed_over' && <input type="hidden" name="again" value="1" />}
            <label className="f"><span>{t('fPo')}</span><input className="input" name="po" maxLength={60} placeholder="48840" /></label>
            <label className="f"><span>{t('fFactory')}</span><select className="input" name="factory_id" defaultValue=""><option value="">—</option>{factories.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="f"><span>{t('fQty')}</span><input className="input" name="qty" inputMode="numeric" /></label>
            <label className="f"><span>FOB</span><div className="flex gap-1"><input className="input" name="currency" maxLength={3} defaultValue={s.currency} style={{ width: 64 }} /><input className="input" name="fob" inputMode="decimal" defaultValue={s.target_price ?? ''} /></div></label>
            <label className="f"><span>ETD</span><input className="input" type="date" name="etd" /></label>
            <label className="f"><span>{t('fInstore')}</span><input className="input" type="date" name="instore_date" defaultValue={s.target_delivery || ''} /></label>
            <label className="f"><span>{t('fDestination')}</span><input className="input" name="destination" maxLength={2} placeholder="GB" /></label>
            <div style={{ gridColumn: '1 / -1' }} className="flex gap-2 items-center flex-wrap"><button className="btn primary">{t('createPo')}</button><span className="muted small">{t('orLink')}</span>
              <select className="input sm" name="order_id" defaultValue="" style={{ width: 'auto' }}><option value="">—</option>{free.map((o) => <option key={o.id} value={o.id}>PO {o.po}{o.style ? ` · ${o.style}` : ''}</option>)}</select><button className="btn sm" formNoValidate>{t('linkExisting')}</button></div>
            <p className="muted small" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('what')}</p>
          </form></details>)}
    </div>
  );
}
