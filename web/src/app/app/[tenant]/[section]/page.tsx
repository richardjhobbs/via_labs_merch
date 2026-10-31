import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { decideSupport, revokeSupport } from '../settings-actions';
import { isActive, SUPPORT_HOURS, type SupportGrant } from '@/lib/support';

const SECTIONS = ['settings'] as const;

export default async function Section({ params, searchParams }: { params: Promise<{ tenant: string; section: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug, section } = await params;
  if (!(SECTIONS as readonly string[]).includes(section)) notFound();
  const { tenant, membership } = await requireTenant(slug);
  const { saved, error } = await searchParams;
  const t = await getTranslations();
  const canDecide = ['owner', 'manager'].includes(membership.role);
  const sb = await supabaseServer();
  const { data } = await sb.from('support_access').select('*').eq('tenant_id', tenant.id).order('requested_at', { ascending: false }).limit(12);
  const rows = (data || []) as SupportGrant[];
  const pending = rows.filter((r) => r.status === 'requested');
  const active = rows.find((r) => isActive(r)) || null;
  const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const label = (r: SupportGrant) => r.status === 'granted' ? (isActive(r) ? t('settings.stActive') : t('settings.stExpired')) : t(`settings.st_${r.status}` as never);
  return (
    <div className="max-w-3xl">
      <h1>{t('nav.settings')}</h1>
      {saved && <div className="notice mt-3">{t('settings.decided')}</div>}
      {error && <div className="notice crit mt-3">{error === 'role' ? t('settings.onlyManagers') : error}</div>}

      <section className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('settings.support')}</h2>
        <p className="muted small mt-1">{t('settings.supportSub', { hours: SUPPORT_HOURS })}</p>
        {pending.map((r) => (
          <div key={r.id} className="notice warn mt-4">
            <b>{t('settings.pending')}</b>
            <div className="mt-1">{t('settings.reason')}: {r.reason}</div>
            <div className="small mt-1" style={{ opacity: .8 }}>{t('settings.requestedBy')}: {r.requested_by_email || 'VIA Labs'} · {when(r.requested_at)}</div>
            {canDecide ? (
              <div className="flex gap-2 mt-3">
                <form action={decideSupport}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="grant" /><button className="btn primary sm">{t('settings.grant', { hours: SUPPORT_HOURS })}</button></form>
                <form action={decideSupport}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="decline" /><button className="btn sm">{t('settings.decline')}</button></form>
              </div>
            ) : <div className="small mt-2">{t('settings.onlyManagers')}</div>}
          </div>
        ))}
        {active && (
          <div className="notice mt-4">
            <b>{t('settings.active', { when: when(active.expires_at) })}</b>
            <div className="mt-1">{t('settings.reason')}: {active.reason} · {active.decided_by_name}</div>
            {active.opened_at && <div className="small mt-1" style={{ opacity: .8 }}>{t('settings.opened', { when: when(active.opened_at) })}</div>}
            {canDecide && <form action={revokeSupport} className="mt-3"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={active.id} /><button className="btn sm">{t('settings.revoke')}</button></form>}
          </div>
        )}
        {!pending.length && !active && <p className="mt-4" style={{ color: 'var(--fg2)' }}>{t('settings.none')}</p>}
        {!!rows.length && (
          <details className="mt-4 small"><summary className="muted">{t('settings.history')}</summary>
            <ul className="mt-2 grid gap-1">{rows.map((r) => <li key={r.id} className="muted">{when(r.requested_at)} · {label(r)}{r.expires_at ? ` · ${t('settings.until')} ${when(r.expires_at)}` : ''}{r.decided_by_name ? ` · ${r.decided_by_name}` : ''} · {r.reason}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('settings.data')}</h2>
        <ul className="mt-2 grid gap-2 small" style={{ color: 'var(--fg2)' }}>
          {(['d1', 'd2', 'd3', 'd4'] as const).map((k) => <li key={k} className="flex gap-2"><span style={{ color: 'var(--accent)' }}>→</span><span>{t(`settings.${k}`)}</span></li>)}
        </ul>
        <Link href="/trust" className="btn sm mt-4" target="_blank">{t('settings.dataLink')}</Link>
      </section>
    </div>
  );
}
