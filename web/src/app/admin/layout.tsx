import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/tenant';
import { LangSwitch } from '@/components/lang-switch';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const m = await requireAdmin();
  const t = await getTranslations();
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center gap-4 px-6 py-3" style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <Link href="/admin" className="flex items-center gap-2 no-underline" style={{ color: 'inherit' }}><Logo h={20} sub={t('admin.title')} /></Link>
        <nav className="flex gap-3 small"><Link href="/admin">{t('admin.tenants')}</Link><Link href="/admin/requests">{t('admin.requests')}</Link></nav>
        <div className="ml-auto flex items-center gap-3 small"><span className="muted">{m.user.email}</span><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
      </header>
      <main className="p-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
