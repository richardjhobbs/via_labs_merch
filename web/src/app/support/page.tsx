// Entry to the support desk: one company goes straight in; several, pick one. VIA Labs staff use the console.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireMe } from '@/lib/tenant';

export default async function SupportHome({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const m = await requireMe();
  const { from } = await searchParams;
  const q = from ? `?from=${encodeURIComponent(from)}` : '';
  if (m.memberships.length === 1) redirect(`/support/${m.memberships[0].tenants.slug}${q}`);
  if (!m.memberships.length && m.isAdmin) redirect('/admin/support');
  const t = await getTranslations();
  return (
    <div>
      <h1>{t('help.pick')}</h1>
      {!m.memberships.length && <div className="notice warn mt-4">{t('login.noAccount')}</div>}
      <div className="grid gap-3 mt-4">
        {m.memberships.map((x) => (
          <Link key={x.id} className="card flex items-center justify-between" href={`/support/${x.tenants.slug}${q}`}>
            <div><b>{x.tenants.name}</b><div className="muted small">{t(`roles.${x.role}`)}</div></div><span>→</span>
          </Link>
        ))}
        {m.isAdmin && <Link className="card flex items-center justify-between" href="/admin/support"><b>{t('admin.supportDesk')}</b><span>→</span></Link>}
      </div>
    </div>
  );
}
