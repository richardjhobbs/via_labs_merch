// Samples: every round across styles, the ones needing a decision or overdue first.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { listSamples, sampleState, STATE_PILL, type SampleState } from '@/lib/samples';
import { RowLink } from '@/components/row-link';

const RANK: Record<SampleState, number> = { rejected: 0, resubmit: 1, overdue: 2, awaiting: 3, in_transit: 4, planned: 5, approved: 6 };

export default async function Samples({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ state?: string }> }) {
  const { tenant: slug } = await params; const f = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('samples');
  const sb = await supabaseServer();
  const scope = scopeOf(membership);
  let all = (await listSamples(tenant.id, {}, sb)).filter((s) => !scope || (s.style?.customer_id && scope.includes(s.style.customer_id)));
  const states = all.map((s) => sampleState(s));
  const count = (st: SampleState) => states.filter((x) => x === st).length;
  if (f.state) all = all.filter((s) => sampleState(s) === f.state);
  all.sort((a, b) => RANK[sampleState(a)] - RANK[sampleState(b)] || (a.due_at || '9').localeCompare(b.due_at || '9'));
  const d = (x: string | null) => (x ? new Date(x + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' }) : '—');
  const base = `/app/${slug}/samples`;
  return (
    <div>
      <h1>{t('pageTitle')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('pageSub')}</p>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${count('awaiting') ? 'warn' : 'ok'}`}><div className="n">{count('awaiting')}</div><div className="l">{t('state.awaiting')}</div></div>
        <div className={`kpi ${count('overdue') + count('rejected') + count('resubmit') ? 'crit' : 'ok'}`}><div className="n">{count('overdue') + count('rejected') + count('resubmit')}</div><div className="l">{t('kpiLateOrRejected')}</div></div>
        <div className="kpi"><div className="n">{count('in_transit')}</div><div className="l">{t('state.in_transit')}</div></div>
        <div className="kpi ok"><div className="n">{count('approved')}</div><div className="l">{t('state.approved')}</div></div>
      </div>
      <div className="chips flex gap-2 flex-wrap mt-4 small"><Link className={`pill ${!f.state ? 'agent' : ''}`} href={base}>{t('all')}</Link>{(Object.keys(RANK) as SampleState[]).map((st) => <Link key={st} className={`pill ${f.state === st ? 'agent' : ''}`} href={`${base}?state=${st}`}>{t(`state.${st}`)}</Link>)}</div>
      <div className="card tw mt-4" style={{ padding: 0 }}><table className="t stack"><thead><tr><th>{t('colRound')}</th><th>{t('colStyle')}</th><th>{t('colMaker')}</th><th>{t('colDue')}</th><th>{t('colSent')}</th><th>{t('colState')}</th></tr></thead><tbody>
        {all.map((s) => { const st = sampleState(s); return (
          <RowLink key={s.id} href={`/app/${slug}/styles/${s.style_id}/samples/${s.id}`}>
            <td><Link href={`/app/${slug}/styles/${s.style_id}/samples/${s.id}`} className="font-medium">{t(`type.${s.type}`)} R{s.round}</Link>{s.size && <span className="muted small"> · {s.size}</span>}</td>
            <td data-l={t('colStyle')}>{s.style ? <Link href={`/app/${slug}/styles/${s.style.id}`}>{s.style.code}</Link> : s.order?.po || '—'}<div className="muted small">{s.style?.name}</div></td>
            <td data-l={t('colMaker')}>{s.maker?.short || s.maker?.name || '—'}</td><td data-l={t('colDue')} className="small">{d(s.due_at)}</td><td data-l={t('colSent')} className="small">{d(s.sent_at)}{s.awb ? <div className="muted">{s.courier} {s.awb}</div> : null}</td>
            <td data-l={t('colState')}><span className={`pill ${STATE_PILL[st]}`}>{t(`state.${st}`)}</span></td>
          </RowLink>); })}
        {!all.length && <tr><td colSpan={6} className="muted">{t('none')}</td></tr>}
      </tbody></table></div>
    </div>
  );
}
