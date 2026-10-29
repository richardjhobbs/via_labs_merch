import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { ImportForm } from './import-form';

export default async function ImportPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  await requireTenant(slug);
  const t = await getTranslations('orders');
  return (
    <div className="max-w-3xl">
      <Link href={`/app/${slug}/orders`} className="small">← {t('title')}</Link>
      <h1 className="mt-2">{t('import')}</h1>
      <p className="muted mt-1">{t('importIntro')}</p>
      <div className="card mt-4"><ImportForm tenant={slug} /></div>
      <div className="card mt-4 small">
        <h3>{t('importColumns')}</h3>
        <p className="mt-2"><b>PO, Customer, Factory, Style, Description, Qty, FOB, ETD</b> {t('importRequired')}</p>
        <p className="mt-1 muted">{t('importOptional')}: Mill, Fibre, Category, Composition, Currency, Incoterm, POL, POD, In-store, Season, Factory country. {t('importMilestones')}: Fabric in, Lab dip, Fit, PP sample, Cut, Inline QC, Final QC, Ex-factory, ETA.</p>
        <p className="mt-2"><a className="btn sm" href={`/api/export/orders?tenant=${slug}&fmt=template`}>{t('template')}</a></p>
      </div>
    </div>
  );
}
