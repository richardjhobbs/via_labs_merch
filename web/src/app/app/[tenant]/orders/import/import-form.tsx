'use client';
// Order import: a drop area that says what to do (drag a file in, or click to choose), shows the chosen file,
// and enables Import only once there is something to import. A Google Sheet from Drive imports at once.
import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { DrivePicker } from '@/components/drive-picker';
import { useTranslations } from 'next-intl';
import { importOrders, type ImportState } from '../actions';

export function ImportForm({ tenant }: { tenant: string }) {
  const t = useTranslations('orders');
  const [state, action, pending] = useActionState<ImportState, FormData>(importOrders, { ok: false, message: '' });
  const formRef = useRef<HTMLFormElement>(null), fileRef = useRef<HTMLInputElement>(null), driveRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState({ id: '', name: '' });
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [over, setOver] = useState(false);
  const choose = (f: File | null | undefined) => {
    if (!f) return;
    if (fileRef.current && f !== fileRef.current.files?.[0]) { const dt = new DataTransfer(); dt.items.add(f); fileRef.current.files = dt.files; }
    if (driveRef.current) driveRef.current.value = '';
    setPicked({ id: '', name: '' }); setFile({ name: f.name, size: f.size });
  };
  const tone = state.tone || (state.ok ? 'ok' : 'crit');
  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="drive_file_id" ref={driveRef} defaultValue="" />
      <label className={`drop ${over ? 'over' : ''} ${file ? 'has' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0]); }}>
        <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        {file ? <><b>{file.name}</b><span className="muted small">{t('dropChosen', { kb: Math.max(1, Math.round(file.size / 1024)) })}</span></>
          : <><b>{t('dropTitle')}</b><span className="muted small">{t('dropSub')}</span></>}
      </label>
      <div className="flex items-center gap-2 flex-wrap mt-3 mb-3"><span className="small muted">{t('orDrive')}</span>
        <DrivePicker tenant={tenant} kind="sheet" disabled={pending} onPick={(f) => { if (fileRef.current) fileRef.current.value = ''; setFile(null); if (driveRef.current) driveRef.current.value = f.id; setPicked(f); formRef.current?.requestSubmit(); }} />
        {picked.name && <span className="small">{picked.name}</span>}
      </div>
      {state.message && <div className={`notice ${tone === 'ok' ? '' : tone} mb-3`}>{state.message}
        {!!state.existing?.length && <span className="ml-1">{state.existing.map((po, i) => <span key={po}>{i ? ', ' : ''}<Link href={`/app/${tenant}/orders/${encodeURIComponent(po)}`}>PO {po}</Link></span>)}.</span>}
        {' '}<Link href={`/app/${tenant}/orders`}>{t('viewOrders')}</Link></div>}
      <button className="btn primary" disabled={pending || (!file && !picked.id)}>{pending ? t('importing') : t('importBtn')}</button>
    </form>
  );
}
