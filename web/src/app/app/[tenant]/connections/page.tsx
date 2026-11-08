// Connections: what this company has connected, what works today, and every system VIA can
// connect on request, each with its setup steps. The catalogue is data (lib/connectors/catalog.ts),
// so adding a channel is a manifest entry, not a screen.
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { CONNECTORS, CATEGORIES, STATUS_LABEL, type ConnectorCategory } from '@/lib/connectors/catalog';
import { BrandIcon, BrandCluster, BrandRow } from '@/components/brand-icon';
import { googleConfigured } from '@/lib/connectors/google';
import { microsoftConfigured } from '@/lib/connectors/microsoft';
import { driveConfigured } from '@/lib/connectors/drive';
import { saveMailbox, disconnectMailbox, createForwardAddress } from './actions';
import { forwardConfigured } from '@/lib/connectors/forward';
import { CopyButton } from '@/components/copy-button';

type Ch = { id: string; kind: string; name: string; status: string; account: string | null; owner_user_id: string | null; last_sync_at: string | null; error: string | null; config: { connector?: string; filter?: string; label?: string | null; connected_by?: string } };
// platform logos shown with each step of the guide
const GUIDE_ICONS: Record<string, [string, string][] | undefined> = {
  s1: [['Gmail', '/brands/gmail.svg'], ['Microsoft 365', '/brands/microsoft.svg'], ['Google Drive', '/brands/googledrive.svg'], ['WhatsApp Business', '/brands/whatsapp.svg'], ['WeCom', '/brands/wecom.png'], ['Zalo OA', '/brands/zalo.svg']],
  s2: [['Zalo', '/brands/zalo.svg'], ['WeChat', '/brands/wechat.svg'], ['WhatsApp', '/brands/whatsapp.svg'], ['Telegram', '/brands/telegram.svg']],
};
const GERR = ['notReady', 'support', 'viewer', 'state', 'denied', 'scopes', 'refresh', 'failed', 'label', 'forbidden', 'adminConsent', 'folder'] as const;
const M365_ERR = ['adminConsent', 'folder'];

export default async function Connections({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ tenant: slug }, sp] = await Promise.all([params, searchParams]);
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('connections');
  const sb = await supabaseServer();
  const { data } = await sb.from('channels').select('id, kind, name, status, account, owner_user_id, last_sync_at, error, config').eq('tenant_id', tenant.id).order('created_at');
  const channels = (data || []) as Ch[];
  // one Google Drive connection serves both the Drive and the Sheets entries
  const connected = new Set(channels.filter((c) => c.status === 'connected').flatMap((c) => (c.config?.connector === 'gdrive' ? ['drive', 'sheets'] : [c.config?.connector || c.kind])));
  const drives = channels.filter((c) => c.config?.connector === 'gdrive' && c.status !== 'off');
  const dv = sp.gp === 'drive';
  const myForward = channels.find((c) => c.kind === 'email_inbound' && c.status === 'connected' && c.owner_user_id === user.id);
  const canEdit = (c: Ch) => membership.id !== 'admin' && (c.owner_user_id === user.id || ['owner', 'manager'].includes(membership.role));
  const canConnect = membership.id !== 'admin' && membership.role !== 'viewer';
  // mail connectors with a working runtime: catalogue id -> channel kind, OAuth route, strings namespace
  const MAIL: Record<string, { kind: string; provider: string; ready: boolean; ns: 'gmail' | 'm365' }> = {
    gmail: { kind: 'email_gmail', provider: 'google', ready: googleConfigured(), ns: 'gmail' },
    m365: { kind: 'email_m365', provider: 'microsoft', ready: microsoftConfigured(), ns: 'm365' },
  };
  const ms = sp.gp === 'microsoft';
  const gerr = GERR.find((k) => k === sp.gerror);
  const errNs: 'gmail' | 'm365' | 'gdrive' | 'forward' = gerr && (M365_ERR.includes(gerr) || (ms && ['notReady', 'refresh'].includes(gerr))) ? 'm365' : gerr && dv && ['notReady', 'scopes'].includes(gerr) ? 'gdrive' : gerr === 'notReady' && sp.gp === 'forward' ? 'forward' : 'gmail';
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: tenant.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const groups = (Object.keys(CATEGORIES) as ConnectorCategory[]).map((cat) => ({ cat, items: CONNECTORS.filter((c) => c.category === cat) })).filter((g) => g.items.length);
  const live = CONNECTORS.filter((c) => c.status !== 'request');

  return (
    <div className="max-w-5xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>

      {sp.gconnected && <div className="notice mt-4">{t(ms ? 'm365.done' : dv ? 'gdrive.done' : 'gmail.done', { account: sp.gconnected })}</div>}
      {sp.gsaved && <div className="notice mt-4">{t('gmail.saved')}</div>}
      {gerr && <div className="notice crit mt-4">{t(`${errNs}.errors.${gerr}` as 'gmail.errors.failed', { error: sp.gmsg || '', label: sp.glabel || '' })}</div>}

      <div className="card mt-6" style={{ borderLeft: '3px solid var(--accent)' }}>
        <h2 style={{ fontSize: 16 }}>{t('guide.title')}</h2>
        <ol className="grid gap-3 mt-3 md:grid-cols-2" style={{ listStyle: 'none', padding: 0 }}>
          {(['s1', 's2', 's3', 's4'] as const).map((k, i) => (
            <li key={k} className="flex gap-3 small"><span className="pill agent" style={{ alignSelf: 'flex-start' }}>{i + 1}</span><div><div className="font-medium">{t(`guide.${k}Title`)}</div>{GUIDE_ICONS[k] && <div className="mt-1"><BrandRow items={GUIDE_ICONS[k]!} /></div>}<div className="mt-1" style={{ color: 'var(--fg2)' }}>{t(`guide.${k}`)}</div></div></li>
          ))}
        </ol>
        <p className="small mt-3 font-medium">{t('guide.promise')}</p>
      </div>

      <div className="card mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2"><h2 style={{ fontSize: 16 }}>{t('available')}</h2><span className="muted small">{t('availableNote')}</span></div>
        <div className="grid gap-3 mt-4 md:grid-cols-2">
          {live.map((c) => (
            <div key={c.id} className="flex gap-3 p-3" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
              {c.logos ? <BrandCluster logos={c.logos} names={c.vendor || c.name} size={36} /> : <BrandIcon name={c.name} logo={c.logo} size={36} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{c.name}</span>{c.vendor && <span className="muted small">{c.vendor}</span>}<span className={`pill ${(connected.has(c.id) || (c.id === 'forward' && myForward)) ? 'ok' : c.status === 'via' ? 'agent' : ''} ml-auto`}>{(connected.has(c.id) || (c.id === 'forward' && myForward)) ? t('connected') : STATUS_LABEL[c.status]}</span></div>
                <div className="small mt-1" style={{ color: 'var(--fg2)' }}>{c.use}</div>
                <details className="mt-2 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('howTo')} · {c.auth}</summary><ol className="mt-2 pl-5 grid gap-1" style={{ listStyle: 'decimal' }}>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>{c.docs && <a className="muted" href={c.docs} target="_blank" rel="noopener">{t('docs')}</a>}</details>
                {c.id === 'drive' && <>
                  {drives.map((m) => (
                    <div key={m.id} className="mt-3 p-2 small" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{m.account}</span><span className={`pill ${m.status === 'connected' ? 'ok' : 'warn'}`}>{m.status === 'connected' ? t('connected') : t('gmail.reauth')}</span></div>
                      <div className="muted mt-1">{m.config?.connected_by ? t('gmail.by', { name: m.config.connected_by }) : ''}</div>
                      {m.error && m.status === 'connected' && <div className="mt-1" style={{ color: 'var(--crit)' }}>{m.error}</div>}
                      {canEdit(m) && <div className="flex gap-2 mt-2">
                        {m.status !== 'connected' && <a className="btn sm" href={`/api/connect/google?tenant=${slug}&want=drive`}>{t('gmail.reconnect')}</a>}
                        <form action={disconnectMailbox}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={m.id} /><button className="btn sm red">{t('gmail.disconnect')}</button></form>
                      </div>}
                    </div>
                  ))}
                  <p className="muted small mt-2">{t('gdrive.note')}</p>
                  {canConnect && !drives.some((m) => m.owner_user_id === user.id && m.status === 'connected') && (driveConfigured() ? <a className="btn sm primary mt-2" href={`/api/connect/google?tenant=${slug}&want=drive`}>{t('gdrive.connect')}</a> : <><button className="btn sm mt-2" disabled>{t('gdrive.connect')}</button><p className="muted small mt-1">{t('gdrive.errors.notReady')}</p></>)}
                </>}
                {c.id === 'forward' && <>
                  {myForward && <div className="mt-3 p-2 small" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                    <div className="muted">{t('forward.yours')}</div>
                    <div className="flex items-center gap-2 flex-wrap mt-1"><span className="mono font-medium" style={{ wordBreak: 'break-all' }}>{myForward.account}</span><CopyButton text={myForward.account || ''} label={t('forward.copy')} done={t('forward.copied')} /></div>
                    <div className="muted mt-1">{myForward.last_sync_at ? t('forward.last', { time: when(myForward.last_sync_at) }) : t('forward.none')}</div>
                    <div className="flex gap-2 mt-2">
                      <form action={createForwardAddress}><input type="hidden" name="tenant" value={slug} /><button className="btn sm">{t('forward.renew')}</button></form>
                      <form action={disconnectMailbox}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={myForward.id} /><button className="btn sm red">{t('forward.off')}</button></form>
                    </div>
                  </div>}
                  <p className="muted small mt-2">{t('forward.note')}</p>
                  {canConnect && !myForward && (forwardConfigured() ? <form action={createForwardAddress}><input type="hidden" name="tenant" value={slug} /><button className="btn sm primary mt-2">{t('forward.create')}</button></form> : <><button className="btn sm mt-2" disabled>{t('forward.create')}</button><p className="muted small mt-1">{t('forward.notReady')}</p></>)}
                </>}
                {c.id === 'sheets' && <p className="muted small mt-2">{t('gdrive.sheetsNote')}</p>}
                {MAIL[c.id] && (() => { const mc = MAIL[c.id], boxes = channels.filter((m) => m.kind === mc.kind && m.status !== 'off'); return <>
                  {boxes.map((m) => (
                    <div key={m.id} className="mt-3 p-2 small" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{m.account}</span><span className={`pill ${m.status === 'connected' ? 'ok' : 'warn'}`}>{m.status === 'connected' ? t('connected') : t('gmail.reauth')}</span></div>
                      <div className="muted mt-1">{m.config?.connected_by ? t('gmail.by', { name: m.config.connected_by }) + ' · ' : ''}{m.last_sync_at ? t('gmail.checked', { time: when(m.last_sync_at) }) : t('gmail.never')}</div>
                      {m.error && m.status === 'connected' && <div className="mt-1" style={{ color: 'var(--crit)' }}>{m.error}</div>}
                      {canEdit(m) && <>
                        <form action={saveMailbox} className="mt-2 grid gap-1">
                          <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={m.id} />
                          <span className="muted">{t('gmail.handles')}</span>
                          <label className="flex items-center gap-2"><input type="radio" name="filter" value="known" defaultChecked={m.config?.filter !== 'label'} />{t('gmail.known')}</label>
                          <label className="flex items-center gap-2 flex-wrap"><input type="radio" name="filter" value="label" defaultChecked={m.config?.filter === 'label'} />{t(mc.ns === 'm365' ? 'm365.label' : 'gmail.label')}<input name="label" className="input" style={{ maxWidth: 180, padding: '4px 8px' }} placeholder={t(mc.ns === 'm365' ? 'm365.labelName' : 'gmail.labelName')} defaultValue={m.config?.label || ''} /></label>
                          <div className="flex gap-2 mt-1"><button className="btn sm">{t('gmail.save')}</button></div>
                        </form>
                        <div className="flex gap-2 mt-2">
                          {m.status !== 'connected' && <a className="btn sm" href={`/api/connect/${mc.provider}?tenant=${slug}`}>{t('gmail.reconnect')}</a>}
                          <form action={disconnectMailbox}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={m.id} /><button className="btn sm red">{t('gmail.disconnect')}</button></form>
                        </div>
                      </>}
                    </div>
                  ))}
                  <p className="muted small mt-2">{t('gmail.note')}</p>
                  {canConnect && (mc.ready ? <a className="btn sm primary mt-2" href={`/api/connect/${mc.provider}?tenant=${slug}`}>{boxes.some((m) => m.owner_user_id === user.id) ? t(`${mc.ns}.another`) : t(`${mc.ns}.connect`)}</a> : <><button className="btn sm mt-2" disabled>{t(`${mc.ns}.connect`)}</button><p className="muted small mt-1">{t(`${mc.ns}.errors.notReady`)}</p></>)}
                </>; })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-8" style={{ fontSize: 16 }}>{t('catalogue')}</h2>
      <p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('catalogueNote')}</p>
      {groups.filter((g) => g.items.some((c) => c.status === 'request')).map((g) => (
        <div key={g.cat} className="mt-5">
          <div className="small font-medium muted" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 11 }}>{CATEGORIES[g.cat]}</div>
          <div className="grid gap-2 mt-2 md:grid-cols-2 lg:grid-cols-3">
            {g.items.filter((c) => c.status === 'request').map((c) => (
              <details key={c.id} className="p-3" style={{ border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
                <summary className="flex items-center gap-3" style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <BrandIcon name={c.name} logo={c.logo} size={30} />
                  <span className="min-w-0"><span className="font-medium">{c.name}</span>{c.vendor && <span className="muted small"> · {c.vendor}</span>}</span>
                  <span className="pill ml-auto">{STATUS_LABEL[c.status]}</span>
                </summary>
                <div className="small mt-3" style={{ color: 'var(--fg2)' }}>{c.use}</div>
                <div className="small mt-2"><span className="muted">{t('needs')}:</span> {c.auth}</div>
                <ol className="small mt-2 pl-5 grid gap-1" style={{ listStyle: 'decimal' }}>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <form className="mt-3"><button className="btn sm" disabled title={t('wiredSoon')}>{t('request')}</button></form>
              </details>
            ))}
          </div>
        </div>
      ))}
      <p className="muted small mt-8">{t('trademark')}</p>
    </div>
  );
}
