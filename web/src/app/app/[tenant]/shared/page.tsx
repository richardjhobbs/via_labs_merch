// The partner portal: a customer's or supplier's people see the compliance records that concern their
// company, and the styles developed for it, and nothing else. Compliance: what they owe (tasks for their
// company) and what they set (programmes their company issued, with progress and approved reports).
// Development: their styles with the confirmed tech pack version and the rounds awaiting a decision.
// Reads run under RLS (merch.partner_task_ok, merch.partner_style_ok).
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { STATE_PILL, taskState, esgEnabled } from '@/lib/esg-shared';
import { tenantTracks } from '@/lib/tracks';
import { listStyles, STATUS_PILL } from '@/lib/styles';
import { listSamples, sampleState } from '@/lib/samples';

export default async function Shared({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership } = await requireTenant(slug, { partner: true });
  const t = await getTranslations('partners'), te = await getTranslations('esg'), tst = await getTranslations('styles');
  const tsStatus = (x: string) => tst(`status.${x}` as never);
  const sb = await supabaseServer();
  const mine = membership.role === 'partner' ? membership.scopes?.parties || [] : [];
  const [{ data: tasks }, { data: programmes }, { data: reports }, { data: parties }, { data: tn }, styles, samples] = await Promise.all([
    sb.from('esg_tasks').select('id, party_id, programme_id, period_label, due_date, status, esg_requirements(title, code, lead_days, trigger), esg_programmes(name, issuer_party_id), orders(po)').eq('tenant_id', tenant.id).order('due_date').limit(300),
    sb.from('esg_programmes').select('id, name, kind, status').eq('tenant_id', tenant.id).in('issuer_party_id', mine.length ? mine : ['00000000-0000-0000-0000-000000000000']),
    sb.from('esg_reports').select('id, programme_id, period_label, status, approved_at, sent_at').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
    sb.from('parties').select('id, name').in('id', mine.length ? mine : ['00000000-0000-0000-0000-000000000000']),
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    listStyles(tenant.id, { customers: mine.length ? mine : ['00000000-0000-0000-0000-000000000000'] }, sb),
    listSamples(tenant.id, { open: true }, sb),
  ]);
  const esg = esgEnabled(tn?.settings), dev = tenantTracks(tn?.settings as never).includes('development');
  const awaiting = (styleId: string) => samples.filter((x) => x.style_id === styleId && sampleState(x) === 'awaiting').length;
  const rows = (tasks || []).map((x) => { const r = x.esg_requirements as unknown as { title: string; code: string | null; lead_days: number; trigger: string }; return { ...x, r, prog: x.esg_programmes as unknown as { name: string; issuer_party_id: string | null }, po: (x.orders as unknown as { po: string } | null)?.po, state: taskState(x, r.lead_days) }; });
  const owed = rows.filter((x) => x.party_id && mine.includes(x.party_id));
  const toDo = owed.filter((x) => !['done', 'waived', 'review'].includes(x.state));
  const issued = (programmes || []).map((p) => { const ts = rows.filter((x) => x.programme_id === p.id); return { ...p, total: ts.length, done: ts.filter((x) => x.state === 'done').length, overdue: ts.filter((x) => x.state === 'overdue').length, reports: (reports || []).filter((r) => r.programme_id === p.id) }; });
  const Line = ({ x }: { x: (typeof rows)[number] }) => (
    <Link href={`/app/${slug}/shared/task/${x.id}`} className="block small no-underline" style={{ color: 'inherit', borderTop: '1px solid var(--line2)', padding: '8px 0' }}>
      <span className={`pill ${STATE_PILL[x.state]}`}>{te(`state.${x.state}`)}</span> <b>{x.r.code ? `${x.r.code} ` : ''}{x.r.title}</b>
      <div className="muted">{x.po ? `PO ${x.po}` : x.period_label} · {x.r.trigger === 'expiry' ? te('expiresOn', { date: x.due_date }) : te('dueOn', { date: x.due_date })} · {x.prog.name}</div>
    </Link>
  );
  return (
    <div className="max-w-5xl">
      <h1>{t(dev && !esg ? 'titleDev' : dev ? 'titleBoth' : 'title', { company: tenant.name })}</h1>
      <p className="muted small mt-1" style={{ maxWidth: '76ch' }}>{t(dev && !esg ? 'subDev' : dev ? 'subBoth' : 'sub', { party: (parties || []).map((p) => p.name).join(', ') || '…', company: tenant.name })}</p>
      {dev && <div className="card mt-4">
        <div className="flex items-center gap-2 flex-wrap"><h2>{t('styles')}</h2><span className="muted small">{t('stylesN', { n: styles.length })}</span></div>
        {!styles.length && <p className="muted small mt-2">{t('noStyles')}</p>}
        {!!styles.length && <div className="tw mt-2"><table className="t stack"><thead><tr><th>{t('colStyle')}</th><th>{t('colSeason')}</th><th>{t('colStatus')}</th><th>{t('colAwaiting')}</th></tr></thead><tbody>
          {styles.map((s) => { const n = awaiting(s.id); return <tr key={s.id}><td><Link href={`/app/${slug}/shared/styles/${s.id}`} className="font-medium">{s.code}</Link>{s.name && <span className="muted small"> · {s.name}</span>}</td><td data-l={t('colSeason')} className="small">{s.season || '—'}</td><td data-l={t('colStatus')}><span className={`pill ${STATUS_PILL[s.status]}`}>{tsStatus(s.status)}</span></td><td data-l={t('colAwaiting')}>{n ? <span className="pill warn">{t('awaitingN', { n })}</span> : <span className="muted small">—</span>}</td></tr>; })}
        </tbody></table></div>}
      </div>}
      {esg && <div className="grid gap-4 mt-4 md:grid-cols-2">
        <div className="card self-start">
          <h2>{t('toProvide')} <span className="muted">({toDo.length})</span></h2>
          {!toDo.length && <p className="muted small mt-2">{t('nothingToProvide')}</p>}
          <div className="mt-2">{toDo.slice(0, 30).map((x) => <Line key={x.id} x={x} />)}</div>
          {owed.length > toDo.length && <details className="mt-3 small"><summary className="muted">{t('provided', { n: owed.length - toDo.length })}</summary><div className="mt-2">{owed.filter((x) => !toDo.includes(x)).slice(0, 40).map((x) => <Line key={x.id} x={x} />)}</div></details>}
        </div>
        <div className="card self-start">
          <h2>{t('youSet')}</h2>
          {!issued.length && <p className="muted small mt-2">{t('noneSet')}</p>}
          {issued.map((p) => (
            <div key={p.id} className="small mt-3 pt-3" style={{ borderTop: '1px solid var(--line2)' }}>
              <b>{p.name}</b> <span className="muted">· {te(`pkind.${p.kind}` as never)}</span>
              <div className="mt-1 flex gap-2 flex-wrap"><span className="pill ok">{te('nDone', { n: p.done })}</span><span className="pill">{te('nReq', { n: p.total })}</span>{!!p.overdue && <span className="pill crit">{te('state.overdue')} {p.overdue}</span>}</div>
              {!!p.reports.length && <div className="mt-2 grid gap-1">{p.reports.map((r) => <a key={r.id} href={`/api/export/esg?tenant=${slug}&report=${r.id}`}>{te('reports')}: {r.period_label} ({te(`rstatus.${r.status}` as never)})</a>)}</div>}
            </div>))}
        </div>
      </div>}
      <p className="muted small mt-6" style={{ maxWidth: '76ch' }}>{t('privacy', { company: tenant.name })}</p>
    </div>
  );
}
