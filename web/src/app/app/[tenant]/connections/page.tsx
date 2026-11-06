// Connections: what this company has connected, what works today, and every system VIA can
// connect on request, each with its setup steps. The catalogue is data (lib/connectors/catalog.ts),
// so adding a channel is a manifest entry, not a screen.
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { CONNECTORS, CATEGORIES, STATUS_LABEL, type ConnectorCategory } from '@/lib/connectors/catalog';
import { BrandIcon } from '@/components/brand-icon';
import { googleConfigured } from '@/lib/connectors/google';
import { saveMailbox, disconnectMailbox } from './actions';

type Ch = { id: string; kind: string; name: string; status: string; account: string | null; owner_user_id: string | null; last_sync_at: string | null; error: string | null; config: { connector?: string; filter?: string; label?: string | null; connected_by?: string } };
const GERR = ['notReady', 'support', 'viewer', 'state', 'denied', 'scopes', 'refresh', 'failed', 'label', 'forbidden'] as const;

export default async function Connections({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ tenant: slug }, sp] = await Promise.all([params, searchParams]);
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('connections');
  const sb = await supabaseServer();
  const { data } = await sb.from('channels').select('id, kind, name, status, account, owner_user_id, last_sync_at, error, config').eq('tenant_id', tenant.id).order('created_at');
  const channels = (data || []) as Ch[];
  const connected = new Set(channels.filter((c) => c.status === 'connected').map((c) => c.config?.connector || c.kind));
  const mailboxes = channels.filter((c) => c.kind === 'email_gmail' && c.status !== 'off');
  const canEdit = (c: Ch) => membership.id !== 'admin' && (c.owner_user_id === user.id || ['owner', 'manager'].includes(membership.role));
  const canConnect = membership.id !== 'admin' && membership.role !== 'viewer';
  const ready = googleConfigured();
  const gerr = GERR.find((k) => k === sp.gerror);
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: tenant.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const groups = (Object.keys(CATEGORIES) as ConnectorCategory[]).map((cat) => ({ cat, items: CONNECTORS.filter((c) => c.category === cat) })).filter((g) => g.items.length);
  const live = CONNECTORS.filter((c) => c.status !== 'request');

  return (
    <div className="max-w-5xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>

      {sp.gconnected && <div className="notice mt-4">{t('gmail.done', { account: sp.gconnected })}</div>}
      {sp.gsaved && <div className="notice mt-4">{t('gmail.saved')}</div>}
      {gerr && <div className="notice crit mt-4">{t(`gmail.errors.${gerr}`, { error: sp.gmsg || '', label: sp.glabel || '' })}</div>}

      <div className="card mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2"><h2 style={{ fontSize: 16 }}>{t('available')}</h2><span className="muted small">{t('availableNote')}</span></div>
        <div className="grid gap-3 mt-4 md:grid-cols-2">
          {live.map((c) => (
            <div key={c.id} className="flex gap-3 p-3" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
              <BrandIcon name={c.name} logo={c.logo} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{c.name}</span>{c.vendor && <span className="muted small">{c.vendor}</span>}<span className={`pill ${connected.has(c.id) ? 'ok' : c.status === 'via' ? 'agent' : ''} ml-auto`}>{connected.has(c.id) ? t('connected') : STATUS_LABEL[c.status]}</span></div>
                <div className="small mt-1" style={{ color: 'var(--fg2)' }}>{c.use}</div>
                <details className="mt-2 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('howTo')} · {c.auth}</summary><ol className="mt-2 pl-5 grid gap-1" style={{ listStyle: 'decimal' }}>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>{c.docs && <a className="muted" href={c.docs} target="_blank" rel="noopener">{t('docs')}</a>}</details>
                {c.id === 'gmail' && <>
                  {mailboxes.map((m) => (
                    <div key={m.id} className="mt-3 p-2 small" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{m.account}</span><span className={`pill ${m.status === 'connected' ? 'ok' : 'warn'}`}>{m.status === 'connected' ? t('connected') : t('gmail.reauth')}</span></div>
                      <div className="muted mt-1">{m.config?.connected_by ? t('gmail.by', { name: m.config.connected_by }) + ' · ' : ''}{m.last_sync_at ? t('gmail.checked', { time: when(m.last_sync_at) }) : t('gmail.never')}</div>
                      {m.error && m.status === 'connected' && <div className="mt-1" style={{ color: 'var(--crit)' }}>{m.error}</div>}
                      {canEdit(m) && <>
                        <form action={saveMailbox} className="mt-2 grid gap-1">
                          <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={m.id} />
                          <span className="muted">{t('gmail.handles')}</span>
                          <label className="flex items-center gap-2"><input type="radio" name="filter" value="known" defaultChecked={m.config?.filter !== 'label'} />{t('gmail.known')}</label>
                          <label className="flex items-center gap-2 flex-wrap"><input type="radio" name="filter" value="label" defaultChecked={m.config?.filter === 'label'} />{t('gmail.label')}<input name="label" className="input" style={{ maxWidth: 180, padding: '4px 8px' }} placeholder={t('gmail.labelName')} defaultValue={m.config?.label || ''} /></label>
                          <div className="flex gap-2 mt-1"><button className="btn sm">{t('gmail.save')}</button></div>
                        </form>
                        <div className="flex gap-2 mt-2">
                          {m.status !== 'connected' && <a className="btn sm" href={`/api/connect/google?tenant=${slug}`}>{t('gmail.reconnect')}</a>}
                          <form action={disconnectMailbox}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={m.id} /><button className="btn sm red">{t('gmail.disconnect')}</button></form>
                        </div>
                      </>}
                    </div>
                  ))}
                  <p className="muted small mt-2">{t('gmail.note')}</p>
                  {canConnect && (ready ? <a className="btn sm primary mt-2" href={`/api/connect/google?tenant=${slug}`}>{mailboxes.some((m) => m.owner_user_id === user.id) ? t('gmail.another') : t('gmail.connect')}</a> : <><button className="btn sm mt-2" disabled>{t('gmail.connect')}</button><p className="muted small mt-1">{t('gmail.errors.notReady')}</p></>)}
                </>}
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
