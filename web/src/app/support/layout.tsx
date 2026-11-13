import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';
import { requireMe } from '@/lib/tenant';

// The support desk: its own frame, outside the workspace. Any signed-in member reaches it, partners included.
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMe();
  const t = await getTranslations();
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-6 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <Link href="/support" className="flex items-center gap-2 no-underline" style={{ color: 'inherit' }}><Logo merch h={36} sub={t('help.title')} /></Link>
        <div className="ml-auto flex items-center gap-3 small"><span className="muted hidden sm:inline">{m.user.email}</span><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
      </header>
      <main className="p-4 md:p-6 mx-auto min-w-0" style={{ maxWidth: 760 }}>{children}</main>
    </div>
  );
}
