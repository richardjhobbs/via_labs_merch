'use client';
// Read the figure from a file: upload a bill, meter sheet, test report, certificate or licence; the agent reads
// the value and validity dates into the submit form below for the person to check. The file is kept as
// evidence on the next submission. Nothing is submitted until the person presses Submit.
import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { readEvidence, type ReadEvidenceState } from '../../actions';

export function EvidenceReader({ tenant, taskId, formId }: { tenant: string; taskId: string; formId: string }) {
  const t = useTranslations('esg');
  const [state, action, pending] = useActionState<ReadEvidenceState, FormData>(readEvidence, {});
  useEffect(() => {
    const f = state.read && (document.getElementById(formId) as HTMLFormElement | null);
    if (!f || !state.read) return;
    const set = (name: string, v: string | number | null | undefined) => { const el = f.elements.namedItem(name) as HTMLInputElement | null; if (el && v != null && v !== '') el.value = String(v); };
    set('value_num', state.read.value_num); set('value_text', state.read.value_text); set('valid_from', state.read.valid_from); set('valid_until', state.read.valid_until); set('note', state.read.note);
    const pe = f.elements.namedItem('pending_evidence') as HTMLInputElement | null;
    if (pe && state.file) { const list = pe.value ? JSON.parse(pe.value) : []; list.push(state.file); pe.value = JSON.stringify(list); }
  }, [state, formId]);
  return (
    <form action={action} className="card">
      <h2>{t('readTitle')}</h2>
      <p className="muted small mt-1">{t('readHelp')}</p>
      <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="id" value={taskId} />
      <div className="flex gap-2 mt-3 items-center flex-wrap"><input className="input" style={{ maxWidth: 320 }} type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv" required /><button className="btn" disabled={pending}>{pending ? t('reading') : t('readBtn')}</button></div>
      {state.error && <div className="notice crit mt-3 small">{state.error}</div>}
      {state.read && <div className="notice mt-3 small">
        <b>{t('readDone', { file: state.file?.name || '' })}</b>
        {state.read.document_type && <div className="mt-1">{state.read.document_type}{state.read.issuer ? ` · ${state.read.issuer}` : ''}{state.read.period ? ` · ${state.read.period}` : ''}</div>}
        {state.read.concerns && <div className="mt-1" style={{ color: 'var(--warn)' }}>{t('readConcern')}: {state.read.concerns}</div>}
      </div>}
    </form>
  );
}
