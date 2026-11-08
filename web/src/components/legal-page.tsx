import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';

// Shared frame for /privacy and /terms. The legal text is English and governs; the frame and the
// notice saying so are translated. Keep every statement in step with what the code does.
export type LegalSection = { h: string; p: (string | string[])[] };

export async function LegalPage({ kind, updated, sections }: { kind: 'privacy' | 'terms'; updated: string; sections: LegalSection[] }) {
  const t = await getTranslations('legal');
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto">
        <Link href="/" className="flex items-center gap-3 no-underline" style={{ color: 'inherit' }}><Logo merch h={48} /></Link>
        <div className="flex items-center gap-3"><LangSwitch /><Link className="btn sm" href="/login">{t('signIn')}</Link></div>
      </header>
      <article className="max-w-3xl mx-auto px-6 pb-16">
        <h1 className="mt-3" style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{t(`${kind}Title`)}</h1>
        <p className="muted small mt-3">{t('updated', { date: updated })}</p>
        <p className="notice mt-4" lang="en">{t('englishGoverns')}</p>
        <div className="grid gap-6 mt-8" lang="en">
          {sections.map((s) => (
            <section key={s.h} className="card">
              <h2 style={{ fontSize: 17 }}>{s.h}</h2>
              {s.p.map((x, i) => Array.isArray(x)
                ? <ul key={i} className="mt-2 pl-5 grid gap-1" style={{ listStyle: 'disc', color: 'var(--fg2)', maxWidth: '68ch' }}>{x.map((li) => <li key={li}>{li}</li>)}</ul>
                : <p key={i} className="mt-2" style={{ color: 'var(--fg2)', maxWidth: '68ch' }}>{x}</p>)}
            </section>
          ))}
        </div>
        <p className="muted small mt-10">{t('contact')} <a href="mailto:contact@getvia.xyz">contact@getvia.xyz</a></p>
      </article>
      <footer className="max-w-3xl mx-auto px-6 py-8 muted small">© VIA Labs Pte Ltd · getvia.xyz · <Link href="/trust">{t('trustLink')}</Link> · <Link href="/privacy">{t('privacyLink')}</Link> · <Link href="/terms">{t('termsLink')}</Link></footer>
    </main>
  );
}
