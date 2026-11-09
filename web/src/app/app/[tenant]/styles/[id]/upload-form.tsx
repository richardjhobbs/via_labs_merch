'use client';
// Tech pack or brief in: the file goes straight from the browser to the private bucket by signed link, then
// the server reads it and opens the review. A Google Drive pick posts the file id and is read server side.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DrivePicker } from '@/components/drive-picker';
import { prepareUpload, readUploaded, readFromDrive } from '../actions';

const KINDS = ['auto', 'tech_pack', 'brief', 'spec', 'bom', 'photo', 'reference', 'other'] as const;

export function UploadForm({ tenant, styleId, live }: { tenant: string; styleId: string; live: boolean }) {
  const t = useTranslations('styles');
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'uploading' | 'reading'>('idle');
  const [error, setError] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('auto');
  const fileRef = useRef<HTMLInputElement>(null);
  const driveForm = useRef<HTMLFormElement>(null);
  const [driveId, setDriveId] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { setError(t('noFile')); return; }
    setError(''); setState('uploading');
    try {
      const link = await prepareUpload(tenant, styleId, f.name, f.size);
      if (!link.ok) { setError(link.error); setState('idle'); return; }
      const put = await fetch(link.url, { method: 'PUT', headers: { 'content-type': f.type || 'application/octet-stream', 'x-upsert': 'true' }, body: f });
      if (!put.ok) { setError(t('uploadFailed', { status: String(put.status) })); setState('idle'); return; }
      setState('reading');
      const r = await readUploaded(tenant, styleId, link.path, f.name, f.type, kind);
      if (!r.ok) { setError(r.error); setState('idle'); return; }
      router.push(`/app/${tenant}/styles/${styleId}/records/${r.recordId}`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setState('idle'); }
  }
  return (
    <div className="card">
      <h2>{t('addRecord')}</h2>
      <p className="muted small mt-1">{live ? t('addRecordNote') : t('addRecordNoAgent')}</p>
      <form onSubmit={send} className="grid gap-2 mt-3">
        <div className="flex gap-2 flex-wrap items-end">
          <label className="f" style={{ margin: 0, flex: '1 1 240px' }}><span>{t('file')}</span><input ref={fileRef} type="file" className="input" accept=".pdf,.xlsx,.xls,.xlsm,.csv,.png,.jpg,.jpeg,.webp" disabled={state !== 'idle'} /></label>
          <label className="f" style={{ margin: 0 }}><span>{t('recordKind')}</span><select className="input" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])} disabled={state !== 'idle'}>{KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></label>
          <button className="btn primary" disabled={state !== 'idle'}>{state === 'uploading' ? t('uploading') : state === 'reading' ? t('reading') : t('readIt')}</button>
        </div>
        <div className="muted small">{t('fileNote')}</div>
      </form>
      <form ref={driveForm} action={readFromDrive} className="mt-2 flex gap-2 items-center flex-wrap">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="style" value={styleId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="drive_file_id" value={driveId} />
        <DrivePicker tenant={tenant} kind="doc" disabled={state !== 'idle'} onPick={(f) => { setDriveId(f.id); setTimeout(() => driveForm.current?.requestSubmit(), 0); }} />
      </form>
      {error && <div className="notice crit small mt-2">{error}</div>}
    </div>
  );
}
