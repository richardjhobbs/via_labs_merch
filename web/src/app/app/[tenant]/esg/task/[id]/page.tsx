// One reporting task: what the requirement asks, in plain words; the figure and evidence to submit; every
// version submitted; and the check by an owner, manager or compliance lead.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canLead, esgEnabled, STATE_PILL, taskState } from '@/lib/esg';
import { assignTask, reviewTask, submitTask } from '../../actions';
import { EvidenceReader } from './evidence-reader';
import { hasLlm } from '@/lib/llm';

type Evidence = { name: string; path: string; bytes?: number; sha256?: string };

export default async function Task({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug, id } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, tr] = await Promise.all([getTranslations('esg'), getTranslations('roles')]);
  const sb = await supabaseServer();
  const [{ data: tn }, { data: task }, { data: subs }, { data: members }] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    sb.from('esg_tasks').select('*, target:parties!esg_tasks_party_id_fkey(id, name), order:orders(po), esg_requirements(*, parties(name)), esg_programmes(id, name, issuer_name, chain, parties(name))').eq('id', id).eq('tenant_id', tenant.id).maybeSingle(),
    sb.from('esg_submissions').select('*').eq('task_id', id).eq('tenant_id', tenant.id).order('version', { ascending: false }),
    sb.from('memberships').select('user_id, display_name, role').eq('tenant_id', tenant.id).neq('role', 'partner').order('display_name'),
  ]);
  if (!esgEnabled(tn?.settings)) redirect(`/app/${slug}/esg`);
  if (!task) notFound();
  const r = task.esg_requirements as unknown as { code: string | null; title: string; instruction: string | null; discipline: string; measure: string; unit: string | null; target: number | null; target_note: string | null; baseline: number | null; evidence: string | null; owner_role: string; lead_days: number; trigger: string; severity: string | null; parties: { name: string } | null };
  const forParty = task.target as unknown as { id: string; name: string } | null, forPo = (task.order as unknown as { po: string } | null)?.po;
  const askValidity = r.trigger === 'expiry' || r.measure === 'evidence';
  const p = task.esg_programmes as unknown as { id: string; name: string; issuer_name: string | null; chain: string | null; parties: { name: string } | null };
  const state = taskState(task, r.lead_days);
  const lead = canLead(membership.role), canSubmit = membership.role !== 'viewer' && !['accepted', 'waived'].includes(task.status);
  const latest = subs?.[0];
  const assignee = members?.find((m) => m.user_id === task.assignee_user_id)?.display_name;
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ev = (e: Evidence) => <a key={e.path} href={`/api/esg/evidence?tenant=${slug}&path=${encodeURIComponent(e.path)}`} target="_blank" className="pill" title={e.sha256 ? `sha256 ${e.sha256}` : ''}>{e.name}</a>;
  return (
    <div className="max-w-5xl">
      <div className="small"><Link href={`/app/${slug}/esg`}>{t('title')}</Link> · <Link href={`/app/${slug}/esg/${p.id}`}>{p.name}</Link></div>
      <div className="flex items-baseline gap-3 flex-wrap mt-1"><h1>{r.code ? <span className="muted">{r.code} </span> : null}{r.title}</h1><span className={`pill ${STATE_PILL[state]}`}>{t(`state.${state}`)}</span></div>
      <p className="muted small mt-1">{forPo ? <><Link href={`/app/${slug}/orders/${encodeURIComponent(forPo)}`}>PO {forPo}</Link> · </> : `${task.period_label} · `}{forParty && <><Link href={`/app/${slug}/parties/${forParty.id}`}>{forParty.name}</Link> · </>}{r.trigger === 'schedule' && t('periodEnds', { date: task.period_end })}{r.trigger !== 'schedule' ? null : ' · '}<b>{r.trigger === 'expiry' ? t('expiresOn', { date: task.due_date }) : t('dueOn', { date: task.due_date })}</b> · {t(`disc.${r.discipline}` as never)}{r.severity ? ` · ${t(`sev.${r.severity}` as never)}` : ''}</p>
      {q.error && <div className="notice crit mt-3">{q.error}</div>}
      {q.saved && <div className="notice ok mt-3">{t(`done_${q.saved}` as never)}</div>}
      {task.status === 'returned' && task.review_note && <div className="notice warn mt-3"><b>{t('returnedBy', { name: task.reviewed_by_name || '' })}</b> {task.review_note}</div>}

      <div className="grid gap-5 mt-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="grid gap-4 self-start" style={{ minWidth: 0 }}>
          <div className="card">
            <h2>{t('whatNeeded')}</h2>
            <p className="mt-2" style={{ color: 'var(--fg2)' }}>{r.instruction || r.title}</p>
            <dl className="small mt-3 grid gap-1" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 16 }}>
              {([['target', r.target != null || r.target_note ? `${r.target ?? ''}${r.unit ? ` ${r.unit}` : ''} ${r.target_note || ''}`.trim() : null], ['baseline', r.baseline != null ? `${r.baseline}${r.unit ? ` ${r.unit}` : ''}` : null], ['evidence', r.evidence], ['fromSupplierLabel', r.parties?.name], ['issuer', p.parties?.name || p.issuer_name], ['chain', p.chain]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{t(k)}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>

          {canSubmit && hasLlm() && <EvidenceReader tenant={slug} taskId={id} formId={`submit-${id}`} />}
          {canSubmit && <form action={submitTask} className="card" id={`submit-${id}`}>
            <h2>{latest ? t('submitNew') : t('submit')}</h2>
            <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} /><input type="hidden" name="pending_evidence" defaultValue="" />
            <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: r.measure === 'number' ? '1fr 2fr' : '1fr' }}>
              {r.measure === 'number' && <label className="f"><span>{t('value')}{r.unit ? ` (${r.unit})` : ''}</span><input className="input" name="value_num" inputMode="decimal" required defaultValue={latest?.value_num ?? ''} /></label>}
              {r.measure === 'yes_no' ? <label className="f"><span>{t('answer')}</span><select className="input" name="value_text" defaultValue={latest?.value_text || ''} required><option value="" /><option value="Yes">{t('yes')}</option><option value="No">{t('no')}</option></select></label>
                : <label className="f"><span>{r.measure === 'text' ? t('narrative') : t('comment')}</span><textarea className="input" name="value_text" rows={r.measure === 'text' ? 5 : 2} maxLength={4000} defaultValue={latest?.value_text || ''} /></label>}
            </div>
            {askValidity && <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}><label className="f"><span>{t('validFrom')}</span><input className="input" type="date" name="valid_from" defaultValue={latest?.valid_from || ''} /></label><label className="f"><span>{t('validUntil')}{r.trigger === 'expiry' ? ' *' : ''}</span><input className="input" type="date" name="valid_until" required={r.trigger === 'expiry'} defaultValue={latest?.valid_until || ''} /></label></div>}
            {r.trigger === 'expiry' && <p className="muted small mb-3">{t('expiryHelp')}</p>}
            <label className="f"><span>{t('howMeasured')}</span><input className="input" name="note" maxLength={2000} defaultValue={latest?.note || ''} placeholder={t('howMeasuredPh')} /></label>
            <label className="f"><span>{t('evidenceFiles')}</span><input className="input" type="file" name="evidence" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv,.doc,.docx" /></label>
            {!!(latest?.evidence as Evidence[] | undefined)?.length && <label className="flex items-center gap-2 small mb-3"><input type="checkbox" name="keep_evidence" defaultChecked />{t('keepEvidence', { n: (latest!.evidence as Evidence[]).length })}</label>}
            <p className="muted small mb-3">{t('submitNote')}</p>
            <button className="btn primary">{t('submitBtn')}</button>
          </form>}

          <div className="card">
            <h2>{t('history')}</h2>
            {!subs?.length && <p className="muted small mt-2">{t('noSubmissions')}</p>}
            <div className="mt-2 grid gap-2">{(subs || []).map((s) => (
              <div key={s.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
                <div className="flex gap-2 items-center flex-wrap"><span className="pill">v{s.version}</span><b>{s.value_num != null ? `${Number(s.value_num).toLocaleString('en-GB')}${r.unit ? ` ${r.unit}` : ''}` : ''}</b><span className="muted">{s.submitted_by_name} · {t(`src.${s.source}` as never)} · {when(s.created_at)}</span>{s.valid_until && <span className="pill">{t('validRange', { from: s.valid_from || '…', to: s.valid_until })}</span>}</div>
                {s.value_text && <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{s.value_text}</div>}
                {s.note && <div className="muted mt-1">{s.note}</div>}
                {!!(s.evidence as Evidence[]).length && <div className="flex gap-1 flex-wrap mt-1">{(s.evidence as Evidence[]).map(ev)}</div>}
              </div>))}</div>
          </div>
        </div>

        <div className="grid gap-4 self-start">
          <div className="card small">
            <h2 style={{ fontSize: 15 }}>{t('who')}</h2>
            <p className="mt-1">{assignee || t('anyoneRole', { role: tr(r.owner_role as never) })}</p>
            {lead && <form action={assignTask} className="mt-2 flex gap-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
              <select className="input sm" name="assignee_user_id" defaultValue={task.assignee_user_id || ''}><option value="">{t('anyInRole')}</option>{(members || []).filter((m) => m.role !== 'viewer').map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select><button className="btn sm">{t('assign')}</button></form>}
          </div>
          {lead && <div className="card small">
            <h2 style={{ fontSize: 15 }}>{t('check')}</h2>
            <p className="muted mt-1">{t('checkHelp')}</p>
            {task.reviewed_at && <p className="mt-2">{t('lastDecision', { name: task.reviewed_by_name || '', when: when(task.reviewed_at), status: t(`tstatus.${task.status}` as never) })}</p>}
            <form action={reviewTask} className="mt-2 grid gap-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
              <textarea className="input" name="review_note" rows={2} maxLength={1000} placeholder={t('reviewNotePh')} />
              <div className="flex gap-2 flex-wrap">
                {task.status === 'submitted' && <button className="btn primary sm" name="decision" value="accept">{t('accept')}</button>}
                {task.status === 'submitted' && <button className="btn sm" name="decision" value="return">{t('return')}</button>}
                {['open', 'returned'].includes(task.status) && <button className="btn sm" name="decision" value="waive">{t('waive')}</button>}
                {['accepted', 'waived'].includes(task.status) && <button className="btn sm" name="decision" value="reopen">{t('reopen')}</button>}
              </div>
            </form>
          </div>}
        </div>
      </div>
    </div>
  );
}
