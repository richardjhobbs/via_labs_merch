import { Logo } from '@/components/logo';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { LangSwitch } from '@/components/lang-switch';
import { Rail } from './rail';
import { MobileNav } from './mobile-nav';
import { Assistant } from '@/components/assistant';
import { supabaseServer } from '@/lib/supabase/server';
import { hasLlm } from '@/lib/llm';
import { getLocale } from 'next-intl/server';
import { ViewAs } from '@/components/view-as';
import { Avatar, CompanyLogo } from '@/components/avatar';
import { cookies } from 'next/headers';

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, membership, isAdmin, viewingAs } = await requireTenant(slug, { partner: true });
  const t = await getTranslations();
  const ck = (await cookies()).get('merch_theme')?.value;
  const theme = ck === 'dark' || ck === 'system' ? ck : 'light';
  // a partner sees the shared compliance portal only: no workspace navigation and no agent
  const navLabels = { more: t('nav.more'), menu: t('nav.menu'), close: t('assistant.close') };
  if (membership.role === 'partner') {
    const account = <>
      <div className="flex items-center gap-2"><Avatar path={membership.avatar_path} name={membership.display_name} initials={membership.initials} /><b>{membership.display_name || 'You'}</b></div>
      <div className="flex items-center gap-2 mt-2"><LangSwitch compact up /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
    </>;
    const pitems = [['shared', t('nav.shared')]] as [string, string][];
    return (
      <div data-theme={theme} className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
        <MobileNav base={`/app/${slug}`} tenantName={tenant.name} sub={t('roles.partner')} items={pitems} tabs={[]} labels={navLabels} brand={<CompanyLogo path={tenant.logo_path} name={tenant.name} />}>{account}</MobileNav>
        <aside className="rail hidden md:flex flex-col p-3 gap-1 sticky top-0 h-screen overflow-y-auto" style={{ borderRight: '1px solid var(--line)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-2 px-2 py-2 mb-2"><Logo merch adaptive h={44} /></div>
          <div className="px-2 pb-2 flex items-center gap-2"><CompanyLogo path={tenant.logo_path} name={tenant.name} /><div className="min-w-0"><b className="small">{tenant.name}</b><div className="muted small">{t('roles.partner')}</div></div></div>
          <Rail base={`/app/${slug}`} items={pitems} />
          <div className="mt-auto px-2 pt-3 small" style={{ borderTop: '1px solid var(--line2)' }}>{account}</div>
        </aside>
        <main className="p-4 md:p-6 min-w-0" style={{ background: 'var(--paper)' }}>{children}</main>
      </div>
    );
  }
  const locale = await getLocale();
  const sb = await supabaseServer();
  const { data: team } = isAdmin ? await sb.from('memberships').select('id, display_name, role').eq('tenant_id', tenant.id).neq('role', 'partner').order('role') : { data: null };
  const { data: agent } = await sb.from('agents').select('name').eq('tenant_id', tenant.id).eq('scope_kind', 'tenant').limit(1).maybeSingle();
  const canDecide = ['owner', 'manager'].includes(membership.role);
  const { data: pendingSupport } = canDecide ? await sb.from('support_access').select('id, reason').eq('tenant_id', tenant.id).eq('status', 'requested').limit(1).maybeSingle() : { data: null };
  const A = { title: t('assistant.title'), placeholder: t('assistant.placeholder'), send: t('assistant.send'), working: t('assistant.working'), queued: t('assistant.queued'), used: t('assistant.used'), approve: t('assistant.approve'), hold: t('assistant.hold'), reject: t('assistant.reject'), approved: t('assistant.approved'), rejected: t('assistant.rejected'), inQueue: t('assistant.inQueue'), open: t('assistant.open'), close: t('assistant.close'), clear: t('assistant.clear'), you: t('assistant.you'), noKey: t('assistant.noKey'), mic: t('assistant.mic'), micStop: t('assistant.micStop'), micDenied: t('assistant.micDenied'), listening: t('assistant.listening'), micService: t('assistant.micService'), micDevice: t('assistant.micDevice'), micSilence: t('assistant.micSilence') };
  const items = [
    ['', t('nav.day')], ['queue', t('nav.queue')], ['orders', t('nav.orders')], ['threads', t('nav.threads')], ['parties', t('nav.parties')],
    ['esg', t('nav.esg')], ['ledger', t('nav.ledger')], ['agents', t('nav.agents')], ['connections', t('nav.connections')], ['settings', t('nav.settings')],
  ] as [string, string][];
  const account = <>
    <div className="flex items-center gap-2"><Avatar path={membership.avatar_path} name={membership.display_name} initials={membership.initials} /><div className="min-w-0"><b>{membership.display_name || 'You'}</b> <span className="muted">· {t(`roles.${membership.role}`)}</span></div></div>
    {isAdmin && <Link href="/admin" className="block mt-1">{t('nav.admin')}</Link>}
    {isAdmin && <ViewAs slug={slug} current={viewingAs || ''} members={(team || []).map((m) => ({ id: m.id, name: m.display_name || '?', role: t(`roles.${m.role}`) }))} label={t('viewas.label')} self={t('viewas.self')} />}
    <div className="flex items-center gap-2 mt-2"><LangSwitch compact up /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div>
  </>;
  const tabs = [['', t('nav.short.day')], ['queue', t('nav.short.queue')], ['orders', t('nav.short.orders')], ['threads', t('nav.short.threads')]] as [string, string][];
  return (
    <div data-theme={theme} className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <MobileNav base={`/app/${slug}`} tenantName={tenant.name} sub={tenant.kind.replace('_', ' ')} items={items} tabs={tabs} labels={navLabels} brand={<CompanyLogo path={tenant.logo_path} name={tenant.name} />}>{account}</MobileNav>
      <aside className="rail hidden md:flex flex-col p-3 gap-1 sticky top-0 h-screen overflow-y-auto" style={{ borderRight: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2 px-2 py-2 mb-2"><Logo merch adaptive h={44} /></div>
        <div className="px-2 pb-2 flex items-center gap-2"><CompanyLogo path={tenant.logo_path} name={tenant.name} /><div className="min-w-0"><b className="small">{tenant.name}</b><div className="muted small">{tenant.kind.replace('_', ' ')}</div></div></div>
        <Rail base={`/app/${slug}`} items={items} />
        <div className="mt-auto px-2 pt-3 small" style={{ borderTop: '1px solid var(--line2)' }}>{account}</div>
      </aside>
      <main className="app-main p-4 md:p-6 min-w-0" style={{ background: 'var(--paper)' }}>
        {pendingSupport && <Link href={`/app/${slug}/settings`} className="notice warn block mb-4 no-underline">{t('settings.pendingNotice', { reason: pendingSupport.reason })}</Link>}
        {children}
      </main>
      <Assistant slug={slug} agentName={agent?.name || 'Mira'} lang={locale} live={hasLlm()} labels={A} />
    </div>
  );
}
