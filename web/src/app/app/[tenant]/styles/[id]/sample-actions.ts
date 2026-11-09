'use server';
// Sample rounds, materials and the development schedule on a style. Every write is a person's action with a
// ledger row on the development track; a decision on a sample is recorded here only, never by an agent tool.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { SAMPLE_TYPES, DECISIONS, DECISION_SOURCES, MATERIAL_STATUSES } from '@/lib/samples';
import { styleRecords, techPackVersions, num } from '@/lib/records';
import { DEFAULT_STEPS, planFromDelivery } from '@/lib/dev-path';

type Me = Awaited<ReturnType<typeof requireTenant>>;
const CAN_WRITE = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics'];
function back(path: string, q: Record<string, string>): never { redirect(`${path}?${new URLSearchParams(q)}`); }
const who = (me: Me) => me.membership.display_name || me.user.email || 'member';
const clean = (v: FormDataEntryValue | null, max = 200) => String(v || '').trim().slice(0, max) || null;
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const uuid = (v: FormDataEntryValue | null) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
async function guard(slug: string, styleId: string) {
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/${styleId}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  const sb = await supabaseServer();
  const { data: s } = await sb.from('styles').select('id, code, status, target_delivery, customer_id').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle();
  if (!s) back(`/app/${slug}/styles`, { error: 'not found' });
  return { me, t, sb, s, path };
}
async function ledger(me: Me, sb: Awaited<ReturnType<typeof supabaseServer>>, styleId: string, stream: string, what: string, gate: string, ref: Record<string, unknown>) {
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who(me), p_actor_user: me.user.id, p_counterparty: null, p_stream: stream, p_order: null, p_what: what, p_gate: gate, p_gated: true, p_ref: ref, p_track: 'development', p_style: styleId });
}
const TYPE_LABEL: Record<string, string> = { proto: 'proto', fit: 'fit', size_set: 'size set', sms: 'SMS', pp: 'PP', top: 'TOP', shipment: 'shipment sample', labdip: 'lab dip', strikeoff: 'strike-off', handloom: 'handloom', trim_card: 'trim card', wash: 'wash sample', other: 'sample' };

// ---- sample rounds
export async function addSample(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style'));
  const { me, sb, s, path } = await guard(slug, styleId);
  const type = String(form.get('type'));
  if (!(SAMPLE_TYPES as readonly string[]).includes(type)) back(path, { error: 'type' });
  const { data: last } = await sb.from('samples').select('round').eq('style_id', styleId).eq('type', type).order('round', { ascending: false }).limit(1).maybeSingle();
  const round = Number(form.get('round')) || (last?.round || 0) + 1;
  const tps = techPackVersions(await styleRecords(sb, me.tenant.id, styleId));
  const row = { tenant_id: me.tenant.id, style_id: styleId, type, round, size: clean(form.get('size'), 20), colourway: clean(form.get('colourway'), 80), maker_party_id: uuid(form.get('maker_party_id')), against_record_id: uuid(form.get('against_record_id')) || tps[0]?.id || null, requested_at: date(form.get('requested_at')) || new Date().toISOString().slice(0, 10), due_at: date(form.get('due_at')), note: clean(form.get('note'), 500), created_by: me.user.id };
  const { data: r, error } = await sb.from('samples').insert(row).select('id').single();
  if (error || !r) back(path, { error: error?.message || 'failed' });
  const { data: maker } = row.maker_party_id ? await sb.from('parties').select('name').eq('id', row.maker_party_id).maybeSingle() : { data: null };
  await ledger(me, sb, styleId, 'Sample schedule', `${TYPE_LABEL[type]} round ${round} requested${maker ? ` from ${maker.name}` : ''}${row.due_at ? `, due ${row.due_at}` : ''}${tps[0] ? `, against tech pack v${tps[0].version}` : ''}`, 'PERSON', { sample_id: r.id });
  if (s.status === 'developing' || s.status === 'brief') await sb.from('styles').update({ status: 'sampling' }).eq('id', styleId);
  revalidatePath(path);
  redirect(`${path}/samples/${r.id}?saved=1`);
}

// sent, in transit, received: what the merchandiser or the maker reports
export async function updateSampleEvents(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id'));
  const { me, sb, path } = await guard(slug, styleId);
  const { data: before } = await sb.from('samples').select('id, type, round, due_at, sent_at, courier, awb, received_at, maker_party_id').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!before) back(path, { error: 'not found' });
  const patch = { due_at: date(form.get('due_at')), sent_at: date(form.get('sent_at')), courier: clean(form.get('courier'), 60), awb: clean(form.get('awb'), 80), received_at: date(form.get('received_at')), maker_party_id: uuid(form.get('maker_party_id')), note: clean(form.get('note'), 500) };
  const { error } = await sb.from('samples').update(patch).eq('id', id);
  if (error) back(`${path}/samples/${id}`, { error: error.message });
  const changed = (['due_at', 'sent_at', 'courier', 'awb', 'received_at'] as const).filter((k) => String(patch[k] ?? '') !== String(before[k] ?? ''));
  if (changed.length) await ledger(me, sb, styleId, 'Sample schedule', `${TYPE_LABEL[before.type]} round ${before.round}: ${changed.map((k) => `${k.replace('_at', '').replace('_', ' ')} ${before[k] ?? '—'} → ${patch[k] ?? '—'}`).join('; ')}`, 'PERSON', { sample_id: id });
  revalidatePath(path);
  redirect(`${path}/samples/${id}?saved=1`);
}

// The review: measurements against the spec, comments, and the decision (a person's, or the customer's as reported).
export async function reviewSample(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id'));
  const { me, sb, s, path } = await guard(slug, styleId);
  const dest = `${path}/samples/${id}`;
  const { data: smp } = await sb.from('samples').select('id, type, round, size, decision').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!smp) back(path, { error: 'not found' });
  // measurements: one row per POM in the form (m_<i>_name, _code, _spec, _tolm, _tolp, _measured, _unit)
  const n = Number(form.get('m_count')) || 0;
  const rows: Record<string, unknown>[] = [];
  let fails = 0;
  for (let i = 0; i < n; i++) {
    const name = clean(form.get(`m_${i}_name`), 120); if (!name) continue;
    const spec = num(String(form.get(`m_${i}_spec`) || '')), tolm = num(String(form.get(`m_${i}_tolm`) || '')), tolp = num(String(form.get(`m_${i}_tolp`) || '')), measured = num(String(form.get(`m_${i}_measured`) || ''));
    const pass = spec != null && measured != null ? measured >= spec - (tolm ?? 0) && measured <= spec + (tolp ?? 0) : null;
    if (pass === false) fails++;
    rows.push({ tenant_id: me.tenant.id, sample_id: id, pom_code: clean(form.get(`m_${i}_code`), 20), pom_name: name, size: smp.size, spec, tol_minus: tolm, tol_plus: tolp, measured, unit: clean(form.get(`m_${i}_unit`), 8), pass, comment: clean(form.get(`m_${i}_comment`), 300) });
  }
  if (rows.length) { await sb.from('measurements').delete().eq('sample_id', id); const { error } = await sb.from('measurements').insert(rows); if (error) back(dest, { error: error.message }); }
  const decision = String(form.get('decision') || '');
  const comments = clean(form.get('comments'), 4000);
  const source = String(form.get('decision_source') || 'workspace');
  const byName = clean(form.get('decided_by_name'), 160);
  const patch: Record<string, unknown> = { comments, reviewed_at: new Date().toISOString() };
  if (decision) {
    if (!(DECISIONS as readonly string[]).includes(decision) || !(DECISION_SOURCES as readonly string[]).includes(source)) back(dest, { error: 'decision' });
    patch.decision = decision; patch.decided_by = me.user.id; patch.decision_source = source;
    patch.decided_by_name = source === 'workspace' ? who(me) : `${byName || 'Customer'} (${source.replace('customer_', '').replace('_', ' ')}), recorded by ${who(me)}`;
  }
  const { error } = await sb.from('samples').update(patch).eq('id', id);
  if (error) back(dest, { error: error.message });
  const measured = rows.filter((r) => r.measured != null).length;
  await ledger(me, sb, styleId, 'Sample comments and approvals', `${TYPE_LABEL[smp.type]} round ${smp.round}${smp.size ? ` (${smp.size})` : ''} reviewed: ${measured} points measured, ${fails} out of tolerance${decision ? `; ${decision.replace(/_/g, ' ')}${source !== 'workspace' ? ` by ${byName || 'the customer'}` : ''}` : ''}${comments ? `. ${comments.slice(0, 160)}` : ''}`, decision ? 'DECIDED' : 'PERSON', { sample_id: id, decision: decision || null, fails });
  // an approved fit or size set keeps the style moving; a PP decision belongs to the order
  if (decision === 'approved' && smp.type === 'size_set' && s.status === 'sampling') await sb.from('styles').update({ status: 'costing' }).eq('id', styleId);
  revalidatePath(path); revalidatePath(dest);
  redirect(`${dest}?saved=1`);
}

// ---- materials
export async function importMaterials(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style'));
  const { me, sb, path } = await guard(slug, styleId);
  const tps = techPackVersions(await styleRecords(sb, me.tenant.id, styleId));
  const tp = tps[0];
  if (!tp?.parsed?.bom.length) back(path, { error: (await getTranslations('styles'))('noBom') });
  const { data: existing } = await sb.from('materials').select('item, placement').eq('style_id', styleId);
  const have = new Set((existing || []).map((m) => `${m.item}|${m.placement || ''}`.toLowerCase()));
  const { data: suppliers } = await sb.from('parties').select('id, name, short').eq('tenant_id', me.tenant.id).is('archived_at', null);
  const match = (name: string | null) => { if (!name) return null; const q = name.toLowerCase(); return (suppliers || []).find((p) => p.name.toLowerCase() === q || (p.short || '').toLowerCase() === q)?.id || (suppliers || []).find((p) => q.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(q))?.id || null; };
  const rows = tp.parsed.bom.filter((b) => !have.has(`${b.item}|${b.placement || ''}`.toLowerCase())).map((b) => ({ tenant_id: me.tenant.id, style_id: styleId, kind: b.kind, item: b.item, description: b.description, composition: b.composition, construction: b.construction, weight: b.weight, colour: b.colour, placement: b.placement, qty: b.qty, supplier_id: match(b.supplier), supplier_name: b.supplier, tech_pack_record_id: tp.id }));
  if (rows.length) { const { error } = await sb.from('materials').insert(rows); if (error) back(path, { error: error.message }); }
  await ledger(me, sb, styleId, 'Material sourcing', `${rows.length} materials taken from tech pack v${tp.version} (${rows.filter((r) => r.supplier_id).length} matched to known suppliers)`, 'PERSON', { record_id: tp.id, count: rows.length });
  revalidatePath(path);
  redirect(`${path}?saved=1#materials`);
}

export async function updateMaterial(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id'));
  const { me, sb, path } = await guard(slug, styleId);
  const { data: before } = await sb.from('materials').select('id, item, status, supplier_id, note, moq, lead_days, price, currency').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!before) back(path, { error: 'not found' });
  const status = String(form.get('status') || before.status);
  if (!(MATERIAL_STATUSES as readonly string[]).includes(status)) back(path, { error: 'status' });
  const patch = { status, supplier_id: uuid(form.get('supplier_id')), moq: clean(form.get('moq'), 60), lead_days: Number(form.get('lead_days')) || null, price: num(String(form.get('price') || '')), currency: clean(form.get('currency'), 3), note: clean(form.get('note'), 500) };
  const { error } = await sb.from('materials').update(patch).eq('id', id);
  if (error) back(path, { error: error.message });
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => String(patch[k] ?? '') !== String(before[k] ?? ''));
  if (changed.length) await ledger(me, sb, styleId, 'Material sourcing', `${before.item}: ${changed.map((k) => `${k.replace('_', ' ')} ${before[k] ?? '—'} → ${patch[k] ?? '—'}`).join('; ')}`, 'PERSON', { material_id: id });
  revalidatePath(path);
  redirect(`${path}?saved=1#materials`);
}

// ---- schedule
export async function buildSchedule(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style'));
  const { me, sb, s, path, t } = await guard(slug, styleId);
  const delivery = date(form.get('target_delivery')) || s.target_delivery;
  if (!delivery) back(path, { error: t('needDelivery') });
  if (delivery !== s.target_delivery) await sb.from('styles').update({ target_delivery: delivery }).eq('id', styleId);
  const { data: tpl } = await sb.from('schedule_templates').select('steps').eq('tenant_id', me.tenant.id).or(`customer_id.eq.${s.customer_id || '00000000-0000-0000-0000-000000000000'},customer_id.is.null`).order('customer_id', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const steps = (tpl?.steps as typeof DEFAULT_STEPS | null) || DEFAULT_STEPS;
  const plan = planFromDelivery(delivery, steps);
  const { data: existing } = await sb.from('dev_milestones').select('key, actual_date, expected_date').eq('style_id', styleId);
  const keep = new Map((existing || []).map((m) => [m.key, m]));
  const rows = plan.map((p) => ({ tenant_id: me.tenant.id, style_id: styleId, key: p.key, label: p.label, owner_kind: p.owner, plan_date: p.plan_date, expected_date: keep.get(p.key)?.expected_date || null, actual_date: keep.get(p.key)?.actual_date || null, updated_by: me.user.id }));
  const { error } = await sb.from('dev_milestones').upsert(rows, { onConflict: 'style_id,key' });
  if (error) back(path, { error: error.message });
  await ledger(me, sb, styleId, 'Sample schedule', `Development schedule ${existing?.length ? 'rebuilt' : 'built'} from ${tpl ? 'the customer template' : 'the default template'} for delivery ${delivery}: ${plan.map((p) => `${p.label} ${p.plan_date}`).join(', ')}`, 'PERSON', { delivery, steps: plan.length });
  revalidatePath(path);
  redirect(`${path}?saved=1#schedule`);
}

export async function setDevMilestone(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), key = String(form.get('key'));
  const { me, sb, path } = await guard(slug, styleId);
  const field = String(form.get('field')), d = date(form.get('date'));
  if (!['expected', 'actual'].includes(field) || !d) back(path, { error: 'date' });
  const { data: before } = await sb.from('dev_milestones').select('label, expected_date, actual_date').eq('style_id', styleId).eq('key', key).maybeSingle();
  if (!before) back(path, { error: 'not found' });
  const patch = field === 'actual' ? { actual_date: d } : { expected_date: d, actual_date: null };
  const { error } = await sb.from('dev_milestones').update({ ...patch, note: clean(form.get('note'), 300), updated_by: me.user.id, updated_at: new Date().toISOString() }).eq('style_id', styleId).eq('key', key);
  if (error) back(path, { error: error.message });
  await ledger(me, sb, styleId, 'Sample schedule', `${before.label || key} ${field} date set to ${d}`, 'PERSON', { key, field, date: d });
  revalidatePath(path);
  redirect(`${path}?saved=1#schedule`);
}
