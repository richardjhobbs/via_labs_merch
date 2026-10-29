// Agents: the company's agents, a conversation with the Ops agent, and the inbound simulator.
import { getLocale, getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { hasLlm } from '@/lib/llm';
import { InboundSim } from './panels';

const TOOLS = ['get_briefing', 'search_orders', 'get_order', 'get_exceptions', 'get_party', 'get_messages', 'get_ledger', 'get_gates', 'queue_draft', 'request_approval', 'set_milestone'];

export default async function Agents({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant } = await requireTenant(slug);
  const t = await getTranslations('agents');
  const locale = await getLocale();
  const sb = await supabaseServer();
  const [{ data: agents }, { data: parties }, { data: runs }] = await Promise.all([
    sb.from('agents').select('id, name, scope_kind, scope_stream, model, languages, enabled, parties(name)').eq('tenant_id', tenant.id).order('created_at'),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).order('kind').order('name'),
    sb.from('agent_runs').select('id, trigger, tools_called, tokens_in, tokens_out, cost_usd, ms, error, created_at').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(8),
  ]);
  const live = hasLlm();
  return (
    <div className="max-w-6xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {!live && <div className="notice warn mt-4">{t('noKey')}</div>}
      <div className="grid gap-6 mt-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          <InboundSim slug={slug} live={live} parties={(parties || []).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))} labels={{ title: t('simulate'), sub: t('simulateSub'), from: t('from'), party: t('party'), channel: t('channel'), subject: t('subject'), text: t('text'), run: t('run'), result: t('result'), openQueue: t('openQueue'), thinking: t('thinking') }} />
        </div>
        <div className="grid gap-4" style={{ alignContent: 'start' }}>
          {(agents || []).map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-center gap-2"><span className="pill agent">{a.name.slice(0, 1)}</span><span className="font-medium">{a.name}</span>{!a.enabled && <span className="pill ml-auto">off</span>}</div>
              <div className="small mt-2 grid gap-1" style={{ color: 'var(--fg2)' }}>
                <div><span className="muted">{t('scope')}:</span> {a.scope_kind === 'tenant' ? tenant.name : a.scope_kind === 'party' ? (a.parties as unknown as { name: string } | null)?.name : a.scope_stream}</div>
                <div><span className="muted">{t('model')}:</span> {a.model.startsWith('claude-') ? a.model : 'claude-sonnet-5-5'}</div>
                <div><span className="muted">{t('languages')}:</span> {(a.languages || []).join(', ')}</div>
                <div><span className="muted">{t('toolsList')}:</span> <span className="mono" style={{ fontSize: 11 }}>{TOOLS.join(' · ')}</span></div>
              </div>
            </div>
          ))}
          {!!runs?.length && (
            <div className="card">
              <div className="font-medium small">Recent runs</div>
              <table className="t mt-2"><tbody>
                {runs.map((r) => <tr key={r.id}><td className="small muted">{new Date(r.created_at).toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' })}</td><td className="small">{r.trigger}</td><td className="small muted">{(r.tools_called as unknown[]).length} tools</td><td className="small muted">{((r.ms || 0) / 1000).toFixed(1)}s</td><td className="small muted">${Number(r.cost_usd).toFixed(3)}</td><td>{r.error && <span className="pill crit" title={r.error}>error</span>}</td></tr>)}
              </tbody></table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
