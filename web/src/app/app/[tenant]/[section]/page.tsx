import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { decideSupport, revokeSupport } from '../settings-actions';
import { isActive, SUPPORT_HOURS, type SupportGrant } from '@/lib/support';
import { cookies } from 'next/headers';
import { Avatar, CompanyLogo } from '@/components/avatar';
import { ThemePicker } from '../theme-picker';
import { savePhone, saveAvatar, removeAvatar, saveLogo, removeLogo, saveMyTz, saveHours } from '../profile-actions';
import { hoursOf } from '@/lib/work-hours';
import { getLocale } from 'next-intl/server';

const SECTIONS = ['settings'] as const;

export default async function Section({ params, searchParams }: { params: Promise<{ tenant: string; section: string }>; searchParams: Promise<{ saved?: string; error?: string; psaved?: string; perr?: string }> }) {
  const { tenant: slug, section } = await params;
  if (!(SECTIONS as readonly string[]).includes(section)) notFound();
  const { tenant, membership, memberships, user, viewingAs } = await requireTenant(slug);
  const { saved, error, psaved, perr } = await searchParams;
  const t = await getTranslations();
  const canDecide = ['owner', 'manager'].includes(membership.role);
  const sb = await supabaseServer();
  const [{ data }, ck] = await Promise.all([
    sb.from('support_access').select('*').eq('tenant_id', tenant.id).order('requested_at', { ascending: false }).limit(12),
    cookies(),
  ]);
  const tv = ck.get('merch_theme')?.value, theme = tv === 'dark' || tv === 'system' ? tv : 'light';
  // personal fields belong to the signed-in person's own membership; VIA staff walking the workspace have none
  const mine = viewingAs ? null : memberships.find((x) => x.tenant_id === tenant.id) || null;
  const isOwner = mine?.role === 'owner';
  const PERR: Record<string, string> = { own: t('profile.errOwn'), file: t('profile.errFile'), type: t('profile.errType'), size: t('profile.errSize'), phone: t('profile.errPhone'), owner: t('profile.errOwner'), tz: t('hours.errTz'), hours: t('hours.errHours'), role: t('hours.errRole') };
  const locale = await getLocale();
  const { data: tset } = await sb.from('tenants').select('settings, tz').eq('id', tenant.id).single();
  const wh = hoursOf((tset?.tz as string) || tenant.tz, tset?.settings);
  const zones = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + d)));
  const canHours = ['owner', 'manager'].includes(membership.role) && !viewingAs;
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

      {psaved && <div className="notice mt-3">{t('profile.saved')}</div>}
      {perr && <div className="notice crit mt-3">{PERR[perr] || perr}</div>}

      <section id="profile" className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('profile.title')}</h2>
        {mine ? <>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <Avatar path={mine.avatar_path} name={mine.display_name} initials={mine.initials} size={64} />
            <form action={saveAvatar} className="flex items-center gap-2 flex-wrap">
              <input type="hidden" name="slug" value={slug} />
              <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required className="small" style={{ maxWidth: 230 }} />
              <button className="btn sm">{t('profile.upload')}</button>
            </form>
            {mine.avatar_path && <form action={removeAvatar}><input type="hidden" name="slug" value={slug} /><button className="btn sm red">{t('profile.remove')}</button></form>}
          </div>
          <p className="muted small mt-2">{t('profile.imageHelp')}</p>
          <div className="grid gap-3 mt-4 sm:grid-cols-2">
            <label className="f"><span>{t('profile.name')}</span><input className="input" value={mine.display_name || ''} readOnly disabled /><span className="muted small mt-1" style={{ fontWeight: 400 }}>{t('profile.nameFixed')}</span></label>
            <label className="f"><span>{t('profile.email')}</span><input className="input" value={user.email || ''} readOnly disabled /></label>
          </div>
          <form action={savePhone} className="grid gap-2 sm:grid-cols-[1fr_auto] items-end">
            <input type="hidden" name="slug" value={slug} />
            <label className="f" style={{ marginBottom: 0 }}><span>{t('profile.phone')}</span><input className="input" type="tel" name="phone" defaultValue={mine.phone || ''} placeholder="+84 90 123 4567" autoComplete="tel" maxLength={24} /></label>
            <button className="btn primary">{t('profile.savePhone')}</button>
          </form>
          <p className="muted small mt-2">{t('profile.phoneHelp')}</p>
          <form action={saveMyTz} className="grid gap-2 sm:grid-cols-[1fr_auto] items-end mt-4">
            <input type="hidden" name="slug" value={slug} />
            <label className="f" style={{ margin: 0 }}><span>{t('hours.myTz')}</span><select className="input" name="tz" defaultValue={(mine as { tz?: string | null }).tz || ''}><option value="">{t('hours.companyTz', { tz: wh.tz })}</option>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
            <button className="btn">{t('hours.save')}</button>
          </form>
          <p className="muted small mt-2">{t('hours.myTzHelp')}</p>
        </> : <p className="muted small mt-2">{t('profile.errOwn')}</p>}
      </section>

      <section id="hours" className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('hours.title')}</h2>
        <p className="muted small mt-1">{t('hours.sub')}</p>
        {canHours ? <form action={saveHours} className="grid gap-3 mt-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="flex gap-2 flex-wrap">{[1, 2, 3, 4, 5, 6, 7].map((d) => <label key={d} className="pill" style={{ cursor: 'pointer', padding: '6px 10px' }}><input type="checkbox" name="days" value={d} defaultChecked={wh.days.includes(d)} style={{ marginRight: 6 }} />{dayName(d)}</label>)}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="f" style={{ margin: 0 }}><span>{t('hours.start')}</span><input className="input" type="time" name="start" defaultValue={wh.start} required /></label>
            <label className="f" style={{ margin: 0 }}><span>{t('hours.end')}</span><input className="input" type="time" name="end" defaultValue={wh.end} required /></label>
            <label className="f" style={{ margin: 0 }}><span>{t('hours.companyZone')}</span><select className="input" name="tz" defaultValue={wh.tz}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
          </div>
          <div><button className="btn primary sm">{t('hours.save')}</button></div>
        </form> : <p className="mt-3">{wh.days.map(dayName).join(' · ')} · {wh.start}-{wh.end} · {wh.tz}</p>}
      </section>

      <section className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('profile.display')}</h2>
        <p className="muted small mt-1">{t('profile.displaySub')}</p>
        <ThemePicker slug={slug} current={theme} labels={{ light: t('profile.day'), dark: t('profile.night'), system: t('profile.system') }} />
      </section>

      <section className="card mt-4">
        <h2 style={{ fontSize: 17 }}>{t('profile.logo')}</h2>
        <p className="muted small mt-1">{t('profile.logoSub')}</p>
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {tenant.logo_path ? <span className="p-2" style={{ border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}><CompanyLogo path={tenant.logo_path} name={tenant.name} h={48} /></span> : <span className="muted small">{t('profile.noLogo')}</span>}
          {isOwner && <form action={saveLogo} className="flex items-center gap-2 flex-wrap">
            <input type="hidden" name="slug" value={slug} />
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required className="small" style={{ maxWidth: 230 }} />
            <button className="btn sm">{t('profile.upload')}</button>
          </form>}
          {isOwner && tenant.logo_path && <form action={removeLogo}><input type="hidden" name="slug" value={slug} /><button className="btn sm red">{t('profile.remove')}</button></form>}
        </div>
        {isOwner ? <p className="muted small mt-2">{t('profile.logoHelp')}</p> : <p className="muted small mt-2">{t('profile.ownerOnly')}</p>}
      </section>

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
