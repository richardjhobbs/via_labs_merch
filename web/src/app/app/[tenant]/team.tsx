// Manager viewpoint: the team, each person's customers, and what their agent has waiting for them.
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { listOrders, exceptionsOf } from '@/lib/orders';
import { scopeOf, type Membership } from '@/lib/tenant';

export async function Team({ tenantId }: { tenantId: string }) {
  const t = await getTranslations('day');
  const sb = await supabaseServer();
  const [{ data: members }, { data: drafts }, { data: parties }, orders, { data: usage }] = await Promise.all([
    sb.from('memberships').select('id, role, display_name, initials, title, scopes').eq('tenant_id', tenantId).order('role').order('display_name'),
    sb.from('drafts').select('id, party_id, orders(customer_id)').eq('tenant_id', tenantId).in('status', ['queued', 'escalated']),
    sb.from('parties').select('id, name').eq('tenant_id', tenantId),
    listOrders(tenantId, { status: 'open' }),
    sb.from('usage_daily').select('agent_runs, messages_in, cost_usd').eq('tenant_id', tenantId).eq('day', new Date().toISOString().slice(0, 10)).maybeSingle(),
  ]);
  const nameOf = (id: string) => parties?.find((p) => p.id === id)?.name || '?';
  const rows = ((members || []) as unknown as Membership[]).map((m) => {
    const scope = scopeOf(m);
    const mine = scope ? orders.filter((o) => o.customer && scope.includes(o.customer.id)) : orders;
    const q = (drafts || []).filter((d) => !scope || (d.party_id && scope.includes(d.party_id)) || ((d.orders as unknown as { customer_id: string } | null)?.customer_id && scope.includes((d.orders as unknown as { customer_id: string }).customer_id)));
    return { m, scope, pos: mine.length, off: mine.filter((o) => o.health.state !== 'green').length, ex: exceptionsOf(mine).length, q: q.length };
  });
  return (
    <div className="card tw mt-4" style={{ padding: 0 }}>
      <div className="p-4 pb-2 flex items-center gap-3 flex-wrap"><h2>{t('team')}</h2><span className="muted small ml-auto">{t('agentToday', { runs: usage?.agent_runs ?? 0, msgs: usage?.messages_in ?? 0, cost: Number(usage?.cost_usd ?? 0).toFixed(2) })}</span></div>
      <table className="t"><thead><tr><th>{t('person')}</th><th>{t('customers')}</th><th className="text-right">{t('openPos')}</th><th className="text-right">{t('offplanCol')}</th><th className="text-right">{t('exceptions')}</th><th className="text-right">{t('waiting')}</th></tr></thead><tbody>
        {rows.map(({ m, scope, pos, off, ex, q }) => (
          <tr key={m.id}>
            <td><span className="pill agent" style={{ marginRight: 6 }}>{m.initials || (m.display_name || '?').slice(0, 2).toUpperCase()}</span>{m.display_name}<div className="muted small">{m.title || m.role}</div></td>
            <td className="small">{scope ? scope.map(nameOf).join(', ') : <span className="muted">{t('allCustomers')}</span>}</td>
            <td className="text-right">{pos}</td>
            <td className="text-right">{off ? <span className="pill warn">{off}</span> : <span className="muted">0</span>}</td>
            <td className="text-right">{ex ? <span className="pill crit">{ex}</span> : <span className="muted">0</span>}</td>
            <td className="text-right">{q ? <span className="pill warn">{q}</span> : <span className="muted">0</span>}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
