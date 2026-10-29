// Connections: what this company has connected, what works today, and every system VIA can
// connect on request, each with its setup steps. The catalogue is data (lib/connectors/catalog.ts),
// so adding a channel is a manifest entry, not a screen.
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { CONNECTORS, CATEGORIES, STATUS_LABEL, type ConnectorCategory } from '@/lib/connectors/catalog';
import { BrandIcon } from '@/components/brand-icon';

export default async function Connections({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const t = await getTranslations('connections');
  const sb = await supabaseServer();
  const { data: channels } = await sb.from('channels').select('id, kind, name, status, meta').eq('tenant_id', tenant.id);
  const connected = new Set((channels || []).map((c) => (c.meta as { connector?: string })?.connector || c.kind));
  const groups = (Object.keys(CATEGORIES) as ConnectorCategory[]).map((cat) => ({ cat, items: CONNECTORS.filter((c) => c.category === cat) })).filter((g) => g.items.length);
  const live = CONNECTORS.filter((c) => c.status !== 'request');

  return (
    <div className="max-w-5xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>

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
                {!connected.has(c.id) && c.status === 'stage1' && <button className="btn sm mt-2" disabled title={t('wiredSoon')}>{t('connect')}</button>}
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
