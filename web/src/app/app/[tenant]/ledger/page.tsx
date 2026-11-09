// Ledger & autonomy: the signed record and the gate per stream.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { setGate } from './actions';
import { trackFor } from '@/lib/tracks';

export default async function Ledger({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('ledger');
  const sb = await supabaseServer();
  const canSet = ['owner', 'manager'].includes(membership.role);
  const { track } = await trackFor(sb, slug, tenant.id, membership);
  const [{ data: rows }, { data: gates }, { data: verify }, { data: usage }] = await Promise.all([
    sb.from('ledger').select('id, at, channel, actor, counterparty, stream, what, gate, gated, orders(po), styles(id, code)').eq('tenant_id', tenant.id).eq('track', track).order('id', { ascending: false }).limit(150),
    sb.from('gates').select('stream, level, locked, updated_at').eq('tenant_id', tenant.id).eq('track', track).order('stream'),
    sb.rpc('ledger_verify', { p_tenant: tenant.id }),
    sb.from('usage_daily').select('day, agent_runs, tokens_in, tokens_out, cost_usd, messages_in, messages_out').eq('tenant_id', tenant.id).order('day', { ascending: false }).limit(14),
  ]);
  const v = (verify as unknown as { rows_checked: number; breaks: number }[] | null)?.[0];
  const tot = (usage || []).reduce((a, u) => ({ runs: a.runs + u.agent_runs, tokens: a.tokens + Number(u.tokens_in) + Number(u.tokens_out), cost: a.cost + Number(u.cost_usd) }), { runs: 0, tokens: 0, cost: 0 });
  return (
    <div className="max-w-6xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {q.error && <div className="notice crit mt-4">{q.error}</div>}
      {q.saved && <div className="notice ok mt-4">{t('saved')}</div>}
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${v && v.breaks === 0 ? 'ok' : 'crit'}`}><div className="n">{v?.rows_checked ?? rows?.length ?? 0}</div><div className="l">{t('rows')} · {v ? (v.breaks === 0 ? t('verified') : `${v.breaks} ${t('breaks')}`) : '—'}</div></div>
        <div className="kpi"><div className="n">{tot.runs}</div><div className="l">{t('runs')} · 14d</div></div>
        <div className="kpi"><div className="n">{tot.tokens >= 1000 ? `${(tot.tokens / 1000).toFixed(0)}k` : tot.tokens}</div><div className="l">{t('tokens')} · 14d</div></div>
        <div className="kpi"><div className="n">{tot.cost.toFixed(2)}</div><div className="l">{t('cost')} · 14d</div></div>
      </div>

      <div className="grid gap-6 mt-6 lg:grid-cols-[1fr_360px]">
        <div className="card tw" style={{ padding: 0 }}>
          <table className="t stack"><thead><tr><th>{t('when')}</th><th>{t('who')}</th><th>{t('stream')}</th><th>{track === 'development' ? t('style') : t('po')}</th><th>{t('what')}</th><th>{t('gate')}</th></tr></thead><tbody>
            {(rows || []).map((r) => { const po = (r.orders as unknown as { po: string } | null)?.po, st = r.styles as unknown as { id: string; code: string } | null; return (
              <tr key={r.id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="small" data-l={t('who')}>{r.actor}{r.counterparty ? <span className="muted"> → {r.counterparty}</span> : ''}</td>
                <td className="small muted" data-l={t('stream')}>{r.stream}</td>
                <td className="small" data-l={po || st ? t('po') : undefined}>{po ? <Link href={`/app/${slug}/orders/${encodeURIComponent(po)}`}>{po}</Link> : st ? <Link href={`/app/${slug}/styles/${st.id}`}>{st.code}</Link> : ''}</td>
                <td className="small">{r.what}</td>
                <td data-l={t('gate')}><span className={`pill ${r.gated ? (r.gate?.startsWith('APPROVED') || r.gate?.startsWith('ADMIN') ? 'ok' : r.gate?.startsWith('REJECTED') ? 'crit' : 'warn') : r.gate?.startsWith('AUTO') ? 'agent' : ''}`}>{r.gate}</span></td>
              </tr>); })}
          </tbody></table>
        </div>
        <div>
          <div className="card">
            <h2 style={{ fontSize: 15 }}>{t('gates')}</h2>
            <p className="muted small mt-1">{t('gateNote')}</p>
            <table className="t mt-3"><thead><tr><th>{t('stream')}</th><th>{t('level')}</th><th>{t('cap')}</th></tr></thead><tbody>
              {(gates || []).map((g) => (
                <tr key={g.stream}><td className="small">{g.stream}</td>
                  <td>{canSet ? (
                    <form action={setGate} className="flex gap-1 items-center"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="track" value={track} /><input type="hidden" name="stream" value={g.stream} />
                      <select name="level" defaultValue={g.level} className="input sm" style={{ width: 64 }}>{[0, 1, 2, 3].filter((l) => g.locked == null || l <= g.locked).map((l) => <option key={l} value={l}>L{l}</option>)}</select>
                      <button className="btn sm">{t('save')}</button></form>
                  ) : <span className="pill agent">L{g.level}</span>}</td>
                  <td className="small muted">{g.locked != null ? `L${g.locked}` : ''}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
