// A compliance report back to the issuer. Draft: the agent's summary is edited and the figures refreshed.
// Approved by an owner or manager, it is fixed (the database refuses changes) and downloaded or printed for
// sending; recording who it went to closes it. Reports to lenders are claims, so nothing here sends itself.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canApproveReport, canLead, esgEnabled } from '@/lib/esg';
import { valueOf, type ReportRow } from '@/lib/esg-report';
import { approveReport, markReportSent, refreshReport, saveReportSummary } from '../../actions';
import { PrintButton } from './print-button';

export default async function Report({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug, id } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('esg');
  const sb = await supabaseServer();
  const [{ data: tn }, { data: rep }] = await Promise.all([
    sb.from('tenants').select('settings, name').eq('id', tenant.id).single(),
    sb.from('esg_reports').select('*, esg_programmes(id, name, issuer_name, chain, framework, reference, purpose, parties(name, contacts(email)))').eq('id', id).eq('tenant_id', tenant.id).maybeSingle(),
  ]);
  if (!esgEnabled(tn?.settings)) redirect(`/app/${slug}/esg`);
  if (!rep) notFound();
  const p = rep.esg_programmes as unknown as { id: string; name: string; issuer_name: string | null; chain: string | null; framework: string | null; reference: string | null; purpose: string | null; parties: { name: string; contacts: { email: string | null }[] } | null };
  const rows = rep.rows as ReportRow[];
  const draft = rep.status === 'draft', lead = canLead(membership.role), approver = canApproveReport(membership.role);
  const checked = rows.filter((r) => r.status === 'accepted').length, open = rows.filter((r) => !['accepted', 'waived'].includes(r.status));
  const issuer = p.parties?.name || p.issuer_name || '';
  const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tenant.tz }) : '');
  return (
    <div className="max-w-5xl">
      <div className="small no-print"><Link href={`/app/${slug}/esg`}>{t('title')}</Link> · <Link href={`/app/${slug}/esg/${p.id}`}>{p.name}</Link></div>
      {q.error && <div className="notice crit mt-3 no-print">{q.error}</div>}
      {q.saved && <div className="notice ok mt-3 no-print">{t(`done_${q.saved}` as never)}</div>}

      <div className="card mt-3">
        <div className="flex items-baseline gap-3 flex-wrap"><h1>{p.name}</h1><span className={`pill ${rep.status === 'sent' ? 'ok' : rep.status === 'approved' ? 'agent' : 'warn'}`}>{t(`rstatus.${rep.status}` as never)}</span></div>
        <p className="mt-1"><b>{rep.period_label}</b> <span className="muted small">({rep.period_from} → {rep.period_to})</span></p>
        <dl className="small mt-3 grid gap-1" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 16 }}>
          {([['company', tn?.name], ['issuer', issuer], ['chain', p.chain], ['framework', p.framework], ['reference', p.reference], ['purpose', p.purpose], ['preparedBy', rep.prepared_by_name], ['approvedBy', rep.approved_by_name ? `${rep.approved_by_name}, ${when(rep.approved_at)}` : null], ['sentTo', rep.sent_to ? `${rep.sent_to}, ${when(rep.sent_at)}${rep.sent_note ? ` (${rep.sent_note})` : ''}` : null]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{t(k)}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="flex gap-2 mt-3 flex-wrap small"><span className="pill">{t('nItems', { n: rows.length })}</span><span className="pill ok">{t('nChecked', { n: checked })}</span>{!!open.length && <span className="pill warn">{t('nOpen', { n: open.length })}</span>}</div>
        {draft && !!open.length && <div className="notice warn mt-3 small no-print">{t('openWarning')}</div>}
      </div>

      <div className="card mt-4">
        <h2>{t('summary')}</h2>
        {draft && lead ? (
          <form action={saveReportSummary} className="mt-2 no-print"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
            <textarea className="input" name="summary" rows={9} maxLength={8000} defaultValue={rep.summary || ''} />
            <div className="flex gap-2 mt-2"><button className="btn sm">{t('saveSummary')}</button><button className="btn sm" formAction={refreshReport}>{t('refresh')}</button></div>
          </form>
        ) : null}
        <div className={draft && lead ? 'print-only' : 'mt-2'} style={{ whiteSpace: 'pre-wrap', color: 'var(--fg2)' }}>{rep.summary}</div>
      </div>

      <div className="card mt-4 tw" style={{ padding: 0 }}>
        <table className="t"><thead><tr><th>{t('code')}</th><th>{t('requirement')}</th><th>{t('period')}</th><th>{t('target')}</th><th>{t('value')}</th><th>{t('status')}</th><th>{t('evidence')}</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.task_id}><td className="mono small">{r.code}</td><td className="small"><Link href={`/app/${slug}/esg/task/${r.task_id}`}>{r.title}</Link>{(r.party || r.po) && <div className="muted">{[r.party, r.po && `PO ${r.po}`].filter(Boolean).join(' · ')}</div>}{r.valid_until && <div className="muted">{t('validRange', { from: '…', to: r.valid_until })}</div>}{r.note && <div className="muted">{r.note}</div>}</td><td className="small">{r.period}</td>
              <td className="small">{r.target ?? r.target_note ?? ''}{r.target != null && r.unit ? ` ${r.unit}` : ''}{r.baseline != null && <div className="muted">{t('baseline')} {r.baseline}</div>}</td>
              <td className="small"><b>{valueOf(r)}</b>{r.version && r.version > 1 ? <span className="muted"> v{r.version}</span> : null}</td>
              <td><span className={`pill ${r.status === 'accepted' ? 'ok' : r.status === 'submitted' ? 'agent' : r.status === 'waived' ? '' : 'crit'}`}>{t(`tstatus.${r.status}` as never)}</span>{r.reviewed_by && <div className="muted small">{r.reviewed_by}</div>}</td>
              <td className="small">{r.evidence.map((e) => <a key={e.path} className="block" href={`/api/esg/evidence?tenant=${slug}&path=${encodeURIComponent(e.path)}`} target="_blank">{e.name}</a>)}</td></tr>))}
        </tbody></table>
      </div>

      <div className="card mt-4 no-print">
        <div className="flex gap-2 flex-wrap items-center">
          <a className="btn" href={`/api/export/esg?tenant=${slug}&report=${id}`}>{t('downloadXlsx')}</a>
          <PrintButton label={t('print')} />
          {draft && approver && <form action={approveReport}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} /><button className="btn primary">{t('approve')}</button></form>}
          {draft && !approver && <span className="muted small">{t('approverNote')}</span>}
        </div>
        {draft && <p className="muted small mt-2">{t('approveHelp')}</p>}
        {rep.status === 'approved' && approver && <form action={markReportSent} className="grid gap-2 mt-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
          <label className="f" style={{ margin: 0 }}><span>{t('sentToLabel')}</span><input className="input" name="sent_to" required maxLength={200} defaultValue={[issuer, p.parties?.contacts?.find((c) => c.email)?.email].filter(Boolean).join(', ')} /></label>
          <label className="f" style={{ margin: 0 }}><span>{t('sentNote')}</span><input className="input" name="sent_note" maxLength={500} placeholder={t('sentNotePh')} /></label>
          <button className="btn primary">{t('markSent')}</button>
        </form>}
      </div>
    </div>
  );
}
