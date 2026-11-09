// What was read from a costing sheet or quote: header, the cost lines by group, totals and the quoted price,
// against the style's target price when there is one.
import { getTranslations } from 'next-intl/server';
import type { Costing } from '@/lib/records';
import { LANG_NAMES } from '@/lib/llm';

const GROUPS = ['fabric', 'trim', 'labour', 'packing', 'testing', 'freight', 'overhead', 'profit', 'other'] as const;
const money = (n: number | null | undefined, cur: string | null) => (n == null ? '' : `${cur ? `${cur} ` : ''}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`);

export async function CostingView({ c, target }: { c: Costing; target?: { price: number | null; currency: string | null } | null }) {
  const t = await getTranslations('styles.costing');
  const cur = c.currency;
  const head: [string, string | number | null][] = [[t('supplier'), c.supplier], [t('customer'), c.customer], [t('season'), c.season], [t('version'), c.version_label], [t('date'), c.date], [t('incoterm'), [c.incoterm, c.port].filter(Boolean).join(' ') || null], [t('quantity'), c.quantity], [t('moq'), c.moq], [t('leadTime'), c.lead_time], [t('validUntil'), c.valid_until], [t('language'), c.lang ? LANG_NAMES[c.lang] || c.lang : null]];
  const gap = target?.price != null && c.price != null && (!target.currency || !cur || target.currency === cur) ? c.price - target.price : null;
  return (
    <div className="grid gap-4 small">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="p-3" style={{ background: 'var(--accent-soft)', borderRadius: 10, minWidth: 180 }}><div className="muted">{t('price')}{c.incoterm ? ` ${c.incoterm}` : ''}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{money(c.price, cur) || '—'}</div></div>
        {c.total_cost != null && <div className="p-3" style={{ background: 'var(--paper)', borderRadius: 10, minWidth: 160 }}><div className="muted">{t('totalCost')}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{money(c.total_cost, cur)}</div></div>}
        {c.margin_pct != null && <div className="p-3" style={{ background: 'var(--paper)', borderRadius: 10 }}><div className="muted">{t('margin')}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{c.margin_pct}%</div></div>}
        {target?.price != null && <div className="p-3" style={{ background: 'var(--paper)', borderRadius: 10 }}><div className="muted">{t('target')}</div><div style={{ fontSize: 18, fontWeight: 600 }}>{money(target.price, target.currency)}</div>{gap != null && <div className={`pill ${gap > 0 ? 'crit' : 'ok'}`} style={{ marginTop: 4 }}>{gap > 0 ? t('above', { n: money(gap, cur) }) : t('within', { n: money(-gap, cur) })}</div>}</div>}
      </div>
      <dl className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>{head.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="muted">{k}</dt><dd>{v}</dd></div>)}</dl>
      {!!c.lines.length && <div className="tw"><table className="t" style={{ minWidth: 640 }}><thead><tr><th>{t('group')}</th><th>{t('item')}</th><th>{t('consumption')}</th><th className="text-right">{t('unitPrice')}</th><th className="text-right">{t('amount')}</th></tr></thead><tbody>
        {GROUPS.filter((g) => c.lines.some((l) => l.group === g)).map((g) => c.lines.filter((l) => l.group === g).map((l, i) => <tr key={`${g}${i}`}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{i === 0 ? t(`groups.${g}`) : ''}</td><td style={{ minWidth: 180 }}><b>{l.item}</b>{l.note ? <div className="muted">{l.note}</div> : null}</td><td style={{ whiteSpace: 'nowrap' }}>{l.consumption}</td><td className="text-right" style={{ whiteSpace: 'nowrap' }}>{l.unit_price != null ? l.unit_price.toLocaleString('en-GB', { maximumFractionDigits: 4 }) : ''}</td><td className="text-right" style={{ whiteSpace: 'nowrap' }}>{l.amount != null ? l.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : ''}</td></tr>))}
      </tbody><tfoot>
        {c.materials_total != null && <tr><td colSpan={4} className="text-right muted">{t('materialsTotal')}</td><td className="text-right">{money(c.materials_total, cur)}</td></tr>}
        {c.labour_total != null && <tr><td colSpan={4} className="text-right muted">{t('labourTotal')}</td><td className="text-right">{money(c.labour_total, cur)}</td></tr>}
        {c.total_cost != null && <tr><td colSpan={4} className="text-right"><b>{t('totalCost')}</b></td><td className="text-right"><b>{money(c.total_cost, cur)}</b></td></tr>}
        {c.price != null && <tr><td colSpan={4} className="text-right"><b>{t('price')}</b></td><td className="text-right"><b>{money(c.price, cur)}</b></td></tr>}
      </tfoot></table></div>}
      {c.notes && <p><span className="muted">{t('notes')}:</span> {c.notes}</p>}
    </div>
  );
}
