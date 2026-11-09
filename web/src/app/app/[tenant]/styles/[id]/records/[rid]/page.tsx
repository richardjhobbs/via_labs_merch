// One record: what the model read, against the previous confirmed version, and the person's confirmation.
// Confirmed records are read-only here (a change is a new version).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { LANG_NAMES } from '@/lib/llm';
import { getStyle } from '@/lib/styles';
import { styleRecords, techPackVersions, diffTechPack, RECORD_KINDS, type RecordRow } from '@/lib/records';
import { TechPackView } from '@/components/tech-pack-view';
import { confirmRecord, discardRecord } from '../../../actions';

export const maxDuration = 60;

export default async function RecordPage({ params, searchParams }: { params: Promise<{ tenant: string; id: string; rid: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug, id, rid } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('styles');
  const sb = await supabaseServer();
  const s = await getStyle(tenant.id, id, sb);
  if (!s) notFound();
  const records = await styleRecords(sb, tenant.id, id);
  const r = records.find((x) => x.id === rid) as RecordRow | undefined;
  if (!r) notFound();
  const tps = techPackVersions(records);
  // compare with the latest confirmed tech pack (for a pending one) or with the version it superseded
  const against = r.confirmed_at ? tps.find((x) => x.id === r.supersedes_id) || null : r.kind === 'tech_pack' ? tps[0] || null : null;
  const changes = r.parsed && against?.parsed ? diffTechPack(against.parsed, r.parsed) : [];
  const canEdit = membership.role !== 'viewer' && membership.id !== 'admin';
  const base = `/app/${slug}/styles/${id}`;
  const tp = r.parsed;
  return (
    <div className="max-w-5xl">
      <Link href={base} className="small">← {s.code}{s.name ? ` ${s.name}` : ''}</Link>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap"><h1>{r.confirmed_at ? `${t(`kinds.${r.kind}`)} v${r.version}` : t('checkTitle')}</h1>{r.confirmed_at ? <span className="pill ok">{t('confirmedOn', { date: new Date(r.confirmed_at).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' }) })}</span> : <span className="pill warn">{t('unconfirmed')}</span>}
        {r.storage_path && <a className="btn sm ml-auto" href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">{t('openFile')}</a>}</div>
      <p className="muted small mt-1">{r.filename}{r.bytes ? ` · ${(r.bytes / 1048576).toFixed(1)} MB` : ''} · {t(`sources.${r.source}`)} · {r.created_by_name} · {new Date(r.created_at).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
      {q.saved && <div className="notice mt-3">{t('saved')}</div>}{q.error && <div className="notice crit mt-3">{q.error}</div>}
      {r.read_status === 'pending' && <><meta httpEquiv="refresh" content="6" /><div className="notice mt-3 small">{t('reading')}</div></>}
      {r.read_status === 'failed' && <div className="notice crit mt-3 small">{t('readFailed')}</div>}
      {!r.confirmed_at && r.read_status !== 'pending' && <div className="notice mt-3 small">{tp ? t('checkIntro') : t('checkIntroNotRead')}</div>}
      <div className="grid gap-4 mt-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          {!!changes.length && <div className="card" style={{ background: 'var(--accent-soft)' }}><b className="small" style={{ color: 'var(--accent)' }}>{r.confirmed_at ? t('changedSince', { v: against!.version }) : t('changesVsLatest', { v: against!.version })}</b><ul className="mt-1 grid gap-1 small" style={{ paddingLeft: 18 }}>{changes.map((c, i) => <li key={i}><span className="muted">{t(`area.${c.area}`)}:</span> {c.what}</li>)}</ul></div>}
          {against && !changes.length && tp && <div className="notice small">{t('noChanges', { v: against.version })}</div>}
          {!tp && <div className="card"><p className="muted small">{r.read_status === 'pending' ? t('reading') : t('notRead')}</p></div>}
        </div>
        <div className="grid gap-4" style={{ alignContent: 'start' }}>
          {!r.confirmed_at && canEdit && r.read_status !== 'pending' && (
            <form action={confirmRecord} className="card grid gap-3"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={id} /><input type="hidden" name="id" value={r.id} />
              <h2>{t('confirmTitle')}</h2>
              <label className="f"><span>{t('recordKind')}</span><select className="input" name="kind" defaultValue={r.kind}>{RECORD_KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></label>
              <label className="f"><span>{t('fTitle')}</span><input className="input" name="title" maxLength={200} defaultValue={r.title || r.filename || ''} /></label>
              <label className="f"><span>{t('fVersionLabel')}</span><input className="input" name="version_label" maxLength={60} defaultValue={tp?.version_label || ''} placeholder="v3, Rev B, 2026-11-09" /></label>
              <label className="f"><span>{t('fLang')}</span><select className="input" name="lang" defaultValue={tp?.lang || r.lang || 'en'}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="f"><span>{t('fNote')}</span><input className="input" name="note" maxLength={500} placeholder={t('fNoteHint')} /></label>
              <p className="muted small">{tps.length ? t('willBeVersion', { v: (tps[0]?.version || 0) + 1, prev: tps[0]?.version || 0 }) : t('willBeFirst')}</p>
              <div className="flex gap-2 flex-wrap"><button className="btn primary">{t('confirm')}</button><button className="btn red" formAction={discardRecord}>{t('discard')}</button></div>
            </form>
          )}
          {r.confirmed_at && <div className="card small"><h3>{t('details')}</h3><dl className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}><dt className="muted">{t('recordKind')}</dt><dd>{t(`kinds.${r.kind}`)}</dd><dt className="muted">{t('fTitle')}</dt><dd>{r.title}</dd><dt className="muted">{t('fLang')}</dt><dd>{r.lang ? LANG_NAMES[r.lang] || r.lang : '—'}</dd>{against && <><dt className="muted">{t('supersedes')}</dt><dd><Link href={`${base}/records/${against.id}`}>v{against.version}</Link></dd></>}</dl></div>}
        </div>
      </div>
      {tp && <div className="card mt-4"><TechPackView tp={tp} lang={Object.keys(tp.translations || {})[0]} /></div>}
    </div>
  );
}
