// Styles: the development desk's list. One row per style per season per customer, with status, the latest
// confirmed tech pack version and anything awaiting a check.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { listStyles, styleSignals, STYLE_STATUSES, STATUS_PILL } from '@/lib/styles';
import { RowLink } from '@/components/row-link';

export default async function Styles({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string; customer?: string; season?: string }> }) {
  const { tenant: slug } = await params; const f = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('styles');
  const sb = await supabaseServer();
  let all = await listStyles(tenant.id, { customers: scopeOf(membership) }, sb);
  const customers = [...new Map(all.map((s) => [s.customer?.id, s.customer])).values()].filter(Boolean) as { id: string; name: string }[];
  const seasons = [...new Set(all.map((s) => s.season).filter(Boolean))] as string[];
  const sig = await styleSignals(tenant.id, all.map((s) => s.id), sb);
  if (f.status) all = all.filter((s) => s.status === f.status);
  if (f.customer) all = all.filter((s) => s.customer?.id === f.customer);
  if (f.season) all = all.filter((s) => s.season === f.season);
  const live = all.filter((s) => !['handed_over', 'dropped'].includes(s.status));
  const pending = all.reduce((a, s) => a + (sig.get(s.id)?.pending || 0), 0);
  const withTp = all.filter((s) => sig.get(s.id)?.techPack).length;
  const base = `/app/${slug}/styles`;
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); const s = p.toString(); return base + (s ? '?' + s : ''); };
  const canAdd = membership.role !== 'viewer' && membership.id !== 'admin';
  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1>{t('title')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p></div>
        {canAdd && <Link className="btn primary sm" href={`${base}/new`}>{t('new')}</Link>}
      </div>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="kpi"><div className="n">{live.length}</div><div className="l">{t('kpiLive')}</div></div>
        <div className={`kpi ${pending ? 'warn' : 'ok'}`}><div className="n">{pending}</div><div className="l">{t('kpiPending')}</div></div>
        <div className="kpi"><div className="n">{withTp}/{all.length}</div><div className="l">{t('kpiTechPack')}</div></div>
        <div className="kpi ok"><div className="n">{all.filter((s) => ['adopted', 'handed_over'].includes(s.status)).length}</div><div className="l">{t('kpiAdopted')}</div></div>
      </div>
      <div className="chips flex gap-3 flex-wrap items-center mt-4 small">
        <span className="muted">{t('filter')}</span>
        <Link className={`pill ${!f.status ? 'agent' : ''}`} href={qs({ status: undefined })}>{t('allStatuses')}</Link>{STYLE_STATUSES.map((s) => <Link key={s} className={`pill ${f.status === s ? 'agent' : ''}`} href={qs({ status: s })}>{t(`status.${s}`)}</Link>)}
        {!!customers.length && <><span className="muted">·</span><Link className={`pill ${!f.customer ? 'agent' : ''}`} href={qs({ customer: undefined })}>{t('allCustomers')}</Link>{customers.map((c) => <Link key={c.id} className={`pill ${f.customer === c.id ? 'agent' : ''}`} href={qs({ customer: c.id })}>{c.name}</Link>)}</>}
        {!!seasons.length && <><span className="muted">·</span>{seasons.map((s) => <Link key={s} className={`pill ${f.season === s ? 'agent' : ''}`} href={qs({ season: f.season === s ? undefined : s })}>{s}</Link>)}</>}
      </div>
      <div className="card tw mt-4" style={{ padding: 0 }}>
        <table className="t stack"><thead><tr><th>{t('colStyle')}</th><th>{t('colCustomer')}</th><th>{t('colSeason')}</th><th>{t('colStatus')}</th><th>{t('colTechPack')}</th><th>{t('colUpdated')}</th></tr></thead><tbody>
          {all.map((s) => { const g = sig.get(s.id); return (
            <RowLink key={s.id} href={`${base}/${s.id}`}>
              <td><Link href={`${base}/${s.id}`} className="font-medium">{s.code}</Link>{s.name && <span> {s.name}</span>}<div className="muted small">{s.category}{s.description ? ` · ${s.description.slice(0, 80)}` : ''}</div></td>
              <td data-l={t('colCustomer')}>{s.customer?.name || '—'}</td>
              <td data-l={t('colSeason')}>{s.season || '—'}</td>
              <td data-l={t('colStatus')}><span className={`pill ${STATUS_PILL[s.status]}`}>{t(`status.${s.status}`)}</span></td>
              <td data-l={t('colTechPack')} className="small">{g?.techPack ? <span className="pill ok">v{g.techPack.version}</span> : <span className="muted">—</span>}{g?.pending ? <span className="pill warn ml-1">{t('pendingN', { n: g.pending })}</span> : null}</td>
              <td className="small muted">{new Date(s.updated_at).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' })}</td>
            </RowLink>); })}
          {!all.length && <tr><td colSpan={6} className="muted">{t('none')} {canAdd && <Link href={`${base}/new`}>{t('new')}</Link>}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
