// One sample round: what was requested, sent and received; the measurements against the spec of the tech pack
// version it was made to; comments and the decision. The decision is a person's action, here only.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { getStyle } from '@/lib/styles';
import { styleRecords, techPackVersions } from '@/lib/records';
import { getSample, sampleMeasurements, sampleState, specRows, STATE_PILL, DECISIONS, DECISION_SOURCES, DECISION_PILL } from '@/lib/samples';
import { updateSampleEvents, reviewSample } from '../../sample-actions';

const MAKERS = ['factory', 'sample_room', 'mill', 'trim_supplier', 'other'];

export default async function SamplePage({ params, searchParams }: { params: Promise<{ tenant: string; id: string; sid: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug, id, sid } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, ts] = await Promise.all([getTranslations('samples'), getTranslations('styles')]);
  const sb = await supabaseServer();
  const [s, smp] = await Promise.all([getStyle(tenant.id, id, sb), getSample(tenant.id, sid, sb)]);
  if (!s || !smp || smp.style_id !== id) notFound();
  const [records, measured, { data: parties }, { data: ledger }, { data: photos }] = await Promise.all([
    styleRecords(sb, tenant.id, id),
    sampleMeasurements(sb, sid),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).is('archived_at', null).in('kind', MAKERS).order('name'),
    sb.from('ledger').select('id, at, actor, what, gate').eq('tenant_id', tenant.id).eq('style_id', id).contains('ref', { sample_id: sid }).order('id', { ascending: false }).limit(20),
    sb.from('records').select('id, kind, filename, title, created_at, created_by_name').eq('tenant_id', tenant.id).eq('sample_id', sid).order('created_at', { ascending: false }),
  ]);
  const tps = techPackVersions(records);
  const against = tps.find((r) => r.id === smp.against_record_id) || tps[0] || null;
  const spec = specRows(against?.parsed || null, smp.size);
  // the grid: saved measurements when there are any, else the spec rows ready to be measured
  const grid = measured.length ? measured.map((m) => ({ code: m.pom_code, name: m.pom_name, spec: m.spec, tolm: m.tol_minus, tolp: m.tol_plus, measured: m.measured, unit: m.unit, pass: m.pass, comment: m.comment })) : spec.map((p) => ({ code: p.pom_code, name: p.pom_name, spec: p.spec, tolm: p.tol_minus, tolp: p.tol_plus, measured: null as number | null, unit: p.unit, pass: null as boolean | null, comment: null as string | null }));
  const fails = measured.filter((m) => m.pass === false).length;
  const state = sampleState(smp);
  const canEdit = membership.role !== 'viewer' && membership.id !== 'admin';
  const base = `/app/${slug}/styles/${id}`;
  const when = (x: string) => new Date(x).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="max-w-5xl">
      <Link href={base} className="small">← {s.code}{s.name ? ` ${s.name}` : ''}</Link>
      <div className="flex items-baseline gap-3 mt-2 flex-wrap"><h1>{t(`type.${smp.type}`)} R{smp.round}</h1>{smp.size && <span className="pill">{smp.size}</span>}{smp.colourway && <span className="pill">{smp.colourway}</span>}<span className={`pill ${STATE_PILL[state]}`}>{t(`state.${state}`)}</span><span className="muted small">{smp.maker?.name || ''}{against ? ` · ${ts('techPack')} v${against.version}` : ''}</span></div>
      {q.saved && <div className="notice mt-3">{ts('saved')}</div>}{q.error && <div className="notice crit mt-3">{q.error}</div>}
      {smp.decision && <div className={`notice mt-3 ${DECISION_PILL[smp.decision] === 'crit' ? 'crit' : DECISION_PILL[smp.decision] === 'warn' ? 'warn' : ''}`}><b>{t(`decision.${smp.decision}`)}</b> · {smp.decided_by_name}{smp.reviewed_at ? ` · ${when(smp.reviewed_at)}` : ''}</div>}
      <div className="grid gap-4 mt-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <div className="card">
            <div className="flex items-center gap-2 flex-wrap"><h2>{t('measurements')}</h2><span className="muted small">{against ? t('againstSpec', { v: against.version, size: smp.size || against.parsed?.poms[0]?.base_size || '' }) : t('noSpec')}</span>{measured.length ? <span className={`pill ${fails ? 'crit' : 'ok'}`}>{t('fails', { n: fails })}</span> : null}</div>
            <form action={reviewSample} className="mt-3 grid gap-3"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={id} /><input type="hidden" name="id" value={sid} /><input type="hidden" name="m_count" value={grid.length} />
              {!!grid.length && <div className="tw"><table className="t" style={{ minWidth: 640 }}><thead><tr><th>{t('pomCode')}</th><th>{t('pomName')}</th><th className="text-right">{t('spec')}</th><th className="text-right">{t('tol')}</th><th>{t('measured')}</th><th>{t('result')}</th><th>{t('comment')}</th></tr></thead><tbody>
                {grid.map((r, i) => <tr key={i}><td className="mono muted small" style={{ whiteSpace: 'nowrap' }}>{r.code}<input type="hidden" name={`m_${i}_code`} value={r.code || ''} /><input type="hidden" name={`m_${i}_name`} value={r.name} /><input type="hidden" name={`m_${i}_spec`} value={r.spec ?? ''} /><input type="hidden" name={`m_${i}_tolm`} value={r.tolm ?? ''} /><input type="hidden" name={`m_${i}_tolp`} value={r.tolp ?? ''} /><input type="hidden" name={`m_${i}_unit`} value={r.unit || ''} /></td>
                  <td className="small" style={{ minWidth: 160 }}>{r.name}</td><td className="text-right small" style={{ whiteSpace: 'nowrap' }}>{r.spec ?? '—'}{r.unit ? ` ${r.unit}` : ''}</td><td className="text-right small muted" style={{ whiteSpace: 'nowrap' }}>{r.tolm != null || r.tolp != null ? `−${r.tolm ?? 0} / +${r.tolp ?? 0}` : '—'}</td>
                  <td>{canEdit ? <input className="input sm" name={`m_${i}_measured`} inputMode="decimal" defaultValue={r.measured ?? ''} style={{ width: 84 }} /> : <span className="small">{r.measured ?? '—'}</span>}</td>
                  <td>{r.pass == null ? <span className="muted small">—</span> : <span className={`pill ${r.pass ? 'ok' : 'crit'}`}>{r.pass ? t('pass') : t('fail')}</span>}</td>
                  <td>{canEdit ? <input className="input sm" name={`m_${i}_comment`} defaultValue={r.comment || ''} maxLength={300} /> : <span className="small">{r.comment}</span>}</td></tr>)}
              </tbody></table></div>}
              {!grid.length && <p className="muted small">{t('noPoms')}</p>}
              <label className="f"><span>{t('comments')}</span><textarea className="input" name="comments" rows={4} maxLength={4000} defaultValue={smp.comments || ''} placeholder={t('commentsHint')} readOnly={!canEdit} /></label>
              {canEdit && <div className="grid gap-3 p-3" style={{ background: 'var(--paper)', borderRadius: 10 }}>
                <div className="small font-medium">{t('decisionTitle')}</div>
                <p className="muted small" style={{ margin: 0 }}>{t('decisionNote')}</p>
                <div className="flex gap-3 flex-wrap small">{DECISIONS.map((d) => <label key={d} className="flex items-center gap-1"><input type="radio" name="decision" value={d} defaultChecked={smp.decision === d} />{t(`decision.${d}`)}</label>)}<label className="flex items-center gap-1"><input type="radio" name="decision" value="" defaultChecked={!smp.decision} />{t('decision.none')}</label></div>
                <div className="flex gap-2 flex-wrap items-end"><label className="f" style={{ margin: 0 }}><span>{t('decidedBy')}</span><select className="input sm" name="decision_source" defaultValue={smp.decision_source || 'workspace'}>{DECISION_SOURCES.map((x) => <option key={x} value={x}>{t(`source.${x}`)}</option>)}</select></label><label className="f" style={{ margin: 0, flex: '1 1 200px' }}><span>{t('customerName')}</span><input className="input sm" name="decided_by_name" maxLength={160} placeholder={t('customerNameHint')} /></label></div>
                <div><button className="btn primary">{t('saveReview')}</button></div>
              </div>}
            </form>
          </div>
          {!!photos?.length && <div className="card"><h2>{t('photos')}</h2>{photos.map((p) => <div key={p.id} className="small mt-2"><span className="pill">{ts(`kinds.${p.kind}`)}</span> <a href={`/api/records/file?id=${p.id}`} target="_blank" rel="noopener">{p.title || p.filename}</a> <span className="muted">· {p.created_by_name} · {when(p.created_at)}</span></div>)}</div>}
        </div>
        <div className="grid gap-4" style={{ alignContent: 'start' }}>
          <form action={updateSampleEvents} className="card small grid gap-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={id} /><input type="hidden" name="id" value={sid} />
            <h3>{t('events')}</h3>
            <label className="f"><span>{t('fMaker')}</span><select className="input sm" name="maker_party_id" defaultValue={smp.maker_party_id || ''} disabled={!canEdit}><option value="">—</option>{(parties || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f"><span>{t('requested')}</span><input className="input sm" value={smp.requested_at || ''} readOnly /></label>
              <label className="f"><span>{t('fDue')}</span><input className="input sm" type="date" name="due_at" defaultValue={smp.due_at || ''} readOnly={!canEdit} /></label>
              <label className="f"><span>{t('sent')}</span><input className="input sm" type="date" name="sent_at" defaultValue={smp.sent_at || ''} readOnly={!canEdit} /></label>
              <label className="f"><span>{t('received')}</span><input className="input sm" type="date" name="received_at" defaultValue={smp.received_at || ''} readOnly={!canEdit} /></label>
              <label className="f"><span>{t('courier')}</span><input className="input sm" name="courier" defaultValue={smp.courier || ''} maxLength={60} placeholder="DHL" readOnly={!canEdit} /></label>
              <label className="f"><span>{t('awb')}</span><input className="input sm mono" name="awb" defaultValue={smp.awb || ''} maxLength={80} readOnly={!canEdit} /></label>
            </div>
            <label className="f"><span>{t('fNote')}</span><input className="input sm" name="note" defaultValue={smp.note || ''} maxLength={500} readOnly={!canEdit} /></label>
            {canEdit && <div><button className="btn sm">{t('saveEvents')}</button></div>}
          </form>
          <div className="card small"><h3>{ts('ledger')}</h3>{(ledger || []).map((r) => <div key={r.id} className="mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}><div className="muted">{when(r.at)} · {r.actor}</div><div>{r.what}</div></div>)}{!ledger?.length && <p className="muted mt-2">{ts('noLedger')}</p>}</div>
        </div>
      </div>
    </div>
  );
}
