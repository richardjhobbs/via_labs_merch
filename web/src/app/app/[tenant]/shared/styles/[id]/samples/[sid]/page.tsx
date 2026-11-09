// One sample round in the shared portal: what was sent and received, the measurements against the spec, the
// merchandiser's comments and the decision, the comments and photos the partner's people posted, and the form
// to post one. A partner comments; the decision stays with the people in the workspace.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { getStyle } from '@/lib/styles';
import { styleRecords, isComment } from '@/lib/records';
import { getSample, sampleMeasurements, sampleState, STATE_PILL, DECISION_PILL } from '@/lib/samples';
import { partnerComment } from '../../../../actions';

export default async function SharedSample({ params, searchParams }: { params: Promise<{ tenant: string; id: string; sid: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { tenant: slug, id, sid } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug, { partner: true });
  const [t, ts, tsm] = await Promise.all([getTranslations('partners'), getTranslations('styles'), getTranslations('samples')]);
  const sb = await supabaseServer();
  const [s, smp] = await Promise.all([getStyle(tenant.id, id, sb), getSample(tenant.id, sid, sb)]);
  if (!s || !smp || smp.style_id !== id) notFound();
  const mine = membership.role === 'partner' ? membership.scopes?.parties || [] : [];
  if (membership.role === 'partner' && (!s.customer || !mine.includes(s.customer.id))) notFound();
  const [records, measured] = await Promise.all([styleRecords(sb, tenant.id, id), sampleMeasurements(sb, sid)]);
  const against = records.find((r) => r.id === smp.against_record_id) || null;
  const onRound = records.filter((r) => r.sample_id === sid);
  const fails = measured.filter((m) => m.pass === false).length;
  const state = sampleState(smp);
  const d = (x: string | null) => (x ? new Date(x + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short' }) : '—');
  const when = (x: string) => new Date(x).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const canPost = membership.role === 'partner';
  return (
    <div className="max-w-4xl">
      <div className="small"><Link href={`/app/${slug}/shared/styles/${id}`}>← {s.code}{s.name ? ` ${s.name}` : ''}</Link></div>
      <div className="flex items-baseline gap-3 mt-1 flex-wrap"><h1>{tsm(`type.${smp.type}`)} R{smp.round}</h1>{smp.size && <span className="pill">{smp.size}</span>}{smp.colourway && <span className="pill">{smp.colourway}</span>}<span className={`pill ${STATE_PILL[state]}`}>{tsm(`state.${state}`)}</span>{against && <span className="muted small">{ts('techPack')} v{against.version}</span>}</div>
      <p className="muted small mt-1">{tsm('fDue')} {d(smp.due_at)} · {tsm('sent')} {d(smp.sent_at)}{smp.awb ? ` (${smp.courier || ''} ${smp.awb})` : ''} · {tsm('received')} {d(smp.received_at)}</p>
      {q.saved && <div className="notice ok mt-3">{t('commentPosted')}</div>}{q.error && <div className="notice crit mt-3">{q.error}</div>}
      {smp.decision && <div className={`notice mt-3 ${DECISION_PILL[smp.decision] === 'crit' ? 'crit' : DECISION_PILL[smp.decision] === 'warn' ? 'warn' : ''}`}><b>{tsm(`decision.${smp.decision}`)}</b> · {smp.decided_by_name}{smp.reviewed_at ? ` · ${when(smp.reviewed_at)}` : ''}</div>}
      <div className="grid gap-4 mt-4">
        {smp.comments && <div className="card"><h2>{tsm('comments')}</h2><p className="small mt-2" style={{ whiteSpace: 'pre-wrap' }}>{smp.comments}</p></div>}
        <div className="card">
          <div className="flex items-center gap-2 flex-wrap"><h2>{tsm('measurements')}</h2>{measured.length ? <span className={`pill ${fails ? 'crit' : 'ok'}`}>{tsm('fails', { n: fails })}</span> : null}</div>
          {!measured.length && <p className="muted small mt-2">{t('notMeasured')}</p>}
          {!!measured.length && <div className="tw mt-2"><table className="t" style={{ minWidth: 560 }}><thead><tr><th>{tsm('pomCode')}</th><th>{tsm('pomName')}</th><th className="text-right">{tsm('spec')}</th><th className="text-right">{tsm('tol')}</th><th className="text-right">{tsm('measured')}</th><th>{tsm('result')}</th><th>{tsm('comment')}</th></tr></thead><tbody>
            {measured.map((m) => <tr key={m.id}><td className="mono muted small">{m.pom_code}</td><td className="small">{m.pom_name}</td><td className="text-right small">{m.spec ?? '—'}{m.unit ? ` ${m.unit}` : ''}</td><td className="text-right small muted">{m.tol_minus != null || m.tol_plus != null ? `−${m.tol_minus ?? 0} / +${m.tol_plus ?? 0}` : '—'}</td><td className="text-right small">{m.measured ?? '—'}</td><td>{m.pass == null ? <span className="muted small">—</span> : <span className={`pill ${m.pass ? 'ok' : 'crit'}`}>{m.pass ? tsm('pass') : tsm('fail')}</span>}</td><td className="small">{m.comment}</td></tr>)}
          </tbody></table></div>}
        </div>
        <div className="card"><h2>{t('roundComments')}</h2>
          {!onRound.length && <p className="muted small mt-2">{t('noRoundComments')}</p>}
          {onRound.map((r) => <div key={r.id} className="small mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}><div className="muted">{r.created_by_name} · {when(r.created_at)}{r.source !== 'portal' ? ` · ${ts(`kinds.${r.kind}`)}` : ''}</div>{isComment(r.parsed) ? <div style={{ whiteSpace: 'pre-wrap' }}>{r.parsed.text}</div> : <a href={`/api/records/file?id=${r.id}`} target="_blank" rel="noopener">{r.title || r.filename}</a>}</div>)}
          {canPost && <form action={partnerComment} className="grid gap-3 mt-4 pt-3" style={{ borderTop: '1px solid var(--line2)' }}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={id} /><input type="hidden" name="sample" value={sid} />
            <label className="f"><span>{t('yourComment')}</span><textarea className="input" name="text" rows={4} maxLength={4000} placeholder={t('yourCommentHint')} /></label>
            <label className="f"><span>{t('photos')}</span><input className="input" type="file" name="photos" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" /></label>
            <p className="muted small" style={{ margin: 0 }}>{t('commentNote', { company: tenant.name })}</p>
            <div><button className="btn primary">{t('post')}</button></div>
          </form>}
        </div>
      </div>
    </div>
  );
}
