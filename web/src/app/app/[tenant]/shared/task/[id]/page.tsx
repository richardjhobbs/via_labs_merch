// One task in the partner portal: what is asked, the versions so far, and, when it is for the partner's
// company and still open, the form to supply it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { STATE_PILL, taskState } from '@/lib/esg-shared';
import { partnerSubmit } from '../../actions';

type Evidence = { name: string; path: string; sha256?: string };

export default async function SharedTask({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug, id } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug, { partner: true });
  const [t, tp] = await Promise.all([getTranslations('esg'), getTranslations('partners')]);
  const sb = await supabaseServer();
  const [{ data: task }, { data: subs }] = await Promise.all([
    sb.from('esg_tasks').select('*, orders(po), esg_requirements(code, title, instruction, measure, unit, target, target_note, evidence, trigger, lead_days), esg_programmes(name)').eq('id', id).eq('tenant_id', tenant.id).maybeSingle(),
    sb.from('esg_submissions').select('*').eq('task_id', id).order('version', { ascending: false }),
  ]);
  if (!task) notFound();
  const r = task.esg_requirements as unknown as { code: string | null; title: string; instruction: string | null; measure: string; unit: string | null; target: number | null; target_note: string | null; evidence: string | null; trigger: string; lead_days: number };
  const state = taskState(task, r.lead_days), po = (task.orders as unknown as { po: string } | null)?.po;
  const canSubmit = membership.role === 'partner' && !!task.party_id && (membership.scopes?.parties || []).includes(task.party_id) && !['accepted', 'waived'].includes(task.status);
  const latest = subs?.[0];
  return (
    <div className="max-w-3xl">
      <div className="small"><Link href={`/app/${slug}/shared`}>{tp('back')}</Link></div>
      <div className="flex items-baseline gap-3 flex-wrap mt-1"><h1>{r.code ? <span className="muted">{r.code} </span> : null}{r.title}</h1><span className={`pill ${STATE_PILL[state]}`}>{t(`state.${state}`)}</span></div>
      <p className="muted small mt-1">{(task.esg_programmes as unknown as { name: string }).name} · {po ? `PO ${po}` : task.period_label} · <b>{r.trigger === 'expiry' ? t('expiresOn', { date: task.due_date }) : t('dueOn', { date: task.due_date })}</b></p>
      {q.error && <div className="notice crit mt-3">{q.error}</div>}
      {q.saved && <div className="notice ok mt-3">{t('done_submitted')}</div>}
      {task.status === 'returned' && task.review_note && <div className="notice warn mt-3"><b>{t('returnedBy', { name: task.reviewed_by_name || '' })}</b> {task.review_note}</div>}
      <div className="card mt-4"><h2>{t('whatNeeded')}</h2><p className="mt-2" style={{ color: 'var(--fg2)' }}>{r.instruction || r.title}</p>
        {r.evidence && <p className="small mt-2"><span className="muted">{t('evidence')}:</span> {r.evidence}</p>}
        {(r.target != null || r.target_note) && <p className="small mt-1"><span className="muted">{t('target')}:</span> {r.target ?? ''}{r.unit ? ` ${r.unit}` : ''} {r.target_note || ''}</p>}
      </div>
      {canSubmit && <form action={partnerSubmit} className="card mt-4">
        <h2>{latest ? t('submitNew') : t('submit')}</h2>
        <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
        {r.measure === 'number' && <label className="f mt-3"><span>{t('value')}{r.unit ? ` (${r.unit})` : ''}</span><input className="input" name="value_num" inputMode="decimal" required /></label>}
        <label className="f mt-3"><span>{r.measure === 'text' ? t('narrative') : t('comment')}</span><textarea className="input" name="value_text" rows={r.measure === 'text' ? 5 : 2} maxLength={4000} /></label>
        {(r.trigger === 'expiry' || r.measure === 'evidence') && <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}><label className="f"><span>{t('validFrom')}</span><input className="input" type="date" name="valid_from" /></label><label className="f"><span>{t('validUntil')}</span><input className="input" type="date" name="valid_until" required={r.trigger === 'expiry'} /></label></div>}
        <label className="f"><span>{t('howMeasured')}</span><input className="input" name="note" maxLength={2000} /></label>
        <label className="f"><span>{t('evidenceFiles')}</span><input className="input" type="file" name="evidence" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv,.doc,.docx" /></label>
        <p className="muted small mb-3">{tp('submitNote', { company: tenant.name })}</p>
        <button className="btn primary">{t('submitBtn')}</button>
      </form>}
      <div className="card mt-4"><h2>{t('history')}</h2>
        {!subs?.length && <p className="muted small mt-2">{t('noSubmissions')}</p>}
        {(subs || []).map((s) => <div key={s.id} className="small mt-2 pt-2" style={{ borderTop: '1px solid var(--line2)' }}>
          <span className="pill">v{s.version}</span> <b>{s.value_num != null ? `${Number(s.value_num).toLocaleString('en-GB')}${r.unit ? ` ${r.unit}` : ''}` : ''}</b> <span className="muted">{s.submitted_by_name} · {new Date(s.created_at).toLocaleDateString('en-GB')}</span>{s.valid_until && <span className="pill ml-1">{t('validRange', { from: s.valid_from || '…', to: s.valid_until })}</span>}
          {s.value_text && <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{s.value_text}</div>}
          {!!(s.evidence as Evidence[]).length && <div className="flex gap-1 flex-wrap mt-1">{(s.evidence as Evidence[]).map((e) => <a key={e.path} className="pill" target="_blank" href={`/api/esg/evidence?tenant=${slug}&path=${encodeURIComponent(e.path)}`}>{e.name}</a>)}</div>}
        </div>)}
      </div>
    </div>
  );
}
