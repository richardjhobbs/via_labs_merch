// One of the partner's own styles in the shared portal: the confirmed tech pack, its versions, the sample rounds
// with their state and decision, the schedule and the photos and comments posted here. Reads run under RLS
// (merch.partner_style_ok): costings, materials, pending records, conversations and the ledger never reach it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { getStyle, STATUS_PILL } from '@/lib/styles';
import { styleRecords, techPackVersions, isComment } from '@/lib/records';
import { listSamples, listDevMilestones, sampleState, STATE_PILL } from '@/lib/samples';
import { computeDevPath } from '@/lib/dev-path';
import { isoOf } from '@/lib/core/path';
import { TechPackView } from '@/components/tech-pack-view';

export default async function SharedStyle({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: slug, id } = await params;
  const { tenant, membership } = await requireTenant(slug, { partner: true });
  const [t, ts, tsm, tsc] = await Promise.all([getTranslations('partners'), getTranslations('styles'), getTranslations('samples'), getTranslations('schedule')]);
  const sb = await supabaseServer();
  const s = await getStyle(tenant.id, id, sb);
  if (!s) notFound();
  const mine = membership.role === 'partner' ? membership.scopes?.parties || [] : [];
  if (membership.role === 'partner' && (!s.customer || !mine.includes(s.customer.id))) notFound();
  const [records, samples, milestones] = await Promise.all([styleRecords(sb, tenant.id, id), listSamples(tenant.id, { styleId: id }, sb), listDevMilestones(tenant.id, id, sb)]);
  const tps = techPackVersions(records), latest = tps[0] || null;
  const posted = records.filter((r) => r.source === 'portal' && !r.sample_id);
  const files = records.filter((r) => r.confirmed_at && r.kind !== 'tech_pack' && r.source !== 'portal');
  const points = computeDevPath(milestones);
  const d = (x: string | null) => (x ? new Date(x + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' }) : '—');
  const dn = (n: number | undefined) => (n == null ? '—' : d(isoOf(n)));
  const when = (x: string) => new Date(x).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const PILL: Record<string, string> = { done: 'ok', late: 'crit', risk: 'warn', due: 'agent', pending: '' };
  const base = `/app/${slug}/shared/styles/${id}`;
  return (
    <div className="max-w-5xl">
      <div className="small"><Link href={`/app/${slug}/shared`}>{t('back')}</Link></div>
      <div className="flex items-baseline gap-3 mt-1 flex-wrap"><h1>{s.code}</h1>{s.name && <span style={{ fontSize: 18 }}>{s.name}</span>}<span className={`pill ${STATUS_PILL[s.status]}`}>{ts(`status.${s.status}`)}</span><span className="muted small">{[s.season, s.category].filter(Boolean).join(' · ')}</span></div>
      <p className="muted small mt-1">{t('styleSub', { company: tenant.name })}</p>
      <div className="grid gap-4 mt-4">
        <div className="card">
          <div className="flex items-center gap-2 flex-wrap"><h2>{tsm('title')}</h2><span className="muted small">{tsm('count', { n: samples.length })}</span></div>
          {!samples.length && <p className="muted small mt-2">{tsm('none')}</p>}
          {!!samples.length && <div className="tw mt-2"><table className="t stack"><thead><tr><th>{tsm('colRound')}</th><th>{tsm('colDue')}</th><th>{tsm('colSent')}</th><th>{tsm('colReceived')}</th><th>{tsm('colState')}</th></tr></thead><tbody>
            {samples.map((x) => { const st = sampleState(x); return <tr key={x.id}><td><Link href={`${base}/samples/${x.id}`} className="font-medium">{tsm(`type.${x.type}`)} R{x.round}</Link>{x.size && <span className="muted small"> · {x.size}</span>}{x.colourway && <span className="muted small"> · {x.colourway}</span>}</td><td data-l={tsm('colDue')} className="small">{d(x.due_at)}</td><td data-l={tsm('colSent')} className="small">{d(x.sent_at)}{x.awb && <div className="muted">{x.courier} {x.awb}</div>}</td><td data-l={tsm('colReceived')} className="small">{d(x.received_at)}</td><td data-l={tsm('colState')}><span className={`pill ${STATE_PILL[st]}`}>{tsm(`state.${st}`)}</span>{x.decision && x.decided_by_name ? <div className="muted small">{x.decided_by_name}</div> : null}</td></tr>; })}
          </tbody></table></div>}
        </div>
        {!!points.length && <div className="card"><h2>{tsc('title')}</h2><div className="tw mt-2"><table className="t stack"><thead><tr><th>{tsc('colStep')}</th><th>{tsc('colPlan')}</th><th>{tsc('colForecast')}</th><th>{tsc('colStatus')}</th></tr></thead><tbody>
          {points.map((p) => <tr key={p.key}><td className="font-medium">{p.label}</td><td data-l={tsc('colPlan')} className="small">{dn(p.plan)}</td><td data-l={tsc('colForecast')} className="small">{p.status === 'done' ? dn(p.actual) : dn(p.f)}</td><td data-l={tsc('colStatus')}><span className={`pill ${PILL[p.status]}`}>{tsc(`status.${p.status}`)}</span></td></tr>)}
        </tbody></table></div></div>}
        <div className="card">
          <div className="flex items-center gap-2 flex-wrap"><h2>{ts('techPack')}</h2>{latest ? <span className="pill ok">v{latest.version}{latest.parsed?.version_label ? ` · ${latest.parsed.version_label}` : ''}</span> : <span className="muted small">{ts('noTechPack')}</span>}{latest && <a className="btn sm ml-auto" href={`/api/records/file?id=${latest.id}`} target="_blank" rel="noopener">{ts('openFile')}</a>}</div>
          {latest?.parsed && <details className="mt-3"><summary className="small font-medium" style={{ cursor: 'pointer' }}>{ts('showTechPack')}</summary><div className="mt-3"><TechPackView tp={latest.parsed} /></div></details>}
          {tps.length > 1 && <div className="mt-3 small"><span className="muted">{ts('versions')}:</span> {tps.map((r) => <a key={r.id} className="pill mr-1" href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">v{r.version}{r.parsed?.version_label ? ` ${r.parsed.version_label}` : ''} · {d(r.confirmed_at!.slice(0, 10))}</a>)}</div>}
        </div>
        {!!(files.length || posted.length) && <div className="card"><h2>{t('filesAndComments')}</h2>
          {files.map((r) => <div key={r.id} className="small flex items-center gap-2 flex-wrap mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><span className="pill">{ts(`kinds.${r.kind}`)}</span><span>{r.title || r.filename}</span><span className="muted">v{r.version} · {when(r.created_at)}</span>{r.storage_path && <a className="small ml-auto" href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">{ts('openFile')}</a>}</div>)}
          {posted.map((r) => <div key={r.id} className="small mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><div className="muted">{r.created_by_name} · {when(r.created_at)}</div>{isComment(r.parsed) ? <div style={{ whiteSpace: 'pre-wrap' }}>{r.parsed.text}</div> : <a href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">{r.title || r.filename}</a>}</div>)}
        </div>}
      </div>
      <p className="muted small mt-6" style={{ maxWidth: '76ch' }}>{t('stylePrivacy', { company: tenant.name })}</p>
    </div>
  );
}
