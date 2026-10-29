'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { requestAccess } from './actions';

const KINDS = ['buying_office', 'brand', 'factory', 'trading', 'retailer'] as const;

export function RequestAccessForm() {
  const t = useTranslations('landing');
  const [state, action, pending] = useActionState(requestAccess, { ok: false, error: '' });
  if (state.ok) return <div className="notice">{t('request.sent')}</div>;
  return (
    <form action={action}>
      <label className="f"><span>{t('request.company')}</span><input className="input" name="company" required maxLength={120} /></label>
      <label className="f"><span>{t('request.kind')}</span><select className="input" name="kind" defaultValue="buying_office">{KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="f"><span>{t('request.name')}</span><input className="input" name="name" required maxLength={80} /></label>
        <label className="f"><span>{t('request.country')}</span><input className="input" name="country" maxLength={60} /></label>
      </div>
      <label className="f"><span>{t('request.email')}</span><input className="input" name="email" type="email" required maxLength={120} /></label>
      <label className="f"><span>{t('request.url')}</span><input className="input" name="url" type="url" inputMode="url" placeholder="https://" maxLength={200} /></label>
      <label className="f"><span>{t('request.message')}</span><textarea className="input" name="message" rows={3} maxLength={1000} /></label>
      <input type="text" name="fax" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden />
      {state.error && <div className="notice crit mb-3">{state.error}</div>}
      <button className="btn primary" disabled={pending}>{t('request.send')}</button>
    </form>
  );
}
