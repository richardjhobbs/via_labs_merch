import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { createStyle } from '../actions';
import { StyleFields } from '../style-fields';

const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];

export default async function NewStyle({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ error?: string }> }) {
  const { tenant: slug } = await params; const { error } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  if (membership.role === 'viewer') redirect(`/app/${slug}/styles`);
  const t = await getTranslations('styles');
  const sb = await supabaseServer();
  const { data: parties } = await sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).is('archived_at', null).in('kind', CUSTOMER).order('name');
  return (
    <div className="max-w-4xl">
      <Link href={`/app/${slug}/styles`} className="small">← {t('title')}</Link>
      <h1 className="mt-2">{t('new')}</h1>
      <p className="muted mt-1 mb-4" style={{ maxWidth: '70ch' }}>{t('newIntro')}</p>
      {error && <div className="notice crit mb-4">{error}</div>}
      <form action={createStyle} className="card grid gap-4">
        <input type="hidden" name="tenant" value={slug} />
        <StyleFields customers={parties || []} currency={tenant.currency} />
        <div className="flex gap-2"><button className="btn primary">{t('create')}</button><Link className="btn" href={`/app/${slug}/styles`}>{t('cancel')}</Link></div>
      </form>
    </div>
  );
}
