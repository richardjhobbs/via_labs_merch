// Compliance tasks for one PO or one supplier, shown on its page when the company has the add-on.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { esgEnabled, esgSnapshot, STATE_PILL } from '@/lib/esg';

export async function ComplianceCard({ slug, tenantId, orderId, partyId }: { slug: string; tenantId: string; orderId?: string; partyId?: string }) {
  const sb = await supabaseServer();
  const [{ data: tn }, tasks, t] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenantId).single(),
    esgSnapshot(tenantId, sb, { orderId, partyId, all: true }),
    getTranslations('esg'),
  ]);
  if (!esgEnabled(tn?.settings) || !tasks.length) return null;
  const open = tasks.filter((x) => !['done', 'waived'].includes(x.state));
  return (
    <div className="card small">
      <div className="flex items-baseline gap-2"><h3>{t('title')}</h3><span className="muted ml-auto">{t('nOpen', { n: open.length })}</span></div>
      <div className="mt-2 grid gap-1">{tasks.slice(0, 12).map((x) => (
        <Link key={x.id} href={`/app/${slug}/esg/task/${x.id}`} className="no-underline" style={{ color: 'inherit', borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
          <span className={`pill ${STATE_PILL[x.state]}`}>{t(`state.${x.state}`)}</span> <b>{x.title}</b>
          <div className="muted">{x.programme} · {x.trigger === 'expiry' ? t('expiresOn', { date: x.due }) : t('dueOn', { date: x.due })}{partyId && x.po ? ` · PO ${x.po}` : ''}</div>
        </Link>))}</div>
    </div>
  );
}
