// ESG & compliance: the requirements the company's lenders, customers and certifiers impose, the work they
// create for each role, and the reports back. A paid add-on, switched on per company in the VIA console.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canLead, esgEnabled, esgSnapshot, isMine, PROGRAMME_KINDS, STATE_PILL } from '@/lib/esg';
import { addProgramme } from './actions';

export default async function Esg({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership, user } = await requireTenant(slug);
  const [t, tr] = await Promise.all([getTranslations('esg'), getTranslations('roles')]);
  const sb = await supabaseServer();
  const [{ data: tn }, { data: programmes }, { data: parties }, tasks] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    sb.from('esg_programmes').select('id, name, kind, issuer_name, chain, status, ends_on, parties(name), esg_requirements(count)').eq('tenant_id', tenant.id).order('status').order('created_at', { ascending: false }),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).order('name'),
    esgSnapshot(tenant.id, sb),
  ]);
  if (!esgEnabled(tn?.settings)) return <AddOn t={t} />;
  const lead = canLead(membership.role), manager = ['owner', 'manager'].includes(membership.role);
  const overdue = tasks.filter((x) => x.state === 'overdue'), due = tasks.filter((x) => x.state === 'due' || x.state === 'returned'), review = tasks.filter((x) => x.state === 'review');
  const mine = tasks.filter((x) => (manager ? true : isMine(x, user.id, membership.role)) && x.state !== 'upcoming');
  const forReview = lead ? review : [];
  const byProg = (id: string) => tasks.filter((x) => x.programme_id === id);
  const issuers = (parties || []).filter((p) => ['bank', 'funder', 'brand', 'retailer', 'buying_office', 'auditor', 'other'].includes(p.kind));
  const Row = ({ x }: { x: (typeof tasks)[number] }) => (
    <Link href={`/app/${slug}/esg/task/${x.id}`} className="block no-underline small" style={{ borderTop: '1px solid var(--line2)', padding: '9px 0', color: 'inherit' }}>
      <div className="flex items-center gap-2 flex-wrap"><span className={`pill ${STATE_PILL[x.state]}`}>{t(`state.${x.state}`)}</span><span className="pill">{t(`disc.${x.discipline}` as never)}</span><span className="muted">{x.period}</span><span className="muted ml-auto">{x.days_left < 0 ? t('daysOver', { n: -x.days_left }) : t('dueIn', { date: x.due, n: x.days_left })}</span></div>
      <div className="mt-1 font-medium">{x.code ? <span className="mono muted">{x.code} </span> : null}{x.title}</div>
      <div className="muted">{x.programme} · {t('roleOwner', { role: tr(x.owner_role as never) })}</div>
    </Link>
  );
  return (
    <div className="max-w-6xl">
      <h1>{t('title')}</h1>
      <p className="muted small mt-1" style={{ maxWidth: '76ch' }}>{t('sub')}</p>
      {q.error && <div className="notice crit mt-3">{q.error}</div>}
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${overdue.length ? 'crit' : 'ok'}`}><div className="n">{overdue.length}</div><div className="l">{t('kOverdue')}</div></div>
        <div className={`kpi ${due.length ? 'warn' : ''}`}><div className="n">{due.length}</div><div className="l">{t('kDue')}</div></div>
        <div className={`kpi ${review.length ? 'warn' : ''}`}><div className="n">{review.length}</div><div className="l">{t('kReview')}</div></div>
        <div className="kpi"><div className="n">{(programmes || []).filter((p) => p.status === 'active').length}</div><div className="l">{t('kProgrammes')}</div></div>
      </div>
      <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="grid gap-5 self-start" style={{ minWidth: 0 }}>
          <div className="card">
            <h2>{manager ? t('allDue') : t('yours')}</h2>
            {!mine.length && <p className="muted small mt-2">{t('nothingDue')}</p>}
            <div className="mt-2">{mine.slice(0, 12).map((x) => <Row key={x.id} x={x} />)}</div>
          </div>
          {!!forReview.length && !manager && <div className="card"><h2>{t('toReview')}</h2><div className="mt-2">{forReview.slice(0, 8).map((x) => <Row key={x.id} x={x} />)}</div></div>}
          <div>
            <h2 className="mb-2">{t('programmes')}</h2>
            <div className="card tw" style={{ padding: 0 }}><table className="t"><thead><tr><th>{t('programme')}</th><th>{t('issuer')}</th><th>{t('kind')}</th><th className="text-right">{t('requirements')}</th><th className="text-right">{t('open')}</th><th>{t('next')}</th></tr></thead><tbody>
              {(programmes || []).map((p) => { const open = byProg(p.id), next = open[0], over = open.filter((x) => x.state === 'overdue').length; return (
                <tr key={p.id}><td><Link href={`/app/${slug}/esg/${p.id}`}><b>{p.name}</b></Link>{p.status !== 'active' && <span className="pill ml-2">{t(`pstatus.${p.status}` as never)}</span>}{p.chain && <div className="muted small">{p.chain}</div>}</td>
                  <td className="small">{(p.parties as unknown as { name: string } | null)?.name || p.issuer_name || ''}</td><td className="small">{t(`pkind.${p.kind}` as never)}</td>
                  <td className="text-right">{(p.esg_requirements as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                  <td className="text-right">{open.length || ''}{over ? <span className="pill crit ml-1">{over}</span> : null}</td>
                  <td className="small">{next ? `${next.due} · ${next.title.slice(0, 40)}` : ''}</td></tr>); })}
              {!programmes?.length && <tr><td colSpan={6} className="muted">{t('noProgrammes')}</td></tr>}
            </tbody></table></div>
          </div>
          <div className="card">
            <h2>{t('howTitle')}</h2>
            <ol className="mt-2 grid gap-2 small" style={{ color: 'var(--fg2)' }}>{(['how1', 'how2', 'how3', 'how4'] as const).map((k, i) => <li key={k} className="flex gap-2"><b style={{ color: 'var(--accent)' }}>{i + 1}</b><span>{t(k)}</span></li>)}</ol>
          </div>
        </div>
        {lead ? <div className="grid gap-4 self-start">
          <div className="card"><h2>{t('docTitle')}</h2><p className="muted small mt-1 mb-3">{t('docHelp')}</p><Link className="btn primary" href={`/app/${slug}/esg/document`}>{t('docLink')}</Link></div>
          <form action={addProgramme} className="card">
            <h2 className="mb-3">{t('addProgramme')}</h2><input type="hidden" name="tenant" value={slug} />
            <label className="f"><span>{t('name')}</span><input className="input" name="name" required minLength={3} maxLength={160} placeholder={t('namePh')} /></label>
            <label className="f"><span>{t('kind')}</span><select className="input" name="kind" defaultValue="loan">{PROGRAMME_KINDS.map((k) => <option key={k} value={k}>{t(`pkind.${k}`)}</option>)}</select></label>
            <label className="f"><span>{t('issuer')}</span><select className="input" name="issuer_party_id" defaultValue=""><option value="">{t('notOnFile')}</option>{issuers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="f"><span>{t('issuerName')}</span><input className="input" name="issuer_name" maxLength={160} /></label>
            <label className="f"><span>{t('chain')}</span><input className="input" name="chain" maxLength={200} placeholder={t('chainPh')} /></label>
            <label className="f"><span>{t('purpose')}</span><input className="input" name="purpose" maxLength={400} /></label>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}><label className="f"><span>{t('starts')}</span><input className="input" type="date" name="starts_on" /></label><label className="f"><span>{t('ends')}</span><input className="input" type="date" name="ends_on" /></label></div>
            <button className="btn">{t('save')}</button>
          </form>
        </div> : <div className="card self-start small muted">{t('leadsOnly')}</div>}
      </div>
    </div>
  );
}

function AddOn({ t }: { t: Awaited<ReturnType<typeof getTranslations<'esg'>>> }) {
  return (
    <div className="max-w-3xl">
      <h1>{t('title')}</h1>
      <div className="card mt-4">
        <span className="pill agent">{t('addonPill')}</span>
        <h2 className="mt-3" style={{ fontSize: 18 }}>{t('addonTitle')}</h2>
        <p className="mt-2" style={{ color: 'var(--fg2)' }}>{t('addonP1')}</p>
        <ul className="mt-3 grid gap-2 small" style={{ color: 'var(--fg2)' }}>{(['how1', 'how2', 'how3', 'how4'] as const).map((k) => <li key={k} className="flex gap-2"><span style={{ color: 'var(--accent)' }}>→</span><span>{t(k)}</span></li>)}</ul>
        <a className="btn primary mt-4" href="mailto:contact@getvia.xyz?subject=VIA%20Merch%20ESG%20and%20compliance">{t('addonCta')}</a>
      </div>
    </div>
  );
}
