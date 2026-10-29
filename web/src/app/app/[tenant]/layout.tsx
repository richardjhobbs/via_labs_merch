import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { LangSwitch } from '@/components/lang-switch';
import { Rail } from './rail';

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership, isAdmin } = await requireTenant(slug);
  const t = await getTranslations();
  const items = [
    ['', t('nav.day')], ['orders', t('nav.orders')], ['parties', t('nav.parties')], ['queue', t('nav.queue')],
    ['ledger', t('nav.ledger')], ['agents', t('nav.agents')], ['connections', t('nav.connections')], ['settings', t('nav.settings')],
  ] as [string, string][];
  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: '220px minmax(0,1fr)' }}>
      <aside className="rail flex flex-col p-3 gap-1" style={{ borderRight: '1px solid var(--line)', background: '#fff' }}>
        <div className="flex items-center gap-2 px-2 py-2 mb-2"><Logo h={20} sub="Merch" /></div>
        <div className="px-2 pb-2"><b className="small">{tenant.name}</b><div className="muted small">{tenant.kind.replace('_', ' ')}</div></div>
        <Rail base={`/app/${slug}`} items={items} />
        <div className="mt-auto px-2 pt-3 small" style={{ borderTop: '1px solid var(--line2)' }}>
          <div><b>{membership.display_name || 'You'}</b> <span className="muted">· {t(`roles.${membership.role}`)}</span></div>
          {isAdmin && <Link href="/admin" className="block mt-1">{t('nav.admin')}</Link>}
          <div className="flex items-center gap-2 mt-2"><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
        </div>
      </aside>
      <main className="p-6" style={{ background: 'var(--paper)' }}>{children}</main>
    </div>
  );
}
