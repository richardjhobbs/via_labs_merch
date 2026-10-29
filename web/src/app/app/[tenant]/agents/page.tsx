// Agents: who works for this company, what they do on their own, and what they have done.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { hasLlm } from '@/lib/llm';
import { lastPass } from '@/lib/agents/proactive';

const TOOLS = ['get_briefing', 'search_orders', 'get_order', 'get_exceptions', 'get_party', 'get_messages', 'get_ledger', 'get_gates', 'get_team', 'queue_draft', 'request_approval', 'set_milestone', 'navigate'];

export default async function Agents({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const t = await getTranslations('agents');
  const sb = await supabaseServer();
  const [{ data: agents }, { data: runs }, { data: gates }, { count: queued }, { count: msgs }, lp] = await Promise.all([
    sb.from('agents').select('id, name, scope_kind, scope_stream, model, languages, enabled, parties(name)').eq('tenant_id', tenant.id).order('created_at'),
    sb.from('agent_runs').select('id, trigger, tools_called, tokens_in, tokens_out, cost_usd, ms, error, output, created_at').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(12),
    sb.from('gates').select('stream, level, locked').eq('tenant_id', tenant.id).order('stream'),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('status', ['queued', 'escalated']),
    sb.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('direction', 'in'),
    lastPass(tenant.id),
  ]);
  const live = hasLlm();
  const TRIG: Record<string, string> = { chat: t('trigChat'), inbound: t('trigInbound'), schedule: t('trigSchedule'), partner: t('trigPartner') };
  return (
    <div className="max-w-6xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {!live && <div className="notice warn mt-4">{t('noKey')}</div>}
      <div className="grid gap-6 mt-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          {(agents || []).map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-center gap-3"><span className="pill agent" style={{ fontSize: 14, padding: '4px 10px' }}>{a.name.slice(0, 1)}</span><div><div className="font-medium" style={{ fontSize: 16 }}>{a.name}</div><div className="muted small">{a.scope_kind === 'tenant' ? t('opsAgent', { company: tenant.name }) : a.scope_kind === 'party' ? (a.parties as unknown as { name: string } | null)?.name : a.scope_stream}</div></div>{!a.enabled && <span className="pill ml-auto">off</span>}</div>
              <div className="mt-4 small font-medium">{t('autoTitle')}</div>
              <ul className="mt-2 grid gap-2 small" style={{ color: 'var(--fg2)' }}>
                {(['auto1', 'auto2', 'auto3', 'auto4', 'auto5'] as const).map((k) => <li key={k} className="flex gap-2"><span style={{ color: 'var(--accent)' }}>→</span><span>{t(k)}</span></li>)}
              </ul>
              <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <div className="kpi"><div className="n">{queued ?? 0}</div><div className="l">{t('kWaiting')}</div></div>
                <div className="kpi"><div className="n">{msgs ?? 0}</div><div className="l">{t('kMessages')}</div></div>
                <div className="kpi"><div className="n" style={{ fontSize: 16 }}>{lp ? new Date(lp).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('never')}</div><div className="l">{t('lastPass')}</div></div>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap"><Link className="btn sm primary" href={`/app/${slug}/queue`}>{t('openQueue')}</Link><Link className="btn sm" href={`/app/${slug}/ledger`}>{t('openLedger')}</Link></div>
              <details className="mt-4 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('details')}</summary>
                <div className="mt-2 grid gap-1" style={{ color: 'var(--fg2)' }}>
                  <div><span className="muted">{t('model')}:</span> {a.model === 'claude-sonnet-5-5' || a.model === 'claude-haiku-5-5' ? a.model : 'claude-sonnet-5-5'}</div>
                  <div><span className="muted">{t('languages')}:</span> {(a.languages || []).join(', ')}</div>
                  <div><span className="muted">{t('toolsList')}:</span> <span className="mono" style={{ fontSize: 11 }}>{TOOLS.join(' · ')}</span></div>
                  <div><span className="muted">{t('gatesLine')}:</span> {(gates || []).map((g) => `${g.stream} L${g.level}${g.locked != null ? '*' : ''}`).join(' · ')}</div>
                </div>
              </details>
            </div>
          ))}
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="font-medium small">{t('activity')}</div>
          {!runs?.length && <div className="muted small mt-2">{t('noRuns')}</div>}
          <div className="mt-2 grid gap-2">
            {(runs || []).map((r) => (
              <div key={r.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
                <div className="flex items-center gap-2"><span className="pill agent">{TRIG[r.trigger] || r.trigger}</span><span className="muted">{new Date(r.created_at).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span className="muted ml-auto">{(r.tools_called as unknown[]).length} {t('toolsShort')} · {((r.ms || 0) / 1000).toFixed(1)}s · ${Number(r.cost_usd).toFixed(3)}</span></div>
                {r.error ? <div className="mt-1" style={{ color: 'var(--crit)' }}>{r.error}</div> : r.output && <div className="mt-1 muted" style={{ whiteSpace: 'pre-wrap', maxHeight: 72, overflow: 'hidden' }}>{r.output.slice(0, 220)}{r.output.length > 220 ? '…' : ''}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
