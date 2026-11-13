import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/tenant';
import { LangSwitch } from '@/components/lang-switch';
import { supabaseAdmin } from '@/lib/supabase/server';
import { unseenForVia } from '@/lib/helpdesk/desk';
import { NotifyBell } from '@/components/notify-bell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const m = await requireAdmin();
  const t = await getTranslations();
  // drafts written for the founder's approval show as a count on the Updates link
  const [{ count: drafts }, unseen] = await Promise.all([
    supabaseAdmin().from('announcements').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    unseenForVia(),
  ]);
  const items = unseen.map((x) => ({ href: `/admin/support/${x.id}`, title: `#${x.number} ${x.title}`, sub: `${x.company}${x.who ? ` · ${x.who}` : ''} · ${x.status.replace('_', ' ')} · ${new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` }));
  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-6 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <Link href="/admin" className="flex items-center gap-2 no-underline" style={{ color: 'inherit' }}><Logo h={20} sub={t('admin.title')} /></Link>
        <nav className="flex gap-4 small order-3 w-full sm:order-none sm:w-auto"><Link href="/admin">{t('admin.tenants')}</Link><Link href="/admin/requests">{t('admin.requests')}</Link><Link href="/admin/support">{t('admin.supportDesk')}</Link><Link href="/admin/updates">{t('admin.updates')}{drafts ? ` (${drafts})` : ''}</Link></nav>
        <div className="ml-auto flex items-center gap-3 small"><NotifyBell items={items} label="Support tickets" empty="Nothing new." /><span className="muted hidden sm:inline">{m.user.email}</span><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
      </header>
      <main className="p-4 md:p-6 max-w-5xl mx-auto min-w-0">{children}</main>
    </div>
  );
}
