// My day on the development track: drafts waiting on the development streams, records awaiting a check,
// styles with nothing confirmed yet, and the styles that moved most recently.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { listStyles, styleSignals, STATUS_PILL } from '@/lib/styles';
import { approveDraft, rejectDraft } from './queue/actions';
import { lastPass } from '@/lib/agents/proactive';
import type { Membership } from '@/lib/tenant';

export async function DevelopmentDay({ slug, tenant, membership, scope, saved, error }: { slug: string; tenant: { id: string; tz: string }; membership: Membership; scope: string[] | null; saved?: string; error?: string }) {
  const [t, ts] = await Promise.all([getTranslations('day'), getTranslations('styles')]);
  const sb = await supabaseServer();
  const [{ data: queuedRows }, { count: approvedToday }, styles, { data: agent }, lp] = await Promise.all([
    sb.from('drafts').select('id, seq, priority, stream, title, impact, body, lang, gate_level, created_at, party_id, styles(id, code, customer_id), parties(name), source:messages!drafts_source_message_id_fkey(thread_id)').eq('tenant_id', tenant.id).eq('track', 'development').in('status', ['queued', 'escalated']).order('priority').order('seq'),
    sb.from('drafts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('track', 'development').eq('status', 'sent').gte('decided_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    listStyles(tenant.id, { customers: scope }, sb),
    sb.from('agents').select('name').eq('tenant_id', tenant.id).eq('scope_kind', 'tenant').order('track', { ascending: true }).limit(1).maybeSingle(),
    lastPass(tenant.id),
  ]);
  const sig = await styleSignals(tenant.id, styles.map((s) => s.id), sb);
  const prepared = (queuedRows || []).filter((d) => !scope || (d.party_id && scope.includes(d.party_id)) || scope.includes((d.styles as unknown as { customer_id: string } | null)?.customer_id || ''));
  const live = styles.filter((s) => !['handed_over', 'dropped'].includes(s.status));
  const pending = live.filter((s) => (sig.get(s.id)?.pending || 0) > 0);
  const noTp = live.filter((s) => !sig.get(s.id)?.techPack && !(sig.get(s.id)?.pending));
  const agentName = agent?.name || 'Mira';
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tenant.tz }));
  const period = h < 12 ? t('morning') : h < 18 ? t('afternoon') : t('evening');
  const base = `/app/${slug}`;
  return (
    <div className="max-w-5xl">
      <h1>{t('greeting', { period, name: (membership.display_name || '').split(' ')[0] || '' })}</h1>
      <p className="muted small mt-1">{t('devNote')}</p>
      <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className={`kpi ${prepared.length ? 'warn' : 'ok'}`}><div className="n">{prepared.length}</div><div className="l">{t('waiting')}</div></div>
        <div className={`kpi ${pending.length ? 'warn' : 'ok'}`}><div className="n">{pending.length}</div><div className="l">{t('devPending')}</div></div>
        <div className="kpi"><div className="n">{live.length}</div><div className="l">{t('devLive')}</div></div>
        <div className="kpi ok"><div className="n">{approvedToday ?? 0}</div><div className="l">{t('approved')}</div></div>
      </div>
      {saved && <div className="notice ok mt-4">{t('decided')}</div>}
      {error && <div className="notice crit mt-4">{error}</div>}
      {!!pending.length && <div className="card mt-4" style={{ borderLeft: '3px solid #c9a24a' }}><h2>{t('devPendingTitle')}</h2><p className="muted small mt-1">{t('devPendingSub')}</p>
        {pending.slice(0, 8).map((s) => <div key={s.id} className="small flex items-center gap-2 flex-wrap mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><Link className="font-medium" href={`${base}/styles/${s.id}`}>{s.code}{s.name ? ` ${s.name}` : ''}</Link><span className="muted">{s.customer?.name}{s.season ? ` · ${s.season}` : ''}</span><span className="pill warn ml-auto">{ts('pendingN', { n: sig.get(s.id)!.pending })}</span></div>)}
      </div>}
      <div className="grid gap-4 mt-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card">
          <div className="flex items-center gap-2 flex-wrap"><span className="pill agent">{agentName.slice(0, 1)}</span><h2>{t('prepared', { name: agentName, n: prepared.length })}</h2><span className="muted small ml-auto">{lp ? t('preparedAt', { time: new Date(lp).toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' }) }) : ''}</span></div>
          {!prepared.length && <p className="muted mt-2 small">{t('devEmpty')}</p>}
          <div className="grid gap-3 mt-3">
            {prepared.slice(0, 6).map((d) => { const st = d.styles as unknown as { id: string; code: string } | null, party = (d.parties as unknown as { name: string } | null)?.name; return (
              <div key={d.id} className="small" style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }}>
                <div className="flex items-center gap-2 flex-wrap"><span className="mono muted">Q-{d.seq}</span><span className={`pill ${d.priority === 1 ? 'crit' : ''}`}>{d.stream}</span><span className="pill agent">L{d.gate_level}</span>{st && <Link className="pill" href={`${base}/styles/${st.id}`}>{st.code}</Link>}</div>
                <div className="mt-1 font-medium">{d.title}</div>
                {party && <div className="muted">→ {party}{d.lang && d.lang !== 'en' ? ` · ${d.lang}` : ''}</div>}
                {d.impact && <div className="muted mt-1">{d.impact}</div>}
                <details className="mt-1"><summary className="muted" style={{ cursor: 'pointer' }}>{t('showMessage')}</summary><pre className="mt-1 p-2" style={{ whiteSpace: 'pre-wrap', background: 'var(--paper)', borderRadius: 8, fontFamily: 'inherit' }}>{d.body}</pre></details>
                <form action={approveDraft} className="flex gap-2 mt-2 flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={base} />
                  <button className="btn primary sm">{t('approve')}</button><Link className="btn sm" href={`${base}/queue`}>{t('hold')}</Link><button className="btn sm" formAction={rejectDraft}>{t('reject')}</button>{(d.source as unknown as { thread_id: string | null } | null)?.thread_id && <Link className="btn sm" href={`${base}/threads/${(d.source as unknown as { thread_id: string }).thread_id}`}>{t('conversation')}</Link>}</form>
              </div>); })}
            {prepared.length > 6 && <Link className="small" href={`${base}/queue`}>{t('more', { n: prepared.length - 6 })}</Link>}
          </div>
        </div>
        <div className="card"><h2>{t('devNoTechPack')}</h2><p className="muted small mt-1">{t('devNoTechPackSub')}</p>
          {noTp.slice(0, 8).map((s) => <div key={s.id} className="small" style={{ padding: '8px 0', borderTop: '1px solid var(--line2)' }}><Link href={`${base}/styles/${s.id}`}>{s.code}{s.name ? ` ${s.name}` : ''}</Link><div className="muted">{s.customer?.name}{s.season ? ` · ${s.season}` : ''} · <span className={`pill ${STATUS_PILL[s.status]}`}>{ts(`status.${s.status}`)}</span></div></div>)}
          {!noTp.length && <p className="muted small mt-2">{t('devAllHaveTechPack')}</p>}
        </div>
      </div>
      <div className="card mt-4 tw" style={{ padding: 0 }}><div className="p-4 pb-2 flex items-center gap-2"><h2>{t('devRecent')}</h2><Link className="small ml-auto" href={`${base}/styles`}>{ts('title')}</Link></div>
        <table className="t stack"><thead><tr><th>{ts('colStyle')}</th><th>{ts('colCustomer')}</th><th>{ts('colStatus')}</th><th>{ts('colTechPack')}</th><th>{ts('colUpdated')}</th></tr></thead><tbody>
          {live.slice(0, 10).map((s) => <tr key={s.id}><td><Link href={`${base}/styles/${s.id}`} className="font-medium">{s.code}</Link> <span className="muted small">{s.name}</span></td><td data-l={ts('colCustomer')}>{s.customer?.name}</td><td data-l={ts('colStatus')}><span className={`pill ${STATUS_PILL[s.status]}`}>{ts(`status.${s.status}`)}</span></td><td data-l={ts('colTechPack')}>{sig.get(s.id)?.techPack ? <span className="pill ok">v{sig.get(s.id)!.techPack!.version}</span> : <span className="muted">—</span>}</td><td className="small muted">{new Date(s.updated_at).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' })}</td></tr>)}
          {!live.length && <tr><td colSpan={5} className="muted">{ts('none')} <Link href={`${base}/styles/new`}>{ts('new')}</Link></td></tr>}
        </tbody></table></div>
    </div>
  );
}
