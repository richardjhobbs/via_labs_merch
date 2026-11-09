// One compliance programme: where the requirements come from, each obligation with who does it and when,
// the reporting tasks by period, and the reports sent back to the issuer.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { canLead, DISCIPLINES, esgEnabled, FREQUENCIES, MEASURES, ORDER_MILESTONES, OWNER_ROLES, SEVERITIES, STATE_PILL, SUPPLIER_KINDS, TRIGGERS, taskState, type OrderFilter, type SupplierFilter } from '@/lib/esg';
import { LABELS } from '@/lib/core/path';
import { addRequirement, prepareReport, setProgrammeStatus, updateRequirementOwner } from '../actions';

export default async function Programme({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string; saved?: string; created?: string }> }) {
  const { tenant: slug, id } = await params; const q = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, tr, tp] = await Promise.all([getTranslations('esg'), getTranslations('roles'), getTranslations('parties')]);
  const sb = await supabaseServer();
  const [{ data: tn }, { data: p }, { data: reqs }, { data: tasks }, { data: reports }, { data: members }, { data: parties }] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
    sb.from('esg_programmes').select('*, parties(name)').eq('id', id).eq('tenant_id', tenant.id).maybeSingle(),
    sb.from('esg_requirements').select('*').eq('programme_id', id).eq('tenant_id', tenant.id).order('code', { nullsFirst: false }).order('created_at'),
    sb.from('esg_tasks').select('id, requirement_id, period_label, period_end, due_date, status, assignee_user_id, parties(name, short), orders(po)').eq('programme_id', id).eq('tenant_id', tenant.id).order('due_date'),
    sb.from('esg_reports').select('id, period_label, status, created_at, approved_by_name, sent_to, sent_at').eq('programme_id', id).eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
    sb.from('memberships').select('user_id, display_name, role').eq('tenant_id', tenant.id).neq('role', 'partner').order('display_name'),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenant.id).is('archived_at', null).order('name'),
  ]);
  if (!esgEnabled(tn?.settings)) redirect(`/app/${slug}/esg`);
  if (!p) notFound();
  const lead = canLead(membership.role);
  const suppliersAll = (parties || []).filter((x) => (SUPPLIER_KINDS as readonly string[]).includes(x.kind));
  const customers = (parties || []).filter((x) => ['brand', 'retailer', 'store', 'buying_office', 'trading'].includes(x.kind));
  const partyName = (id: string) => parties?.find((x) => x.id === id)?.name || '?';
  // when and for whom, in words
  const when = (r: { trigger: string; frequency: string; due_days: number; milestone: string | null; milestone_offset: number; lead_days: number }) =>
    r.trigger === 'per_order' ? t('whenPerOrder', { milestone: LABELS[r.milestone as keyof typeof LABELS] || r.milestone || '', offset: r.milestone_offset === 0 ? t('onDay') : r.milestone_offset < 0 ? t('daysBefore', { n: -r.milestone_offset }) : t('daysAfter', { n: r.milestone_offset }) })
    : r.trigger === 'expiry' ? t('whenExpiry', { n: r.lead_days }) : `${t(`freq.${r.frequency}` as never)} · ${t('dueAfter', { n: r.due_days })}`;
  const whom = (r: { applies_to: string; supplier_filter: SupplierFilter; order_filter: OrderFilter }) => [
    r.applies_to === 'suppliers' ? t('forSuppliers', { kinds: (r.supplier_filter?.kinds?.length ? r.supplier_filter.kinds : ['factory']).map((k) => tp(`kinds.${k}` as never)).join(', ') }) + (r.supplier_filter?.tiers?.length ? ` · T${r.supplier_filter.tiers.join('/')}` : '') + (r.supplier_filter?.countries?.length ? ` · ${r.supplier_filter.countries.join(', ')}` : '') : null,
    r.order_filter?.customer_ids?.length ? t('forCustomers', { names: r.order_filter.customer_ids.map(partyName).join(', ') }) : null,
    r.order_filter?.destinations?.length ? t('forDestinations', { list: r.order_filter.destinations.length > 6 ? `${r.order_filter.destinations.slice(0, 5).join(', ')} +${r.order_filter.destinations.length - 5}` : r.order_filter.destinations.join(', ') }) : null,
    r.order_filter?.factory_countries?.length ? r.order_filter.factory_countries.join(', ') : null,
    r.order_filter?.category ? `"${r.order_filter.category}"` : null,
  ].filter(Boolean).join(' · ');
  const nameOf = (uid: string | null) => (uid ? members?.find((m) => m.user_id === uid)?.display_name || '?' : null);
  const supplierOf = (pid: string | null) => (pid ? parties?.find((x) => x.id === pid)?.name : null);
  const reqById = new Map((reqs || []).map((r) => [r.id, r]));
  const withState = (tasks || []).map((x) => ({ ...x, state: taskState(x, reqById.get(x.requirement_id)?.lead_days ?? 21) }));
  const open = withState.filter((x) => !['done', 'waived'].includes(x.state));
  const done = withState.filter((x) => x.state === 'done').length;
  const periods = [...new Map(withState.map((x) => [x.period_label, x])).values()];
  const lastPeriod = withState.filter((x) => x.period_end <= new Date().toISOString().slice(0, 10)).at(-1);
  const groups = DISCIPLINES.map((d) => [d, (reqs || []).filter((r) => r.discipline === d)] as const).filter(([, l]) => l.length);
  const issuer = (p.parties as unknown as { name: string } | null)?.name || p.issuer_name;
  const savedMsg = q.saved && (q.created ? t('tasksCreated', { n: Number(q.created) || 0 }) : t('saved'));
  return (
    <div className="max-w-6xl">
      <div className="small"><Link href={`/app/${slug}/esg`}>{t('title')}</Link></div>
      <div className="flex items-baseline gap-3 flex-wrap mt-1"><h1>{p.name}</h1><span className="pill">{t(`pkind.${p.kind}` as never)}</span>{p.status !== 'active' && <span className="pill warn">{t(`pstatus.${p.status}` as never)}</span>}</div>
      {q.error && <div className="notice crit mt-3">{q.error}</div>}
      {savedMsg && <div className="notice ok mt-3">{savedMsg}</div>}
      <div className="card mt-4">
        <dl className="small grid gap-1" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 16 }}>
          {([['issuer', issuer], ['chain', p.chain], ['framework', p.framework], ['reference', p.reference], ['purpose', p.purpose], ['term', [p.starts_on, p.ends_on].filter(Boolean).join(' → ')], ['source', p.source_file]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{t(k)}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="flex gap-3 mt-3 flex-wrap small"><span className="pill">{t('nReq', { n: reqs?.length || 0 })}</span><span className="pill ok">{t('nDone', { n: done })}</span><span className={`pill ${open.some((x) => x.state === 'overdue') ? 'crit' : ''}`}>{t('nOpen', { n: open.length })}</span>
          {lead && <form action={setProgrammeStatus} className="ml-auto flex gap-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={p.status === 'active' ? 'closed' : 'active'} /><button className="btn sm">{p.status === 'active' ? t('close') : t('activate')}</button></form>}</div>
      </div>

      <div className="split mt-5" style={{ '--side': '320px' } as React.CSSProperties}>
        <div className="grid gap-5 self-start" style={{ minWidth: 0 }}>
          {groups.map(([d, list]) => (
            <div key={d}>
              <h2 className="mb-2">{t(`disc.${d}`)}</h2>
              <div className="grid gap-3">{list.map((r) => { const rt = withState.filter((x) => x.requirement_id === r.id); const next = rt.find((x) => !['done', 'waived'].includes(x.state)); return (
                <div key={r.id} className="card" style={{ opacity: r.active ? 1 : 0.6 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">{r.code && <span className="mono muted small">{r.code}</span>}<b>{r.title}</b>{!r.active && <span className="pill">{t('paused')}</span>}{r.severity && <span className={`pill ${r.severity === 'critical' ? 'crit' : r.severity === 'major' ? 'warn' : ''}`}>{t(`sev.${r.severity}` as never)}</span>}<span className="muted small ml-auto">{when(r)}</span></div>
                  {whom(r) && <div className="small mt-1"><span className="pill agent">{whom(r)}</span></div>}
                  {r.instruction && <p className="small mt-1" style={{ color: 'var(--fg2)' }}>{r.instruction}</p>}
                  <div className="small mt-2 flex gap-x-4 gap-y-1 flex-wrap">
                    <span><span className="muted">{t('who')}:</span> {nameOf(r.owner_user_id) || tr(r.owner_role as never)}{supplierOf(r.supplier_party_id) ? ` · ${t('fromSupplier', { name: supplierOf(r.supplier_party_id)! })}` : ''}</span>
                    {(r.target != null || r.target_note) && <span><span className="muted">{t('target')}:</span> {r.target ?? ''}{r.unit ? ` ${r.unit}` : ''}{r.target_note ? ` ${r.target_note}` : ''}</span>}
                    {r.baseline != null && <span><span className="muted">{t('baseline')}:</span> {r.baseline}{r.unit ? ` ${r.unit}` : ''}</span>}
                    {r.evidence && <span><span className="muted">{t('evidence')}:</span> {r.evidence}</span>}
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">{(rt.length > 8 ? rt.filter((x) => !['done', 'waived'].includes(x.state)).slice(0, 8) : rt).map((x) => { const pty = (x.parties as unknown as { name: string; short: string | null } | null); return <Link key={x.id} href={`/app/${slug}/esg/task/${x.id}`} className={`pill ${STATE_PILL[x.state]}`} title={`${t(`state.${x.state}`)} · ${x.due_date}${pty ? ` · ${pty.name}` : ''}`}>{x.period_label}{pty && r.applies_to === 'suppliers' ? ` · ${pty.short || pty.name}` : ''}</Link>; })}{rt.length > 8 && <span className="muted small">{t('nMoreTasks', { n: rt.length })}</span>}{!rt.length && <span className="muted small">{t('noTasksYet')}</span>}{next && <span className="muted small ml-2">{t('nextDue', { date: next.due_date })}</span>}</div>
                  {lead && <details className="mt-2 small"><summary className="muted" style={{ cursor: 'pointer' }}>{t('changeOwner')}</summary>
                    <form action={updateRequirementOwner} className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="programme_id" value={id} />
                      <label className="f"><span>{t('ownerRole')}</span><select className="input sm" name="owner_role" defaultValue={r.owner_role}>{OWNER_ROLES.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</select></label>
                      <label className="f"><span>{t('person')}</span><select className="input sm" name="owner_user_id" defaultValue={r.owner_user_id || ''}><option value="">{t('anyInRole')}</option>{(members || []).filter((m) => m.role !== 'viewer').map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name} · {tr(m.role as never)}</option>)}</select></label>
                      {r.applies_to !== 'suppliers' && <label className="f"><span>{t('supplier')}</span><select className="input sm" name="supplier_party_id" defaultValue={r.supplier_party_id || ''}><option value="">{t('noSupplier')}</option>{suppliersAll.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
                      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={r.active} />{t('active')}</label>
                      <button className="btn sm self-end">{t('save')}</button>
                    </form></details>}
                </div>); })}</div>
            </div>
          ))}
          {!reqs?.length && <div className="card muted small">{t('noRequirements')}</div>}
        </div>

        <div className="grid gap-4 self-start">
          <div className="card">
            <h2>{t('reports')}</h2>
            <div className="mt-2 grid gap-2">{(reports || []).map((r) => <Link key={r.id} href={`/app/${slug}/esg/report/${r.id}`} className="small no-underline" style={{ color: 'inherit', borderTop: '1px solid var(--line2)', paddingTop: 8 }}><span className={`pill ${r.status === 'sent' ? 'ok' : r.status === 'approved' ? 'agent' : 'warn'}`}>{t(`rstatus.${r.status}` as never)}</span> <b>{r.period_label}</b><div className="muted">{r.sent_to ? t('sentToOn', { to: r.sent_to, date: r.sent_at?.slice(0, 10) || '' }) : new Date(r.created_at).toLocaleDateString('en-GB')}</div></Link>)}{!reports?.length && <p className="muted small">{t('noReports')}</p>}</div>
            {lead && !!periods.length && <form action={prepareReport} className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line2)' }}>
              <h3 className="small"><b>{t('prepare')}</b></h3><p className="muted small mt-1">{t('prepareHelp')}</p>
              <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="programme_id" value={id} />
              <label className="f mt-2"><span>{t('periodLabel')}</span><input className="input" name="label" maxLength={60} defaultValue={lastPeriod?.period_label || ''} required /></label>
              <div className="grid gap-2 sm:grid-cols-2"><label className="f"><span>{t('from')}</span><input className="input" type="date" name="from" required defaultValue={lastPeriod?.period_end || ''} /></label><label className="f"><span>{t('to')}</span><input className="input" type="date" name="to" required defaultValue={lastPeriod?.period_end || ''} /></label></div>
              <button className="btn primary">{t('prepareBtn')}</button>
            </form>}
          </div>
          {lead && <form action={addRequirement} className="card">
            <h2 className="mb-3">{t('addRequirement')}</h2>
            <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="programme_id" value={id} />
            <div className="grid gap-2" style={{ gridTemplateColumns: '90px 1fr' }}><label className="f"><span>{t('code')}</span><input className="input" name="code" maxLength={40} /></label><label className="f"><span>{t('reqTitle')}</span><input className="input" name="title" required minLength={3} maxLength={200} /></label></div>
            <label className="f"><span>{t('instruction')}</span><textarea className="input" name="instruction" rows={3} maxLength={2000} /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="f"><span>{t('discipline')}</span><select className="input" name="discipline" defaultValue="energy">{DISCIPLINES.map((d) => <option key={d} value={d}>{t(`disc.${d}`)}</option>)}</select></label>
              <label className="f"><span>{t('measure')}</span><select className="input" name="measure" defaultValue="number">{MEASURES.map((m) => <option key={m} value={m}>{t(`meas.${m}`)}</option>)}</select></label>
              <label className="f"><span>{t('unit')}</span><input className="input" name="unit" maxLength={24} placeholder="kWh" /></label>
              <label className="f"><span>{t('target')}</span><input className="input" name="target" inputMode="decimal" maxLength={24} /></label>
              <label className="f"><span>{t('baseline')}</span><input className="input" name="baseline" inputMode="decimal" maxLength={24} /></label>
              <label className="f"><span>{t('ownerRole')}</span><select className="input" name="owner_role" defaultValue="compliance">{OWNER_ROLES.map((x) => <option key={x} value={x}>{tr(x)}</option>)}</select></label>
              <label className="f"><span>{t('severity')}</span><select className="input" name="severity" defaultValue=""><option value="" />{SEVERITIES.map((x) => <option key={x} value={x}>{t(`sev.${x}`)}</option>)}</select></label>
            </div>
            <fieldset className="mt-2 pt-2" style={{ borderTop: '1px solid var(--line2)' }}>
              <h3 className="small"><b>{t('whenTitle')}</b></h3>
              <label className="f mt-2"><span>{t('trigger')}</span><select className="input" name="trigger" defaultValue="schedule">{TRIGGERS.map((x) => <option key={x} value={x}>{t(`trig.${x}`)}</option>)}</select></label>
              <p className="muted small mb-2">{t('triggerHelp')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="f"><span>{t('frequency')}</span><select className="input" name="frequency" defaultValue="quarterly">{FREQUENCIES.map((f) => <option key={f} value={f}>{t(`freq.${f}`)}</option>)}</select></label>
                <label className="f"><span>{t('firstPeriodEnd')}</span><input className="input" type="date" name="first_period_end" /></label>
                <label className="f"><span>{t('dueDays')}</span><input className="input" name="due_days" type="number" min={0} max={180} defaultValue={30} /></label>
                <label className="f"><span>{t('leadDays')}</span><input className="input" name="lead_days" type="number" min={1} max={365} defaultValue={21} /></label>
                <label className="f"><span>{t('milestone')}</span><select className="input" name="milestone" defaultValue=""><option value="" />{ORDER_MILESTONES.map((m) => <option key={m} value={m}>{LABELS[m]}</option>)}</select></label>
                <label className="f"><span>{t('milestoneOffset')}</span><input className="input" name="milestone_offset" type="number" min={-365} max={365} defaultValue={-7} /></label>
              </div>
              {!!customers.length && <label className="f"><span>{t('orderCustomers')}</span><select className="input" name="o_customers" multiple size={Math.min(4, customers.length)}>{customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="f"><span>{t('orderDestinations')}</span><input className="input" name="o_destinations" maxLength={200} placeholder="US, GB" /></label>
                <label className="f"><span>{t('orderCountries')}</span><input className="input" name="o_countries" maxLength={60} placeholder="BD, VN" /></label>
                <label className="f"><span>{t('orderCategory')}</span><input className="input" name="o_category" maxLength={60} placeholder={t('orderCategoryPh')} /></label>
              </div>
            </fieldset>
            <fieldset className="mt-2 pt-2" style={{ borderTop: '1px solid var(--line2)' }}>
              <h3 className="small"><b>{t('whoTitle')}</b></h3>
              <label className="f mt-2"><span>{t('appliesTo')}</span><select className="input" name="applies_to" defaultValue="company"><option value="company">{t('applies.company')}</option><option value="suppliers">{t('applies.suppliers')}</option></select></label>
              <div className="flex gap-3 flex-wrap small mb-2">{SUPPLIER_KINDS.map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="s_kinds" value={k} defaultChecked={k === 'factory'} />{tp(`kinds.${k}` as never)}</label>)}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex gap-3 small items-center">{[1, 2, 3].map((n) => <label key={n} className="flex items-center gap-1"><input type="checkbox" name="s_tiers" value={n} />T{n}</label>)}</div>
                <label className="f"><span>{t('supplierCountries')}</span><input className="input" name="s_countries" maxLength={60} placeholder="BD, VN" /></label>
              </div>
            </fieldset>
            <label className="f"><span>{t('targetNote')}</span><input className="input" name="target_note" maxLength={240} /></label>
            <label className="f"><span>{t('evidence')}</span><input className="input" name="evidence" maxLength={400} placeholder={t('evidencePh')} /></label>
            <label className="f"><span>{t('supplierOne')}</span><select className="input" name="supplier_party_id" defaultValue=""><option value="">{t('noSupplier')}</option>{suppliersAll.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <button className="btn">{t('save')}</button>
          </form>}
        </div>
      </div>
    </div>
  );
}
