import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { currentUser } from '@/lib/supabase/server';
import { RequestAccessForm } from './request-access-form';
import { LangSwitch } from '@/components/lang-switch';

export default async function Landing() {
  const t = await getTranslations();
  const user = await currentUser();
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3"><span className="font-semibold tracking-wide" style={{ fontSize: 18 }}>VIA</span><span className="muted small">Merch · {t('app.by')}</span></div>
        <div className="flex items-center gap-3"><LangSwitch /><Link className="btn sm" href={user ? '/app' : '/login'}>{user ? t('nav.day') : t('landing.login')}</Link></div>
      </header>
      <section className="max-w-5xl mx-auto px-6 py-14 grid gap-10 md:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="small font-medium" style={{ color: 'var(--accent)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.kicker')}</div>
          <h1 className="mt-3" style={{ fontSize: 40, lineHeight: 1.08, letterSpacing: '-0.02em', maxWidth: '16ch' }}>{t('app.tagline')}</h1>
          <p className="mt-5" style={{ fontSize: 17, color: 'var(--fg2)', maxWidth: '58ch' }}>{t('landing.lede')}</p>
          <ul className="mt-7 grid gap-3" style={{ maxWidth: '60ch' }}>
            {(['ontop', 'authority', 'ledger', 'a2a'] as const).map((k) => (
              <li key={k} className="flex gap-3"><span style={{ color: 'var(--accent)', fontWeight: 600 }}>→</span><span style={{ color: 'var(--fg2)' }}>{t(`landing.points.${k}`)}</span></li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3 flex-wrap">
            <a className="btn primary" href="#request">{t('landing.cta')}</a>
            <a className="btn" href="https://www.getvia.xyz/merch" target="_blank" rel="noopener">{t('landing.demo')}</a>
          </div>
        </div>
        <div id="request" className="card">
          <h2 style={{ fontSize: 18 }}>{t('landing.request.title')}</h2>
          <p className="muted small mt-1 mb-4">{t('landing.request.intro')}</p>
          <RequestAccessForm />
        </div>
      </section>
      <footer className="max-w-5xl mx-auto px-6 py-8 muted small">© VIA Labs Pte Ltd · getvia.xyz</footer>
    </main>
  );
}
