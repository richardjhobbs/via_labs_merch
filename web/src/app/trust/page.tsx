import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';

// Public confidentiality statement. Every claim here is enforced in code or policy; keep the two in step
// (supabase/migrations/0006_support_access.sql, src/lib/tenant.ts, src/lib/support.ts).
export default async function Trust() {
  const t = await getTranslations('trust');
  const sections = ['isolation', 'staff', 'support', 'agents', 'partners', 'models', 'infra', 'signin', 'yours'] as const;
  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto">
        <Link href="/" className="flex items-center gap-3 no-underline" style={{ color: 'inherit' }}><Logo merch h={48} /></Link>
        <div className="flex items-center gap-3"><LangSwitch /><Link className="btn sm" href="/login">{t('signIn')}</Link></div>
      </header>
      <article className="max-w-3xl mx-auto px-6 pb-16">
        <div className="small font-medium" style={{ color: 'var(--accent)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('kicker')}</div>
        <h1 className="mt-3" style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{t('title')}</h1>
        <p className="mt-4" style={{ fontSize: 17, color: 'var(--fg2)', maxWidth: '62ch' }}>{t('intro')}</p>
        <div className="grid gap-6 mt-10">
          {sections.map((k) => (
            <section key={k} className="card">
              <h2 style={{ fontSize: 17 }}>{t(`${k}.title`)}</h2>
              <p className="mt-2" style={{ color: 'var(--fg2)', maxWidth: '68ch' }}>{t(`${k}.body`)}</p>
            </section>
          ))}
        </div>
        <p className="muted small mt-10">{t('updated')} · {t('contact')} <a href="mailto:richard@getvia.xyz">richard@getvia.xyz</a></p>
      </article>
      <footer className="max-w-3xl mx-auto px-6 py-8 muted small">© VIA Labs Pte Ltd · getvia.xyz</footer>
    </main>
  );
}
