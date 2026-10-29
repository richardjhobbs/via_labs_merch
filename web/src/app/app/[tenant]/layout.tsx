import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { LangSwitch } from '@/components/lang-switch';
import { Rail } from './rail';
import { Assistant } from '@/components/assistant';
import { supabaseServer } from '@/lib/supabase/server';
import { hasLlm } from '@/lib/llm';
import { getLocale } from 'next-intl/server';
import { ViewAs } from '@/components/view-as';

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership, isAdmin, viewingAs } = await requireTenant(slug);
  const t = await getTranslations();
  const locale = await getLocale();
  const sb = await supabaseServer();
  const { data: team } = isAdmin ? await sb.from('memberships').select('id, display_name, role').eq('tenant_id', tenant.id).order('role') : { data: null };
  const { data: agent } = await sb.from('agents').select('name').eq('tenant_id', tenant.id).eq('scope_kind', 'tenant').limit(1).maybeSingle();
  const A = { title: t('assistant.title'), placeholder: t('assistant.placeholder'), send: t('assistant.send'), working: t('assistant.working'), used: t('assistant.used'), approve: t('assistant.approve'), hold: t('assistant.hold'), reject: t('assistant.reject'), approved: t('assistant.approved'), rejected: t('assistant.rejected'), inQueue: t('assistant.inQueue'), open: t('assistant.open'), close: t('assistant.close'), clear: t('assistant.clear'), you: t('assistant.you'), noKey: t('assistant.noKey'), s_day: t('assistant.s_day'), s_orders: t('assistant.s_orders'), s_order: t('assistant.s_order'), s_parties: t('assistant.s_parties'), s_queue: t('assistant.s_queue'), s_ledger: t('assistant.s_ledger'), s_any1: t('assistant.s_any1'), s_any2: t('assistant.s_any2') };
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
          {isAdmin && <ViewAs slug={slug} current={viewingAs || ''} members={(team || []).map((m) => ({ id: m.id, name: m.display_name || '?', role: t(`roles.${m.role}`) }))} label={t('viewas.label')} self={t('viewas.self')} />}
          <div className="flex items-center gap-2 mt-2"><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
        </div>
      </aside>
      <main className="p-6" style={{ background: 'var(--paper)' }}>{children}</main>
      <Assistant slug={slug} agentName={agent?.name || 'Mira'} lang={locale} live={hasLlm()} labels={A} />
    </div>
  );
}
