// Stage B cards on the style file: sample rounds, materials with sourcing status, and the development schedule.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { sampleState, STATE_PILL, MATERIAL_PILL, SAMPLE_TYPES, MATERIAL_STATUSES, type SampleRow, type MaterialRow, type DevMilestoneRow } from '@/lib/samples';
import { computeDevPath, devHealth } from '@/lib/dev-path';
import { isoOf } from '@/lib/core/path';
import { addSample, importMaterials, updateMaterial, buildSchedule, setDevMilestone } from '@/app/app/[tenant]/styles/[id]/sample-actions';

type Party = { id: string; name: string; kind: string };
const MAKERS = ['factory', 'sample_room', 'mill', 'trim_supplier', 'other'];

export async function SamplesCard({ slug, styleId, samples, parties, canEdit, tz, techPackVersion }: { slug: string; styleId: string; samples: SampleRow[]; parties: Party[]; canEdit: boolean; tz: string; techPackVersion: number | null }) {
  const t = await getTranslations('samples');
  const base = `/app/${slug}/styles/${styleId}`;
  const d = (x: string | null) => (x ? new Date(x + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' }) : '—');
  return (
    <div className="card" id="samples">
      <div className="flex items-center gap-2 flex-wrap"><h2>{t('title')}</h2><span className="muted small">{t('count', { n: samples.length })}</span></div>
      {!samples.length && <p className="muted small mt-2">{t('none')}</p>}
      {!!samples.length && <div className="tw mt-2"><table className="t stack"><thead><tr><th>{t('colRound')}</th><th>{t('colMaker')}</th><th>{t('colDue')}</th><th>{t('colSent')}</th><th>{t('colReceived')}</th><th>{t('colState')}</th></tr></thead><tbody>
        {samples.map((s) => { const st = sampleState(s); return (
          <tr key={s.id}><td><Link href={`${base}/samples/${s.id}`} className="font-medium">{t(`type.${s.type}`)} R{s.round}</Link>{s.size && <span className="muted small"> · {s.size}</span>}{s.colourway && <span className="muted small"> · {s.colourway}</span>}</td>
            <td data-l={t('colMaker')}>{s.maker?.short || s.maker?.name || '—'}</td><td data-l={t('colDue')} className="small">{d(s.due_at)}</td><td data-l={t('colSent')} className="small">{d(s.sent_at)}{s.awb && <div className="muted">{s.courier} {s.awb}</div>}</td><td data-l={t('colReceived')} className="small">{d(s.received_at)}</td>
            <td data-l={t('colState')}><span className={`pill ${STATE_PILL[st]}`}>{t(`state.${st}`)}</span></td></tr>); })}
      </tbody></table></div>}
      {canEdit && <details className="mt-3"><summary className="small font-medium" style={{ cursor: 'pointer' }}>{t('add')}</summary>
        <form action={addSample} className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={styleId} />
          <label className="f"><span>{t('fType')}</span><select className="input" name="type" defaultValue="fit">{SAMPLE_TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}</select></label>
          <label className="f"><span>{t('fMaker')}</span><select className="input" name="maker_party_id" defaultValue=""><option value="">—</option>{parties.filter((p) => MAKERS.includes(p.kind)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="f"><span>{t('fSize')}</span><input className="input" name="size" maxLength={20} placeholder="M" /></label>
          <label className="f"><span>{t('fColourway')}</span><input className="input" name="colourway" maxLength={80} /></label>
          <label className="f"><span>{t('fDue')}</span><input className="input" type="date" name="due_at" /></label>
          <label className="f" style={{ gridColumn: '1 / -1' }}><span>{t('fNote')}</span><input className="input" name="note" maxLength={500} placeholder={techPackVersion ? t('againstNote', { v: techPackVersion }) : ''} /></label>
          <div><button className="btn primary sm">{t('request')}</button></div>
        </form></details>}
    </div>
  );
}

export async function MaterialsCard({ slug, styleId, materials, parties, canEdit, hasBom, currency }: { slug: string; styleId: string; materials: MaterialRow[]; parties: Party[]; canEdit: boolean; hasBom: boolean; currency: string }) {
  const t = await getTranslations('materials');
  const suppliers = parties.filter((p) => ['mill', 'fibre', 'trim_supplier', 'factory', 'other'].includes(p.kind));
  const open = materials.filter((m) => !['approved', 'not_needed'].includes(m.status)).length;
  return (
    <div className="card" id="materials">
      <div className="flex items-center gap-2 flex-wrap"><h2>{t('title')}</h2><span className="muted small">{materials.length ? t('count', { n: materials.length, open }) : ''}</span>
        {canEdit && hasBom && <form action={importMaterials} className="ml-auto"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={styleId} /><button className="btn sm">{materials.length ? t('refreshFromBom') : t('fromBom')}</button></form>}</div>
      {!materials.length && <p className="muted small mt-2">{hasBom ? t('noneBom') : t('none')}</p>}
      {materials.map((m) => (
        <details key={m.id} className="small mt-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
          <summary className="flex items-center gap-2 flex-wrap" style={{ cursor: 'pointer', listStyle: 'none' }}><span className="pill">{t(`kind.${m.kind}`)}</span><b>{m.item}</b>{m.placement && <span className="muted">{m.placement}</span>}<span className="muted" style={{ flexBasis: '100%' }}>{[m.description, m.composition, m.weight, m.colour].filter(Boolean).join(' · ')}</span><span className={`pill ${MATERIAL_PILL[m.status]}`}>{t(`status.${m.status}`)}</span><span className="muted">{m.supplier?.name || m.supplier_name || ''}</span></summary>
          {canEdit && <form action={updateMaterial} className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={styleId} /><input type="hidden" name="id" value={m.id} />
            <label className="f"><span>{t('fStatus')}</span><select className="input sm" name="status" defaultValue={m.status}>{MATERIAL_STATUSES.map((x) => <option key={x} value={x}>{t(`status.${x}`)}</option>)}</select></label>
            <label className="f"><span>{t('fSupplier')}</span><select className="input sm" name="supplier_id" defaultValue={m.supplier_id || ''}><option value="">{m.supplier_name || '—'}</option>{suppliers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="f"><span>{t('fMoq')}</span><input className="input sm" name="moq" defaultValue={m.moq || ''} maxLength={60} /></label>
            <label className="f"><span>{t('fLead')}</span><input className="input sm" name="lead_days" inputMode="numeric" defaultValue={m.lead_days ?? ''} /></label>
            <label className="f"><span>{t('fPrice')}</span><div className="flex gap-1"><input className="input sm" name="currency" defaultValue={m.currency || currency} maxLength={3} style={{ width: 56 }} /><input className="input sm" name="price" inputMode="decimal" defaultValue={m.price ?? ''} /></div></label>
            <label className="f" style={{ gridColumn: '1 / -1' }}><span>{t('fNote')}</span><input className="input sm" name="note" defaultValue={m.note || ''} maxLength={500} /></label>
            <div><button className="btn sm">{t('save')}</button></div>
          </form>}
        </details>
      ))}
    </div>
  );
}

export async function ScheduleCard({ slug, styleId, rows, targetDelivery, canEdit, tz }: { slug: string; styleId: string; rows: DevMilestoneRow[]; targetDelivery: string | null; canEdit: boolean; tz: string }) {
  const t = await getTranslations('schedule');
  const points = computeDevPath(rows);
  const h = devHealth(points);
  const d = (n: number | undefined) => (n == null ? '—' : new Date(isoOf(n) + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' }));
  const PILL: Record<string, string> = { done: 'ok', late: 'crit', risk: 'warn', due: 'agent', pending: '' };
  return (
    <div className="card" id="schedule">
      <div className="flex items-center gap-2 flex-wrap"><h2>{t('title')}</h2>{!!rows.length && <span className={`pill ${h.state === 'red' ? 'crit' : h.state === 'amber' ? 'warn' : 'ok'}`}>{h.slip > 0 ? t('slip', { n: h.slip }) : t('onPlan')}</span>}
        {canEdit && <form action={buildSchedule} className="ml-auto flex gap-2 items-center flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={styleId} /><input className="input sm" type="date" name="target_delivery" defaultValue={targetDelivery || ''} style={{ width: 'auto' }} title={t('deliveryHint')} /><button className="btn sm">{rows.length ? t('rebuild') : t('build')}</button></form>}</div>
      <p className="muted small mt-1">{t('note')}</p>
      {!rows.length && <p className="muted small mt-2">{t('none')}</p>}
      {!!points.length && <div className="tw mt-2"><table className="t stack"><thead><tr><th>{t('colStep')}</th><th>{t('colOwner')}</th><th>{t('colPlan')}</th><th>{t('colForecast')}</th><th>{t('colStatus')}</th>{canEdit && <th>{t('colUpdate')}</th>}</tr></thead><tbody>
        {points.map((p) => (
          <tr key={p.key}><td className="font-medium">{p.label}</td><td data-l={t('colOwner')} className="muted small">{t(`owner.${p.owner}`, { default: p.owner })}</td><td data-l={t('colPlan')} className="small">{d(p.plan)}</td><td data-l={t('colForecast')} className="small">{p.status === 'done' ? d(p.actual) : d(p.f)}{p.slip > 0 && p.status !== 'done' ? <span className="muted"> (+{p.slip}d)</span> : null}</td><td data-l={t('colStatus')}><span className={`pill ${PILL[p.status]}`}>{t(`status.${p.status}`)}</span></td>
            {canEdit && <td><form action={setDevMilestone} className="flex gap-1 items-center flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="style" value={styleId} /><input type="hidden" name="key" value={p.key} /><select name="field" className="input sm" style={{ width: 'auto' }} defaultValue="expected"><option value="expected">{t('expected')}</option><option value="actual">{t('actual')}</option></select><input className="input sm" type="date" name="date" style={{ width: 'auto' }} required /><button className="btn sm">{t('save')}</button></form></td>}</tr>))}
      </tbody></table></div>}
    </div>
  );
}
