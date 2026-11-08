'use client';
import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { DrivePicker } from '@/components/drive-picker';
import { useTranslations } from 'next-intl';
import { importOrders } from '../actions';

export function ImportForm({ tenant }: { tenant: string }) {
  const t = useTranslations('orders');
  const [state, action, pending] = useActionState(importOrders, { ok: false, message: '' });
  const formRef = useRef<HTMLFormElement>(null), fileRef = useRef<HTMLInputElement>(null), driveRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState({ id: '', name: '' });
  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="drive_file_id" ref={driveRef} defaultValue="" />
      <label className="f"><span>{t('file')}</span><input ref={fileRef} className="input" type="file" name="file" accept=".xlsx,.xls,.csv" onChange={() => { if (driveRef.current) driveRef.current.value = ''; setPicked({ id: '', name: '' }); }} /></label>
      <div className="flex items-center gap-2 flex-wrap mb-3"><span className="small muted">{t('orDrive')}</span>
        <DrivePicker tenant={tenant} kind="sheet" disabled={pending} onPick={(f) => { if (fileRef.current) fileRef.current.value = ''; if (driveRef.current) driveRef.current.value = f.id; setPicked(f); formRef.current?.requestSubmit(); }} />
        {picked.name && <span className="small">{picked.name}</span>}
      </div>
      {state.message && <div className={`notice ${state.ok ? '' : 'crit'} mb-3`}>{state.message} <Link href={`/app/${tenant}/orders`}>{t('viewOrders')}</Link></div>}
      <button className="btn primary" disabled={pending}>{pending ? t('importing') : t('importBtn')}</button>
    </form>
  );
}
