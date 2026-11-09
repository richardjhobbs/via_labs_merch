// The style file: the record, the confirmed tech pack and its versions, records awaiting a check, every
// conversation on the style, the drafts waiting, and the ledger of what happened to it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { hasLlm, LANG_NAMES } from '@/lib/llm';
import { getStyle, STYLE_STATUSES, STATUS_PILL } from '@/lib/styles';
import { styleRecords, techPackVersions, diffTechPack } from '@/lib/records';
import { TechPackView } from '@/components/tech-pack-view';
import { PendingDraftCard } from '@/components/pending-draft';
import { UploadForm } from './upload-form';
import { StyleFields } from '../style-fields';
import { updateStyle, translateRecord } from '../actions';

export const maxDuration = 60;
const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];

export default async function StylePage({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string; error?: string; edit?: string }> }) {
  const { tenant: slug, id } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, tt] = await Promise.all([getTranslations('styles'), getTranslations('threads')]);
  const sb = await supabaseServer();
  const s = await getStyle(tenant.id, id, sb);
  if (!s) notFound();
  const [records, { data: threads }, { data: drafts }, { data: ledger }, { data: parties }] = await Promise.all([
    styleRecords(sb, tenant.id, id),
    sb.from('threads').select('id, subject, kind, last_message_at, summary, party_id, parties(name, kind)').eq('tenant_id', tenant.id).eq('style_id', id).order('last_message_at', { ascending: false }),
    sb.from('drafts').select('id, seq, title, body, body_en, lang, stream, gate_level, impact, priority, source_message_id, party_id').eq('tenant_id', tenant.id).eq('style_id', id).in('status', ['queued', 'escalated']).order('seq'),
    sb.from('ledger').select('id, at, actor, counterparty, stream, what, gate, gated').eq('tenant_id', tenant.id).eq('style_id', id).order('id', { ascending: false }).limit(30),
    sb.from('parties').select('id, name').eq('tenant_id', tenant.id).is('archived_at', null).in('kind', CUSTOMER).order('name'),
  ]);
  const tps = techPackVersions(records), latest = tps[0] || null, prev = tps[1] || null;
  const changes = diffTechPack(prev?.parsed || null, latest?.parsed || null);
  const pending = records.filter((r) => !r.confirmed_at), others = records.filter((r) => r.confirmed_at && r.kind !== 'tech_pack');
  const canEdit = membership.role !== 'viewer' && membership.id !== 'admin';
  const base = `/app/${slug}/styles/${id}`;
  const when = (x: string) => new Date(x).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const labels = { waiting: tt('pendingReply'), approve: tt('approve'), hold: tt('hold'), reject: tt('reject'), impact: tt('impact'), english: tt('english') };
  return (
    <div className="max-w-5xl">
      <Link href={`/app/${slug}/styles`} className="small">← {t('title')}</Link>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap"><h1>{s.code}</h1>{s.name && <span style={{ fontSize: 18 }}>{s.name}</span>}<span className={`pill ${STATUS_PILL[s.status]}`}>{t(`status.${s.status}`)}</span><span className="muted small">{[s.customer?.name, s.season, s.category].filter(Boolean).join(' · ')}</span>
        {canEdit && !q.edit && <Link className="btn sm ml-auto" href={`${base}?edit=1`}>{t('edit')}</Link>}</div>
      {q.saved && <div className="notice mt-3">{t('saved')}</div>}{q.error && <div className="notice crit mt-3">{q.error}</div>}
      {q.edit && canEdit && (
        <form action={updateStyle} className="card mt-4 grid gap-4"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} />
          <StyleFields s={s} customers={parties || []} currency={tenant.currency} />
          <label className="f"><span>{t('colStatus')}</span><select className="input" name="status" defaultValue={s.status} style={{ maxWidth: 260 }}>{STYLE_STATUSES.map((x) => <option key={x} value={x}>{t(`status.${x}`)}</option>)}</select></label>
          <div className="flex gap-2"><button className="btn primary">{t('save')}</button><Link className="btn" href={base}>{t('cancel')}</Link></div>
        </form>
      )}
      <div className="grid gap-4 mt-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid gap-4">
          {!!pending.length && <div className="card" style={{ borderLeft: '3px solid #c9a24a' }}><h2>{t('awaitingCheck', { n: pending.length })}</h2><p className="muted small mt-1">{t('awaitingNote')}</p>
            {pending.map((r) => <div key={r.id} className="small flex items-center gap-2 flex-wrap mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><span className="pill warn">{t(`kinds.${r.kind}`)}</span><b>{r.filename || r.title}</b><span className="muted">{r.created_by_name} · {when(r.created_at)}</span><Link className="btn primary sm ml-auto" href={`${base}/records/${r.id}`}>{t('check')}</Link></div>)}
          </div>}
          <div className="card">
            <div className="flex items-center gap-2 flex-wrap"><h2>{t('techPack')}</h2>{latest ? <span className="pill ok">v{latest.version}{latest.parsed?.version_label ? ` · ${latest.parsed.version_label}` : ''}</span> : <span className="muted small">{t('noTechPack')}</span>}
              {latest && <a className="btn sm ml-auto" href={`/api/records/file?id=${latest.id}`} target="_blank" rel="noopener">{t('openFile')}</a>}</div>
            {latest && !!changes.length && <div className="mt-3 p-3 small" style={{ background: 'var(--accent-soft)', borderRadius: 10 }}><b style={{ color: 'var(--accent)' }}>{t('changedSince', { v: prev!.version })}</b><ul className="mt-1 grid gap-1" style={{ paddingLeft: 18 }}>{changes.slice(0, 12).map((c, i) => <li key={i}><span className="muted">{t(`area.${c.area}`)}:</span> {c.what}</li>)}{changes.length > 12 && <li className="muted">{t('moreChanges', { n: changes.length - 12 })}</li>}</ul></div>}
            {latest?.parsed && <details className="mt-3" open={!changes.length}><summary className="small font-medium" style={{ cursor: 'pointer' }}>{t('showTechPack')}</summary><div className="mt-3"><TechPackView tp={latest.parsed} lang={Object.keys(latest.parsed.translations || {})[0]} /></div></details>}
            {latest && !latest.parsed && <p className="muted small mt-2">{t('notRead')}</p>}
            {latest?.parsed && canEdit && !!latest.parsed.construction.length && <form action={translateRecord} className="flex gap-2 items-center mt-3 small flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={id} /><input type="hidden" name="id" value={latest.id} />
              <span className="muted">{t('translateFor')}</span><select name="lang" className="input sm" style={{ width: 'auto' }} defaultValue={s.customer?.lang === 'zh' ? 'bn' : 'zh'}>{['zh', 'bn', 'vi', 'tr', 'es', 'pt', 'ur', 'hi', 'de', 'en'].map((l) => <option key={l} value={l}>{LANG_NAMES[l] || l}</option>)}</select><button className="btn sm">{t('translate')}</button>
              {!!Object.keys(latest.parsed.translations || {}).length && <span className="muted">{t('translated', { langs: Object.keys(latest.parsed.translations!).map((l) => LANG_NAMES[l] || l).join(', ') })}</span>}</form>}
            {tps.length > 1 && <div className="mt-3 small"><span className="muted">{t('versions')}:</span> {tps.map((r) => <Link key={r.id} className="pill mr-1" href={`${base}/records/${r.id}`}>v{r.version}{r.parsed?.version_label ? ` ${r.parsed.version_label}` : ''} · {new Date(r.confirmed_at!).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' })}</Link>)}</div>}
          </div>
          {!!others.length && <div className="card"><h2>{t('otherRecords')}</h2>{others.map((r) => <div key={r.id} className="small flex items-center gap-2 flex-wrap mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><span className="pill">{t(`kinds.${r.kind}`)}</span><Link href={`${base}/records/${r.id}`}>{r.title || r.filename}</Link><span className="muted">v{r.version} · {r.created_by_name} · {when(r.created_at)}</span>{r.storage_path && <a className="small ml-auto" href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">{t('openFile')}</a>}</div>)}</div>}
          {canEdit && <UploadForm tenant={slug} styleId={id} live={hasLlm()} />}
          <div className="card"><div className="flex items-center gap-2"><h2>{t('styleFile')}</h2><span className="muted small">{t('fileCount', { n: threads?.length || 0 })}</span></div>
            {!threads?.length && <p className="muted small mt-2">{t('noConversations')}</p>}
            {(threads || []).map((th) => { const p = th.parties as unknown as { name: string; kind: string } | null; return <div key={th.id} className="small mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><div className="flex items-center gap-2 flex-wrap"><span className={`pill ${CUSTOMER.includes(p?.kind || '') ? 'agent' : ''}`}>{p?.name || '—'}</span><Link href={`/app/${slug}/threads/${th.id}`}>{th.subject || tt('conversation')}</Link><span className="muted ml-auto">{th.last_message_at ? when(th.last_message_at) : ''}</span></div>{th.summary && <div className="muted mt-1">{th.summary.slice(0, 200)}</div>}</div>; })}
            {(drafts || []).map((d) => <div key={d.id} className="grid mt-3"><PendingDraftCard slug={slug} back={base} d={d} labels={labels} /></div>)}
          </div>
        </div>
        <div className="grid gap-4" style={{ alignContent: 'start' }}>
          <div className="card small"><h3>{t('details')}</h3><dl className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
            <dt className="muted">{t('fCustomer')}</dt><dd>{s.customer?.name || '—'}</dd><dt className="muted">{t('fSeason')}</dt><dd>{s.season || '—'}</dd><dt className="muted">{t('fCategory')}</dt><dd>{s.category || '—'}</dd>
            <dt className="muted">{t('fTargetPrice')}</dt><dd>{s.target_price != null ? `${s.currency} ${s.target_price}` : '—'}</dd><dt className="muted">{t('fTargetDelivery')}</dt><dd>{s.target_delivery || '—'}</dd><dt className="muted">{t('fPlmRef')}</dt><dd style={{ overflowWrap: 'anywhere' }}>{s.plm_ref ? (/^https?:/.test(s.plm_ref) ? <a href={s.plm_ref} target="_blank" rel="noopener">{t('openPlm')}</a> : s.plm_ref) : '—'}</dd>
          </dl>{s.description && <p className="mt-2">{s.description}</p>}</div>
          <div className="card small"><h3>{t('ledger')}</h3>
            {(ledger || []).map((r) => <div key={r.id} className="mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}><div className="muted">{when(r.at)} · {r.actor}{r.stream ? ` · ${r.stream}` : ''}</div><div>{r.what}</div></div>)}
            {!ledger?.length && <p className="muted mt-2">{t('noLedger')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
