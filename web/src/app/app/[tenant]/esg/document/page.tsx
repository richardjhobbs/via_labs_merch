// Read a requirements document (loan schedule, ESAP, sustainability-linked KPIs, a bank questionnaire,
// a customer's code of conduct, a CAP) into a programme and its obligations, checked by a person first.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canLead, esgEnabled } from '@/lib/esg';
import { RequirementsForm } from './requirements-form';

export default async function ReadRequirementsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('esg');
  const sb = await supabaseServer();
  const [{ data: tn }, { data: parties }] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).order('name'),
  ]);
  if (!esgEnabled(tn?.settings) || !canLead(membership.role)) redirect(`/app/${slug}/esg`);
  return (
    <div className="max-w-6xl">
      <div className="small"><Link href={`/app/${slug}/esg`}>{t('title')}</Link></div>
      <h1 className="mt-1">{t('docTitle')}</h1>
      <p className="muted small mt-1 mb-4" style={{ maxWidth: '76ch' }}>{t('docSub')}</p>
      <RequirementsForm tenant={slug} parties={(parties || []).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))} />
    </div>
  );
}
