'use client';
// Joining as a tester: a few details, then the usual emailed sign-in code. No password, no account to set up.
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { joinTesters } from './actions';

type L = Record<'name' | 'email' | 'company' | 'trade' | 'join' | 'code' | 'verify' | 'resend' | 'sentTo' | 'errForm' | 'errClosed' | 'errCode' | 'errFull' | 'errFailed' | 'errOtp' | 'consent', string> & { trades: Record<string, string> };

export function TryForm({ k, refTag, locale, signedInEmail, labels: t }: { k: string; refTag: string; locale: string; signedInEmail: string | null; labels: L }) {
  const [email, setEmail] = useState(signedInEmail || '');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sb = supabaseBrowser();
  const ERR: Record<string, string> = { form: t.errForm, closed: t.errClosed, code: t.errCode, full: t.errFull, failed: t.errFailed };

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await joinTesters(new FormData(e.currentTarget));
    if (!r.ok) { setBusy(false); setErr(ERR[r.error] || t.errFailed); return; }
    if (r.signedIn) { window.location.assign('/try/start'); return; }
    const { error } = await sb.auth.signInWithOtp({ email: r.email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setErr(t.errFailed); return; }
    setEmail(r.email); setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, token: code.trim(), next: '/try/start' }) });
    const j = await r.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok || !j.ok) { setErr(t.errOtp); return; }
    window.location.assign(j.next || '/try/start');
  }

  if (sent) return (
    <form onSubmit={verify}>
      <div className="notice mb-3">{t.sentTo.replace('{email}', email)}</div>
      <label className="f"><span>{t.code}</span><input className="input mono" inputMode="numeric" pattern="[0-9]{6,10}" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} style={{ fontSize: 20, letterSpacing: '.3em' }} /></label>
      {err && <div className="notice crit mb-3">{err}</div>}
      <button className="btn primary w-full justify-center" disabled={busy}>{t.verify}</button>
      <button type="button" className="btn w-full justify-center mt-2" disabled={busy} onClick={async () => { setErr(''); await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); }}>{t.resend}</button>
    </form>
  );
  return (
    <form onSubmit={join}>
      <input type="hidden" name="k" value={k} /><input type="hidden" name="ref" value={refTag} /><input type="hidden" name="locale" value={locale} />
      <label className="f"><span>{t.name}</span><input className="input" name="name" required minLength={2} maxLength={80} autoFocus autoComplete="name" /></label>
      <label className="f"><span>{t.email}</span><input className="input" name="email" type="email" required autoComplete="email" defaultValue={signedInEmail || ''} readOnly={!!signedInEmail} /></label>
      <label className="f"><span>{t.company}</span><input className="input" name="company" maxLength={120} autoComplete="organization" /></label>
      <label className="f"><span>{t.trade}</span><select className="input" name="trade" defaultValue="brand">{Object.entries(t.trades).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {err && <div className="notice crit mb-3">{err}</div>}
      <button className="btn primary w-full justify-center" disabled={busy}>{t.join}</button>
      <p className="muted small mt-3">{t.consent}</p>
    </form>
  );
}
