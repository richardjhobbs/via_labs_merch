// Materials: every BOM line being sourced across styles, grouped by supplier, open items first.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { MATERIAL_PILL, MATERIAL_STATUSES, type MaterialStatus } from '@/lib/samples';

export default async function Materials({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string }> }) {
  const { tenant: slug } = await params; const f = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('materials');
  const sb = await supabaseServer();
  const scope = scopeOf(membership);
  const { data } = await sb.from('materials').select('id, kind, item, description, composition, colour, status, supplier_name, updated_at, style:styles!materials_style_id_fkey(id, code, name, customer_id), supplier:parties!materials_supplier_id_fkey(id, name)').eq('tenant_id', tenant.id).order('updated_at', { ascending: false });
  type Row = { id: string; kind: string; item: string; description: string | null; composition: string | null; colour: string | null; status: MaterialStatus; supplier_name: string | null; updated_at: string; style: { id: string; code: string; name: string | null; customer_id: string | null } | null; supplier: { id: string; name: string } | null };
  let rows = ((data || []) as unknown as Row[]).filter((m) => !scope || (m.style?.customer_id && scope.includes(m.style.customer_id)));
  const count = (st: MaterialStatus) => rows.filter((m) => m.status === st).length;
  if (f.status) rows = rows.filter((m) => m.status === f.status);
  const base = `/app/${slug}/materials`;
  return (
    <div>
      <h1>{t('pageTitle')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('pageSub')}</p>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${count('to_source') ? 'warn' : 'ok'}`}><div className="n">{count('to_source')}</div><div className="l">{t('status.to_source')}</div></div>
        <div className="kpi"><div className="n">{count('swatch_requested') + count('labdip_pending')}</div><div className="l">{t('kpiWaiting')}</div></div>
        <div className="kpi"><div className="n">{count('swatch_received')}</div><div className="l">{t('status.swatch_received')}</div></div>
        <div className="kpi ok"><div className="n">{count('approved')}</div><div className="l">{t('status.approved')}</div></div>
      </div>
      <div className="chips flex gap-2 flex-wrap mt-4 small"><Link className={`pill ${!f.status ? 'agent' : ''}`} href={base}>{t('all')}</Link>{MATERIAL_STATUSES.map((st) => <Link key={st} className={`pill ${f.status === st ? 'agent' : ''}`} href={`${base}?status=${st}`}>{t(`status.${st}`)}</Link>)}</div>
      <div className="card tw mt-4" style={{ padding: 0 }}><table className="t stack"><thead><tr><th>{t('colItem')}</th><th>{t('colStyle')}</th><th>{t('colSupplier')}</th><th>{t('colStatus')}</th><th>{t('colUpdated')}</th></tr></thead><tbody>
        {rows.map((m) => <tr key={m.id}><td><span className="pill mr-1">{t(`kind.${m.kind}`)}</span><b>{m.item}</b><div className="muted small">{[m.description, m.composition, m.colour].filter(Boolean).join(' · ')}</div></td><td data-l={t('colStyle')}>{m.style ? <Link href={`/app/${slug}/styles/${m.style.id}#materials`}>{m.style.code}</Link> : '—'}</td><td data-l={t('colSupplier')}>{m.supplier?.name || m.supplier_name || '—'}</td><td data-l={t('colStatus')}><span className={`pill ${MATERIAL_PILL[m.status]}`}>{t(`status.${m.status}`)}</span></td><td className="small muted">{new Date(m.updated_at).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' })}</td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="muted">{t('none')}</td></tr>}
      </tbody></table></div>
    </div>
  );
}
