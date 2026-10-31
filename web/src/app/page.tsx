import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { currentUser } from '@/lib/supabase/server';
import { RequestAccessForm } from './request-access-form';
import { LangSwitch } from '@/components/lang-switch';
import { BrandIcon } from '@/components/brand-icon';
import { CONNECTORS } from '@/lib/connectors/catalog';

export default async function Landing() {
  const t = await getTranslations();
  const user = await currentUser();
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
        <div className="small font-medium muted" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.video.title')}</div>
        <video
          className="mt-3 w-full"
          style={{ display: 'block', borderRadius: 12, border: '1px solid var(--line)', background: '#0a4a3a', aspectRatio: '16 / 9' }}
          controls
          playsInline
          preload="metadata"
          poster="/video/via-merch-intro.jpg"
          src="/video/via-merch-intro.mp4"
        />
        <p className="muted small mt-2">{t('landing.video.note')}</p>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-10">
        <div className="small font-medium muted" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.worksWith')}</div>
        <div className="flex flex-wrap gap-2 mt-3">
          {CONNECTORS.filter((c) => c.logo).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 pr-3" style={{ border: '1px solid var(--line)', borderRadius: 999, background: '#fff', padding: 3 }}><BrandIcon name={c.name} logo={c.logo} size={24} /><span className="small">{c.name}</span></span>
          ))}
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="small font-medium muted" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('landing.trust.kicker')}</div>
        <h2 className="mt-2" style={{ fontSize: 22, letterSpacing: '-0.01em' }}>{t('landing.trust.title')}</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {(['p1', 'p2', 'p3'] as const).map((k) => <li key={k} className="card small" style={{ color: 'var(--fg2)' }}>{t(`landing.trust.${k}`)}</li>)}
        </ul>
        <Link href="/trust" className="btn sm mt-4">{t('landing.trust.link')}</Link>
      </section>
      <footer className="max-w-5xl mx-auto px-6 py-8 muted small">© VIA Labs Pte Ltd · getvia.xyz · <Link href="/trust">{t('landing.trust.footer')}</Link></footer>
    </main>
  );
}
