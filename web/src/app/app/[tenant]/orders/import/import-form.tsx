'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { importOrders } from '../actions';

export function ImportForm({ tenant }: { tenant: string }) {
  const t = useTranslations('orders');
  const [state, action, pending] = useActionState(importOrders, { ok: false, message: '' });
  return (
    <form action={action}>
      <input type="hidden" name="tenant" value={tenant} />
      <label className="f"><span>{t('file')}</span><input className="input" type="file" name="file" accept=".xlsx,.xls,.csv" required /></label>
      {state.message && <div className={`notice ${state.ok ? '' : 'crit'} mb-3`}>{state.message}</div>}
      <button className="btn primary" disabled={pending}>{pending ? t('importing') : t('importBtn')}</button>
    </form>
  );
}
