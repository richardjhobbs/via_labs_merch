// On the order page: the development behind the PO. The confirmed tech pack version the order was handed over
// with, sample rounds and their decisions, approved materials, and the link back to the style file.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { styleRecords, techPackVersions } from '@/lib/records';
import { listSamples, listMaterials, sampleState, STATE_PILL } from '@/lib/samples';
import { linkOrderToStyle } from '@/app/app/[tenant]/styles/[id]/handover-actions';

export async function DevHistory({ slug, tenantId, order, canEdit, tz }: { slug: string; tenantId: string; order: { id: string; po: string; style: string | null; style_id: string | null; meta: Record<string, unknown> | null; dev_style: { id: string; code: string; name: string | null; status: string } | null }; canEdit: boolean; tz: string }) {
  const t = await getTranslations('handover');
  const sb = await supabaseServer();
  if (!order.style_id) {
    // a PO that names a style code in development: offer the link
    if (!order.style) return null;
    const { data: cand } = await sb.from('styles').select('id, code, name, season, status').eq('tenant_id', tenantId).ilike('code', order.style.trim()).neq('status', 'dropped').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!cand) return null;
    return (
      <div className="card small" style={{ borderLeft: '3px solid var(--accent)' }}>
        <h3>{t('suggestTitle')}</h3>
        <p className="muted mt-1">{t('suggest', { code: cand.code, name: cand.name || '', season: cand.season || '' })}</p>
        <div className="flex gap-2 mt-2 flex-wrap"><Link className="btn sm" href={`/app/${slug}/styles/${cand.id}`}>{t('openStyle')}</Link>
          {canEdit && <form action={linkOrderToStyle}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="style_id" value={cand.id} /><input type="hidden" name="po" value={order.po} /><button className="btn primary sm">{t('link')}</button></form>}</div>
      </div>
    );
  }
  const [records, samples, materials] = await Promise.all([styleRecords(sb, tenantId, order.style_id), listSamples(tenantId, { styleId: order.style_id }, sb), listMaterials(tenantId, order.style_id, sb)]);
  const tps = techPackVersions(records);
  const h = (order.meta?.handover || null) as { tech_pack_version?: number | null; at?: string; by?: string; fabric_lead_days?: number | null } | null;
  const handedWith = tps.find((r) => r.version === h?.tech_pack_version) || tps[0] || null;
  const later = tps.filter((r) => handedWith && r.version > handedWith.version);
  const approved = materials.filter((m) => m.status === 'approved');
  const when = (x: string) => new Date(x).toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' });
  const s = order.dev_style;
  return (
    <div className="card small">
      <div className="flex items-center gap-2 flex-wrap"><h3>{t('title')}</h3>{s && <Link className="pill" href={`/app/${slug}/styles/${s.id}`}>{s.code}</Link>}</div>
      {h?.at && <p className="muted mt-1">{t('handedOver', { date: when(h.at), by: h.by || '' })}</p>}
      <dl className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
        <dt className="muted">{t('spec')}</dt><dd>{handedWith ? <Link href={`/app/${slug}/styles/${order.style_id}/records/${handedWith.id}`}>v{handedWith.version}{handedWith.parsed?.version_label ? ` · ${handedWith.parsed.version_label}` : ''}</Link> : '—'}{!!later.length && <span className="pill warn ml-1">{t('laterVersions', { n: later.length })}</span>}</dd>
        <dt className="muted">{t('rounds')}</dt><dd>{samples.length ? samples.slice(0, 6).map((x) => <span key={x.id} className="mr-1"><Link href={`/app/${slug}/styles/${order.style_id}/samples/${x.id}`}>{x.type.replace('_', ' ')} R{x.round}</Link> <span className={`pill ${STATE_PILL[sampleState(x)]}`}>{x.decision ? x.decision.replace(/_/g, ' ') : sampleState(x).replace('_', ' ')}</span></span>) : '—'}</dd>
        <dt className="muted">{t('materials')}</dt><dd>{materials.length ? t('materialsLine', { n: materials.length, approved: approved.length }) : '—'}{approved.filter((m) => m.kind === 'fabric').map((m) => <div key={m.id} className="muted">{m.item}: {m.supplier?.name || m.supplier_name || '—'}{m.lead_days ? ` · ${m.lead_days}d` : ''}</div>)}</dd>
      </dl>
      <p className="muted mt-2">{t('frozenNote')}</p>
    </div>
  );
}
