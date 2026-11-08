import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_NAMES } from '@/i18n/locales';
import { currentUser } from '@/lib/supabase/server';
import { RequestAccessForm } from './request-access-form';
import { LangSwitch } from '@/components/lang-switch';
import { Switchboard, ConnectorBanner } from '@/components/switchboard';

export default async function Landing() {
  const [t, user, locale] = await Promise.all([getTranslations(), currentUser(), getLocale()]);
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3"><Logo merch h={52} sub={t('app.by')} /></div>
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
        </div>
        <div id="request" className="card">
          <h2 style={{ fontSize: 18 }}>{t('landing.request.title')}</h2>
          <p className="muted small mt-1 mb-4">{t('landing.request.intro')}</p>
          <RequestAccessForm />
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="small font-medium" style={{ color: 'var(--accent)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.agents.kicker')}</div>
        <h2 className="mt-2" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{t('landing.agents.title')}</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {([['l1', 'personal'], ['l2', 'sub'], ['l3', 'top']] as const).map(([l, k], i) => (
            <li key={k} className="card small" style={{ color: 'var(--fg2)', borderColor: i === 0 ? 'var(--accent)' : undefined }}>
              <div className="font-medium" style={{ color: 'var(--accent)', marginBottom: 6 }}>{t(`landing.agents.${l}`)}</div>
              {t(`landing.agents.${k}`)}
            </li>
          ))}
        </ol>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="small font-medium muted" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.video.title')}</div>
        {/* Captions in every locale (public/video/via-merch-intro.<locale>.vtt); the page's language is on by default. Keyed on locale so a language change reloads the tracks. */}
        <video
          key={locale}
          className="mt-3 w-full"
          style={{ display: 'block', borderRadius: 12, border: '1px solid var(--line)', background: '#0a4a3a', aspectRatio: '16 / 9' }}
          controls
          playsInline
          preload="metadata"
          poster="/video/via-merch-intro.jpg"
          src="/video/via-merch-intro.mp4"
        >
          {LOCALES.map((l) => <track key={l} kind="captions" srcLang={l} label={LOCALE_NAMES[l]} src={`/video/via-merch-intro.${l}.vtt`} default={l === locale} />)}
        </video>
        <p className="muted small mt-2">{t('landing.video.note')}</p>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="small font-medium" style={{ color: 'var(--accent)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.worksWith')}</div>
        <h2 className="mt-2" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{t('switchboard.title')}</h2>
        <p className="mt-2 mb-4" style={{ color: 'var(--fg2)', maxWidth: '62ch' }}>{t('switchboard.lede')}</p>
        <Switchboard />
        <ConnectorBanner label={t('landing.worksWith')} />
        <p className="muted small mt-2">{t('switchboard.note')}</p>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="small font-medium muted" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.trust.kicker')}</div>
        <h2 className="mt-2" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{t('landing.trust.title')}</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {(['p1', 'p2', 'p3'] as const).map((k) => <li key={k} className="card small" style={{ color: 'var(--fg2)' }}>{t(`landing.trust.${k}`)}</li>)}
        </ul>
        <Link href="/trust" className="btn sm mt-4">{t('landing.trust.link')}</Link>
      </section>
      <footer className="max-w-5xl mx-auto px-6 py-8 muted small">© VIA Labs Pte Ltd · getvia.xyz · <Link href="/trust">{t('landing.trust.footer')}</Link> · <Link href="/privacy">{t('legal.privacyLink')}</Link> · <Link href="/terms">{t('legal.termsLink')}</Link></footer>
    </main>
  );
}
