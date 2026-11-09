// What was read from a tech pack, brief or spec: header, colourways, BOM, points of measure, construction
// (with a translation beside it when one has been made), labelling, packaging, testing and notes.
import { getTranslations } from 'next-intl/server';
import type { TechPack } from '@/lib/records';
import { LANG_NAMES } from '@/lib/llm';

export async function TechPackView({ tp, lang }: { tp: TechPack; lang?: string | null }) {
  const t = await getTranslations('styles.tp');
  const tr = lang && tp.translations?.[lang] ? tp.translations[lang] : null;
  const head: [string, string | number | null][] = [[t('styleCode'), tp.style_code], [t('styleName'), tp.style_name], [t('customer'), tp.customer], [t('season'), tp.season], [t('version'), tp.version_label], [t('date'), tp.date], [t('category'), tp.category], [t('gender'), tp.gender], [t('sizes'), tp.sizes], [t('fabric'), tp.fabric_summary], [t('targetPrice'), tp.target_price != null ? `${tp.currency || ''} ${tp.target_price}` : null], [t('targetDelivery'), tp.target_delivery], [t('language'), tp.lang ? LANG_NAMES[tp.lang] || tp.lang : null]];
  return (
    <div className="grid gap-4 small">
      <dl className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>{head.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="muted">{k}</dt><dd>{v}</dd></div>)}</dl>
      {tp.description && <p>{tp.description}</p>}
      {!!tp.colourways.length && <div><b>{t('colourways')}</b><div className="flex gap-1 flex-wrap mt-1">{tp.colourways.map((c, i) => <span key={i} className="pill">{c.name}{c.code ? ` ${c.code}` : ''}{c.standard ? ` · ${c.standard}` : ''}</span>)}</div></div>}
      {!!tp.bom.length && <div className="tw"><b>{t('bom')}</b><table className="t mt-1" style={{ minWidth: 720 }}><thead><tr><th>{t('bomKind')}</th><th>{t('bomItem')}</th><th>{t('bomSpec')}</th><th>{t('bomColour')}</th><th>{t('bomSupplier')}</th><th>{t('bomQty')}</th></tr></thead><tbody>
        {tp.bom.map((b, i) => <tr key={i}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{t(`kind.${b.kind}`)}</td><td style={{ minWidth: 140 }}><b>{b.item}</b>{b.placement ? <div className="muted">{b.placement}</div> : null}</td><td style={{ minWidth: 220 }}>{[b.description, b.composition, b.construction, b.weight].filter(Boolean).join(' · ')}</td><td>{b.colour}</td><td style={{ whiteSpace: 'nowrap' }}>{b.supplier}</td><td className="text-right">{b.qty}</td></tr>)}
      </tbody></table></div>}
      {!!tp.poms.length && <div className="tw"><b>{t('poms')}</b><table className="t mt-1" style={{ minWidth: 640 }}><thead><tr><th>{t('pomCode')}</th><th>{t('pomName')}</th><th className="text-right">{t('pomBase')}</th><th className="text-right">{t('pomTol')}</th><th>{t('pomSizes')}</th></tr></thead><tbody>
        {tp.poms.map((p, i) => <tr key={i}><td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{p.code}</td><td style={{ minWidth: 180 }}>{p.name}</td><td className="text-right" style={{ whiteSpace: 'nowrap' }}>{p.base_value != null ? `${p.base_value}${p.unit ? ` ${p.unit}` : ''}` : ''}{p.base_size ? <span className="muted"> ({p.base_size})</span> : null}</td><td className="text-right" style={{ whiteSpace: 'nowrap' }}>{p.tol_minus != null || p.tol_plus != null ? `−${p.tol_minus ?? '?'} / +${p.tol_plus ?? '?'}` : ''}</td><td className="muted">{p.by_size}</td></tr>)}
      </tbody></table></div>}
      {!!tp.construction.length && <div><b>{t('construction')}</b>{tr && <span className="muted"> · {t('translatedTo', { lang: LANG_NAMES[lang || ''] || lang || '' })}</span>}
        <ol className="mt-1 grid gap-1" style={{ paddingLeft: 18 }}>{tp.construction.map((l, i) => <li key={i}>{l}{tr?.construction[i] ? <div style={{ color: 'var(--accent)' }}>{tr.construction[i]}</div> : null}</li>)}</ol></div>}
      {(tp.labelling || tp.packaging || tp.testing || tp.notes) && <dl className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
        {tp.labelling && <><dt className="muted">{t('labelling')}</dt><dd>{tp.labelling}</dd></>}{tp.packaging && <><dt className="muted">{t('packaging')}</dt><dd>{tp.packaging}</dd></>}{tp.testing && <><dt className="muted">{t('testing')}</dt><dd>{tp.testing}</dd></>}{tp.notes && <><dt className="muted">{t('notes')}</dt><dd>{tp.notes}{tr?.notes ? <div style={{ color: 'var(--accent)' }}>{tr.notes}</div> : null}</dd></>}
      </dl>}
    </div>
  );
}
