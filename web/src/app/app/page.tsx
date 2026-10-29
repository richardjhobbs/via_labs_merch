// Entry after sign-in: one tenant → straight in; several → pick; none → explain.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireMe } from '@/lib/tenant';

export default async function AppHome() {
  const m = await requireMe();
  if (m.memberships.length === 1 && !m.isAdmin) redirect(`/app/${m.memberships[0].tenants.slug}`);
  const t = await getTranslations();
  return (
    <main className="min-h-screen p-6" style={{ background: 'var(--paper)' }}>
      <div className="max-w-xl mx-auto">
        <h1>VIA Merch</h1>
        {m.memberships.length === 0 && !m.isAdmin && <div className="notice warn mt-4">{t('login.noAccount')}</div>}
        <div className="grid gap-3 mt-4">
          {m.memberships.map((x) => (
            <Link key={x.id} className="card flex items-center justify-between" href={`/app/${x.tenants.slug}`}>
              <div><b>{x.tenants.name}</b><div className="muted small">{x.tenants.kind.replace('_', ' ')} · {t(`roles.${x.role}`)}</div></div><span>→</span>
            </Link>
          ))}
          {m.isAdmin && <Link className="card flex items-center justify-between" href="/admin"><div><b>{t('admin.title')}</b><div className="muted small">{t('admin.tenants')}, {t('admin.requests').toLowerCase()}</div></div><span>→</span></Link>}
        </div>
        <form action="/auth/signout" method="post" className="mt-6"><button className="btn sm">{t('nav.signout')}</button></form>
      </div>
    </main>
  );
}
