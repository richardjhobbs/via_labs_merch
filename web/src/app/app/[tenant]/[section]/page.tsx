// Placeholder for sections that land in week 2 and 3 (orders, parties, queue, ledger, agents, connections, settings).
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';

const SECTIONS = ['orders', 'parties', 'queue', 'ledger', 'agents', 'connections', 'settings'] as const;

export default async function Section({ params }: { params: Promise<{ tenant: string; section: string }> }) {
  const { tenant: slug, section } = await params;
  if (!(SECTIONS as readonly string[]).includes(section)) notFound();
  await requireTenant(slug);
  const t = await getTranslations('nav');
  return (
    <div className="max-w-5xl">
      <h1>{t(section as (typeof SECTIONS)[number])}</h1>
      <div className="card mt-4 muted">Coming in the next build step.</div>
    </div>
  );
}
