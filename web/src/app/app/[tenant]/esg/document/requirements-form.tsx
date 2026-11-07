'use client';
// Upload, then a review of what was read: the programme, and each requirement with a keep box. Nothing is
// saved until the person presses Save.
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { readRequirements, saveRequirements, type ReadReqState } from '../actions';
import { DISCIPLINES, FREQUENCIES, MEASURES, OWNER_ROLES, PROGRAMME_KINDS } from '@/lib/esg-shared';

type Party = { id: string; name: string; kind: string };
type Draft = NonNullable<ReadReqState['draft']>;
const SUPPLIER = ['factory', 'mill', 'fibre', 'forwarder', 'carrier', 'lab', 'auditor', 'other'];

function Review({ tenant, draft, parties, onReset }: { tenant: string; draft: Draft; parties: Party[]; onReset: () => void }) {
  const t = useTranslations('esg'), tr = useTranslations('roles');
  const [state, action, pending] = useActionState<ReadReqState, FormData>(saveRequirements, {});
  const [keep, setKeep] = useState(() => draft.doc.requirements.map(() => true));
  const p = draft.doc.programme;
  const suppliers = parties.filter((x) => SUPPLIER.includes(x.kind));
  const inp = (name: string, label: string, value: string | number | null, max = 200, extra: Record<string, unknown> = {}) => <label className="f"><span>{label}</span><input className="input" name={name} maxLength={max} defaultValue={value ?? ''} {...extra} /></label>;
  return (
    <form action={action}>
      <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="file_name" value={draft.file} /><input type="hidden" name="count" value={draft.doc.requirements.length} />
      <p className="notice">{t('reviewNote', { file: draft.file, n: draft.doc.requirements.length })}</p>
      <div className="card mt-4">
        <h2>{t('programme')}</h2>
        <div className="grid gap-3 mt-3 md:grid-cols-3">
          {inp('p_name', t('name'), p.name || draft.file.replace(/\.[^.]+$/, ''), 160, { required: true, minLength: 3 })}
          <label className="f"><span>{t('kind')}</span><select className="input" name="p_kind" defaultValue={p.kind}>{PROGRAMME_KINDS.map((k) => <option key={k} value={k}>{t(`pkind.${k}`)}</option>)}</select></label>
          <label className="f"><span>{t('issuer')}</span><select className="input" name="p_issuer_party_id" defaultValue={draft.issuerMatch || ''}><option value="">{t('notOnFile')}</option>{parties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          {inp('p_issuer_name', t('issuerName'), p.issuer, 160)}
          {inp('p_chain', t('chain'), p.chain, 200)}
          {inp('p_framework', t('framework'), p.framework, 240)}
          {inp('p_reference', t('reference'), p.reference, 80)}
          {inp('p_starts_on', t('starts'), p.starts_on, 10, { type: 'date' })}
          {inp('p_ends_on', t('ends'), p.ends_on, 10, { type: 'date' })}
        </div>
        {inp('p_purpose', t('purpose'), p.purpose, 400)}
      </div>
      <h2 className="mt-5 mb-2">{t('requirements')} <span className="muted">({keep.filter(Boolean).length}/{keep.length})</span></h2>
      <div className="grid gap-3">
        {draft.doc.requirements.map((r, i) => { const n = (f: string) => `r${i}_${f}`; return (
          <div key={i} className="card" style={{ opacity: keep[i] ? 1 : 0.55 }}>
            <label className="flex items-center gap-2 small"><input type="checkbox" name={n('use')} checked={keep[i]} onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))} />{t('keep')}</label>
            {keep[i] && <>
              <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: '100px 1fr' }}>{inp(n('code'), t('code'), r.code, 40)}{inp(n('title'), t('reqTitle'), r.title, 200, { required: true, minLength: 3 })}</div>
              <label className="f"><span>{t('instruction')}</span><textarea className="input" name={n('instruction')} rows={2} maxLength={2000} defaultValue={r.instruction} /></label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <label className="f"><span>{t('discipline')}</span><select className="input" name={n('discipline')} defaultValue={r.discipline}>{DISCIPLINES.map((d) => <option key={d} value={d}>{t(`disc.${d}`)}</option>)}</select></label>
                <label className="f"><span>{t('measure')}</span><select className="input" name={n('measure')} defaultValue={r.measure}>{MEASURES.map((m) => <option key={m} value={m}>{t(`meas.${m}`)}</option>)}</select></label>
                {inp(n('unit'), t('unit'), r.unit, 24)}
                {inp(n('target'), t('target'), r.target, 24, { inputMode: 'decimal' })}
                {inp(n('baseline'), t('baseline'), r.baseline, 24, { inputMode: 'decimal' })}
                <label className="f"><span>{t('frequency')}</span><select className="input" name={n('frequency')} defaultValue={r.frequency}>{FREQUENCIES.map((f) => <option key={f} value={f}>{t(`freq.${f}`)}</option>)}</select></label>
                {inp(n('first_period_end'), t('firstPeriodEnd'), r.first_period_end, 10, { type: 'date', required: true })}
                {inp(n('due_days'), t('dueDays'), r.due_days ?? 30, 3, { type: 'number', min: 0, max: 180 })}
                {inp(n('lead_days'), t('leadDays'), 21, 3, { type: 'number', min: 1, max: 120 })}
                <label className="f"><span>{t('ownerRole')}</span><select className="input" name={n('owner_role')} defaultValue={r.owner_role}>{OWNER_ROLES.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</select></label>
                <label className="f"><span>{t('supplier')}</span><select className="input" name={n('supplier_party_id')} defaultValue={draft.supplierMatches[i] || ''}><option value="">{r.supplier ? t('supplierNotOnFile', { name: r.supplier }) : t('noSupplier')}</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              </div>
              <div className="grid gap-2 md:grid-cols-2">{inp(n('target_note'), t('targetNote'), r.target_note, 240)}{inp(n('evidence'), t('evidence'), r.evidence, 400)}</div>
            </>}
            {!keep[i] && <div className="small mt-1">{r.code ? `${r.code} ` : ''}{r.title}</div>}
          </div>); })}
      </div>
      {state.error && <div className="notice crit mt-3">{state.error}</div>}
      <div className="flex gap-2 mt-3"><button className="btn primary" disabled={pending}>{pending ? t('saving') : t('saveProgramme')}</button><button type="button" className="btn" onClick={onReset}>{t('another')}</button></div>
    </form>
  );
}

export function RequirementsForm({ tenant, parties }: { tenant: string; parties: Party[] }) {
  const t = useTranslations('esg');
  const [state, action, pending] = useActionState<ReadReqState, FormData>(readRequirements, {});
  const [dismissed, setDismissed] = useState<Draft | null>(null);
  if (state.draft && state.draft !== dismissed) return <Review key={state.draft.file} tenant={tenant} draft={state.draft} parties={parties} onReset={() => setDismissed(state.draft!)} />;
  return (
    <form action={action} className="card" style={{ maxWidth: 560 }}>
      <input type="hidden" name="tenant" value={tenant} />
      <label className="f"><span>{t('file')}</span><input className="input" type="file" name="file" accept=".xls,.xlsx,.xlsm,.csv,.pdf,.png,.jpg,.jpeg,.webp" required /></label>
      <p className="muted small mb-3">{t('fileHelp')}</p>
      {state.error && <div className="notice crit mb-3">{state.error}</div>}
      <button className="btn primary" disabled={pending}>{pending ? t('reading') : t('read')}</button>
    </form>
  );
}
