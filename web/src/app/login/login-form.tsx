'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sb = supabaseBrowser();

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    // shouldCreateUser:false keeps sign-in invite-only; invites create the user first
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) { setErr(/signups not allowed|not found|user not/i.test(error.message) ? t('noAccount') : error.message); return; }
    setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) { setErr(t('error')); return; }
    router.replace(next.startsWith('/') ? next : '/app'); router.refresh();
  }

  if (!sent) return (
    <form onSubmit={send}>
      <label className="f"><span>{t('email')}</span><input className="input" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {err && <div className="notice crit mb-3">{err}</div>}
      <button className="btn primary w-full justify-center" disabled={busy}>{t('send')}</button>
    </form>
  );
  return (
    <form onSubmit={verify}>
      <div className="notice mb-3">{t('sentTo', { email })}</div>
      <label className="f"><span>{t('code')}</span><input className="input mono" inputMode="numeric" pattern="[0-9]{6,10}" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} style={{ fontSize: 20, letterSpacing: '.3em' }} /></label>
      {err && <div className="notice crit mb-3">{err}</div>}
      <button className="btn primary w-full justify-center" disabled={busy}>{t('verify')}</button>
      <button type="button" className="btn w-full justify-center mt-2" onClick={() => { setSent(false); setCode(''); }}>{t('resend')}</button>
    </form>
  );
}
