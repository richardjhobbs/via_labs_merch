// Approval queue: drafts the agents prepared, waiting for a person.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { approveDraft, rejectDraft } from './actions';

export default async function Queue({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const scope = scopeOf(membership);
  const t = await getTranslations('queue');
  const sb = await supabaseServer();
  const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const [{ data: draftsAll }, { data: decided }] = await Promise.all([
    sb.from('drafts').select('id, seq, priority, stream, title, impact, body, body_en, lang, gate_level, status, created_at, party_id, orders(po, customer_id), parties(name, short, channel_pref), source:messages!drafts_source_message_id_fkey(sender_name, from_addr, text_en, text)').eq('tenant_id', tenant.id).in('status', ['queued', 'escalated']).order('priority').order('seq'),
    sb.from('drafts').select('id, seq, title, status, decided_at, decision_note, orders(po)').eq('tenant_id', tenant.id).in('status', ['approved', 'sent', 'rejected']).gte('decided_at', since).order('decided_at', { ascending: false }).limit(20),
  ]);
  const drafts = (draftsAll || []).filter((d) => !scope || (d.parties && scope.includes(d.party_id as string)) || scope.includes((d.orders as unknown as { customer_id: string } | null)?.customer_id || ''));
  const P = ['', 'crit', 'warn', ''];
  return (
    <div className="max-w-5xl">
      <h1>{t('title')}</h1>
      <p className="muted mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {q.error && <div className="notice crit mt-4">{q.error}</div>}
      {q.saved && <div className="notice ok mt-4">{t('approvedNote')}</div>}
      <div className="grid gap-4 mt-6">
        {!drafts?.length && <div className="card muted">{t('empty')}</div>}
        {(drafts || []).map((d) => {
          const po = (d.orders as unknown as { po: string; customer_id: string } | null)?.po, party = d.parties as unknown as { name: string; short: string | null; channel_pref: string | null } | null, src = d.source as unknown as { sender_name: string | null; from_addr: string | null; text_en: string | null; text: string } | null;
          return (
            <div key={d.id} className="card" style={{ borderLeft: `3px solid ${d.priority === 1 ? 'var(--crit)' : d.priority === 2 ? '#c9a24a' : 'var(--line)'}` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="mono small muted">Q-{d.seq}</span>
                <span className={`pill ${P[d.priority] || ''}`}>P{d.priority}</span>
                <span className="pill">{d.stream}</span>
                <span className="pill agent">L{d.gate_level}</span>
                {po && <Link className="pill" href={`/app/${slug}/orders/${encodeURIComponent(po)}`}>PO {po}</Link>}
                <span className="ml-auto small muted">{new Date(d.created_at).toLocaleString('en-GB', { timeZone: tenant.tz })}</span>
              </div>
              <h2 className="mt-2" style={{ fontSize: 16 }}>{d.title}</h2>
              {d.impact && <div className="small mt-1" style={{ color: 'var(--fg2)' }}><span className="muted">{t('impact')}:</span> {d.impact}</div>}
              <div className="small mt-1"><span className="muted">{t('to')}:</span> {party?.name || '—'}{party?.channel_pref ? ` · ${party.channel_pref}` : ''}</div>
              {src && <details className="small mt-2"><summary className="muted" style={{ cursor: 'pointer' }}>{t('source')} {src.sender_name || src.from_addr}</summary><blockquote className="mt-1 pl-3" style={{ borderLeft: '2px solid var(--line)', whiteSpace: 'pre-wrap', color: 'var(--fg2)' }}>{src.text_en || src.text}</blockquote></details>}
              <form action={approveDraft} className="mt-3 grid gap-2">
                <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={d.id} />
                <label className="small muted">{t('body')}{d.lang && d.lang !== 'en' ? ` (${d.lang})` : ''}</label>
                <textarea name="body" defaultValue={d.body} rows={Math.min(12, Math.max(4, d.body.split('\n').length + 1))} className="input mono" style={{ fontSize: 13 }} />
                {d.body_en && d.lang !== 'en' && <details className="small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('bodyEn')}</summary><pre className="mt-1 p-2" style={{ whiteSpace: 'pre-wrap', background: 'var(--paper)', borderRadius: 8, fontFamily: 'inherit' }}>{d.body_en}</pre></details>}
                <div className="flex gap-2 flex-wrap items-center">
                  <button className="btn primary sm" name="intent" value="approve">{t('approve')}</button>
                  <button className="btn sm" formAction={rejectDraft}>{t('reject')}</button>
                  <input name="note" className="input sm" placeholder={t('note')} style={{ maxWidth: 320 }} />
                </div>
              </form>
            </div>
          );
        })}
      </div>
      {!!decided?.length && (
        <div className="mt-8">
          <h2 style={{ fontSize: 15 }}>{t('decided')}</h2>
          <div className="card tw mt-2" style={{ padding: 0 }}><table className="t"><tbody>
            {decided.map((d) => <tr key={d.id}><td className="mono small muted">Q-{d.seq}</td><td>{d.title}</td><td className="small muted">{(d.orders as unknown as { po: string } | null)?.po}</td><td><span className={`pill ${d.status === 'rejected' ? 'crit' : 'ok'}`}>{d.status}</span></td><td className="small muted">{d.decision_note}</td><td className="small muted">{d.decided_at ? new Date(d.decided_at).toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' }) : ''}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}
