// Mira's morning brief on My day: the company brief for owners and managers, a desk's own brief for the
// senior merchandiser who runs it. Written once a day after 07:00 company time by lib/agents/manager.ts.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';

type B = { headline: string; sections: { title: string; lines: string[] }[]; top_actions: { what: string; who: string; po: string | null }[] };

export async function MorningBrief({ slug, tenantId, membershipId, role, tz }: { slug: string; tenantId: string; membershipId: string; role: string; tz: string }) {
  const t = await getTranslations('day.brief');
  const sb = await supabaseServer();
  const manager = ['owner', 'manager'].includes(role);
  const { data: agents } = await sb.from('agents').select('id, name, layer, person_id').eq('tenant_id', tenantId).eq('track', 'production').eq('status', 'active').in('layer', manager ? ['manager'] : ['desk']);
  const mine = (agents || []).filter((a) => manager || a.person_id === membershipId);
  if (!mine.length) return null;
  const { data: rows } = await sb.from('agent_memory').select('agent_id, brief, created_at').in('agent_id', mine.map((a) => a.id)).is('order_id', null).order('version', { ascending: false }).limit(mine.length * 2);
  const latest = mine.map((a) => ({ a, m: (rows || []).find((r) => r.agent_id === a.id) })).filter((x) => x.m);
  if (!latest.length) return null;
  return (
    <>{latest.map(({ a, m }) => { const b = m!.brief as B; return (
      <div key={a.id} className="card mt-4" style={{ borderLeft: '3px solid var(--accent)' }}>
        <div className="flex items-center gap-2 flex-wrap"><span className="pill agent">{a.name.slice(0, 1)}</span><h2>{manager ? t('title', { name: a.name }) : t('desk', { name: a.name })}</h2><span className="muted small ml-auto">{new Date(m!.created_at).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
        <p className="mt-2 font-medium">{b.headline}</p>
        {!!b.top_actions?.length && <ol className="mt-2 grid gap-1 small" style={{ paddingLeft: 18, listStyle: 'decimal' }}>{b.top_actions.map((x, i) => <li key={i}>{x.po ? <Link className="mono" href={`/app/${slug}/orders/${encodeURIComponent(x.po)}`}>PO {x.po}</Link> : null}{x.po ? ' · ' : ''}{x.what} <span className="muted">· {x.who}</span></li>)}</ol>}
        {!!b.sections?.length && <details className="mt-2 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('byDesk')}</summary>
          {b.sections.map((sct, i) => <div key={i} className="mt-2"><b>{sct.title}</b><ul className="mt-1 grid gap-1" style={{ color: 'var(--fg2)' }}>{sct.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}</details>}
      </div>); })}</>
  );
}
