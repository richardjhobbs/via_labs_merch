import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { DocumentForm } from './document-form';

export default async function AddFromDocument({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (membership.role === 'viewer') redirect(`/app/${slug}/parties`);
  const t = await getTranslations('parties');
  const sb = await supabaseServer();
  const { data: existing } = await sb.from('parties').select('id, name').eq('tenant_id', tenant.id).order('name');
  return (
    <div className="max-w-4xl">
      <Link href={`/app/${slug}/parties`} className="small">← {t('title')}</Link>
      <h1 className="mt-2">{t('doc.title')}</h1>
      <p className="muted mt-1 mb-4" style={{ maxWidth: '70ch' }}>{t('doc.intro')}</p>
      <DocumentForm tenant={slug} existing={existing || []} />
    </div>
  );
}
