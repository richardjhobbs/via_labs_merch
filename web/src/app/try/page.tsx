// The tester programme's front door (docs/testers.md). Reached by the link the founder sends; the link's
// k parameter is the programme's access word. A tester who is already signed in goes straight on.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';
import { currentUser } from '@/lib/supabase/server';
import { getProgram, testerOf } from '@/lib/testers';
import { TryForm } from './try-form';

export const metadata = { title: 'Try VIA Merch', robots: { index: false } };

export default async function Try({ searchParams }: { searchParams: Promise<{ k?: string; ref?: string }> }) {
  const { k = '', ref = '' } = await searchParams;
  const [user, program, t, locale] = await Promise.all([currentUser(), getProgram(), getTranslations('try'), getLocale()]);
  if (user && (await testerOf(user.id))) redirect('/try/start');
  const open = program.open && (!program.code || k === program.code);
  const L = {
    name: t('name'), email: t('email'), company: t('company'), trade: t('trade'), join: t('join'), code: t('code'), verify: t('verify'), resend: t('resend'), sentTo: t.raw('sentTo') as string,
    errForm: t('errForm'), errClosed: t('errClosed'), errCode: t('errCode'), errFull: t('errFull'), errFailed: t('errFailed'), errOtp: t('errOtp'), consent: t('consent'),
    trades: { brand: t('trades.brand'), buying_office: t('trades.buying_office'), factory: t('trades.factory'), trading: t('trades.trading'), other: t('trades.other') },
  };
  return (
    <main className="min-h-screen p-6" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto grid gap-6 md:grid-cols-[minmax(0,1fr)_400px] items-start" style={{ maxWidth: 940 }}>
        <div>
          <div className="flex items-center justify-between gap-3 mb-6"><Logo merch h={48} /><LangSwitch compact /></div>
          <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>{t('title')}</h1>
          <p className="mt-3" style={{ fontSize: 16, maxWidth: '56ch' }}>{t('lead')}</p>
          <ul className="mt-4 grid gap-2" style={{ maxWidth: '60ch' }}>
            {(['p1', 'p2', 'p3', 'p4'] as const).map((p) => <li key={p} className="flex gap-2"><span aria-hidden style={{ color: 'var(--accent)' }}>✓</span><span>{t(p)}</span></li>)}
          </ul>
          <p className="muted small mt-5">{t('legal')} <Link href="/privacy">{t('privacy')}</Link></p>
        </div>
        <div className="card">
          {open ? <TryForm k={k} refTag={ref.slice(0, 40)} locale={locale} signedInEmail={user?.email || null} labels={L} />
            : <><h2>{t('closedTitle')}</h2><p className="muted mt-2">{t('closedBody')}</p><Link className="btn mt-4" href="/login?next=/try/start">{t('haveAccess')}</Link></>}
        </div>
      </div>
    </main>
  );
}
