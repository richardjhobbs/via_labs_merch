'use server';
// Handover from development to production (docs/development-merchandising.md 3.4). A person's action, never
// automatic: the PO is created or an existing PO is linked, the production milestones are seeded from the ETD
// with the approved fabric's lead time, the mill comes from the approved fabric, PP, TOP and shipment rounds
// move to the order, and the style is marked handed over. Both tracks get a ledger row. Development records
// stay readable from the order; a spec change after this is an Amendment on the production side.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { MILESTONES, OWNERS, planFromEtd, dayOf, isoOf, today } from '@/lib/core/path';
import { styleRecords, techPackVersions } from '@/lib/records';
import { listMaterials } from '@/lib/samples';

type Me = Awaited<ReturnType<typeof requireTenant>>;
const CAN_WRITE = ['owner', 'manager', 'merchandiser'];
function back(path: string, q: Record<string, string>): never { redirect(`${path}?${new URLSearchParams(q)}`); }
const who = (me: Me) => me.membership.display_name || me.user.email || 'member';
const clean = (v: FormDataEntryValue | null, max = 200) => String(v || '').trim().slice(0, max) || null;
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const uuid = (v: FormDataEntryValue | null) => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? String(v) : null);
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v || '').replace(/[, ]/g, '')); return v && String(v).trim() && isFinite(n) ? n : null; };

// The shared step: link an order to a style and carry the development record across.
async function carryOver(me: Me, sb: Awaited<ReturnType<typeof supabaseServer>>, styleId: string, orderId: string, opts: { seedMilestones?: { etd: string; factoryCountry: string | null } }) {
  const [{ data: s }, { data: o }, records, materials, { data: samples }] = await Promise.all([
    sb.from('styles').select('id, code, name, status, customer_id').eq('id', styleId).single(),
    sb.from('orders').select('id, po, mill_id, meta').eq('id', orderId).single(),
    styleRecords(sb, me.tenant.id, styleId),
    listMaterials(me.tenant.id, styleId, sb),
    sb.from('samples').select('id, type, round, decision, reviewed_at').eq('style_id', styleId).is('order_id', null).in('type', ['pp', 'top', 'shipment']),
  ]);
  if (!s || !o) throw new Error('not found');
  const tp = techPackVersions(records)[0] || null;
  const fabric = materials.filter((m) => m.kind === 'fabric' && m.status === 'approved');
  const mill = fabric.length === 1 ? fabric[0].supplier_id : null;
  const lead = Math.max(0, ...fabric.map((m) => m.lead_days || 0));
  // milestones for a new PO: plan from the ETD, fabric no earlier than the approved fabric's lead time allows
  if (opts.seedMilestones) {
    const plan = planFromEtd(opts.seedMilestones.etd, opts.seedMilestones.factoryCountry);
    if (lead) plan.fabric = isoOf(Math.max(dayOf(plan.fabric), today() + lead));
    const { data: have } = await sb.from('milestones').select('id').eq('order_id', orderId).limit(1);
    if (!have?.length) await sb.from('milestones').insert(MILESTONES.map((k) => ({ tenant_id: me.tenant.id, order_id: orderId, key: k, owner_kind: OWNERS[k], plan_date: plan[k] })));
  }
  const meta = { ...((o.meta as Record<string, unknown>) || {}), handover: { style_id: styleId, style_code: s.code, tech_pack_record_id: tp?.id || null, tech_pack_version: tp?.version || null, at: new Date().toISOString(), by: who(me), fabric_lead_days: lead || null } };
  await sb.from('orders').update({ style_id: styleId, mill_id: o.mill_id || mill, meta }).eq('id', orderId);
  // PP, TOP and shipment rounds belong to the order; an approved PP sets the PP milestone's actual date
  const moved = samples || [];
  if (moved.length) await sb.from('samples').update({ order_id: orderId }).in('id', moved.map((x) => x.id));
  const pp = moved.find((x) => x.type === 'pp' && (x.decision === 'approved' || x.decision === 'approved_with_comments'));
  if (pp?.reviewed_at) await sb.from('milestones').update({ actual_date: pp.reviewed_at.slice(0, 10), note: `PP round ${pp.round} approved in development`, updated_by: me.user.id }).eq('order_id', orderId).eq('key', 'pp');
  await sb.from('styles').update({ status: 'handed_over' }).eq('id', styleId);
  const what = `Handed over to PO ${o.po}: tech pack ${tp ? `v${tp.version}` : 'none confirmed'}, ${materials.length} materials (${fabric.length} fabric approved${mill ? ', mill set from it' : ''}), ${moved.length} PP/TOP/shipment round${moved.length === 1 ? '' : 's'} moved to the order${lead ? `; fabric lead ${lead} days` : ''}`;
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who(me), p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Handover', p_order: orderId, p_what: `Style ${s.code}${s.name ? ` ${s.name}` : ''}: ${what}`, p_gate: 'HANDOVER', p_gated: true, p_ref: { style_id: styleId, order_id: orderId, tech_pack: tp?.id || null }, p_track: 'development', p_style: styleId });
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who(me), p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Handover', p_order: orderId, p_what: `PO ${o.po} created from style ${s.code}: ${tp ? `tech pack v${tp.version} is the spec` : 'no confirmed tech pack'}; development records stay readable here, changes from now are Amendments`, p_gate: 'HANDOVER', p_gated: true, p_ref: { style_id: styleId, tech_pack: tp?.id || null }, p_track: 'production', p_style: styleId });
  return { po: o.po, moved: moved.length };
}

// From the style page: a new PO, or an existing PO that has no style yet.
export async function handoverStyle(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style'));
  const me = await requireTenant(slug), t = await getTranslations('handover');
  const path = `/app/${slug}/styles/${styleId}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('role') });
  const sb = await supabaseServer();
  const { data: s } = await sb.from('styles').select('id, code, name, status, customer_id, category, description, season, currency').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle();
  if (!s) back(`/app/${slug}/styles`, { error: 'not found' });
  if (s.status === 'handed_over' && !form.get('again')) back(path, { error: t('alreadyHanded') });
  const orderId = uuid(form.get('order_id'));
  if (orderId) {
    const { data: o } = await sb.from('orders').select('id, style_id').eq('tenant_id', me.tenant.id).eq('id', orderId).maybeSingle();
    if (!o) back(path, { error: 'not found' });
    if (o.style_id && o.style_id !== styleId) back(path, { error: t('orderHasStyle') });
    const r = await carryOver(me, sb, styleId, orderId, {});
    revalidatePath(path); revalidatePath(`/app/${slug}/orders`);
    redirect(`/app/${slug}/orders/${encodeURIComponent(r.po)}?saved=1`);
  }
  const po = clean(form.get('po'), 60), etd = date(form.get('etd')), factory_id = uuid(form.get('factory_id'));
  if (!po || !etd) back(path, { error: t('needPoEtd') });
  const { data: factory } = factory_id ? await sb.from('parties').select('id, country').eq('id', factory_id).maybeSingle() : { data: null };
  const [records] = await Promise.all([styleRecords(sb, me.tenant.id, styleId)]);
  const tp = techPackVersions(records)[0]?.parsed || null;
  const { data: o, error } = await sb.from('orders').insert({
    tenant_id: me.tenant.id, po, customer_id: s.customer_id, factory_id: factory?.id || null, owner_user_id: me.user.id, style: s.code, description: [s.name, s.description].filter(Boolean).join(' · ') || tp?.description || null, category: s.category || tp?.category || null, composition: tp?.fabric_summary || null,
    qty: num(form.get('qty')), fob: num(form.get('fob')), currency: clean(form.get('currency'), 3) || s.currency || 'USD', incoterm: clean(form.get('incoterm'), 10) || 'FOB', instore_date: date(form.get('instore_date')), destination: (clean(form.get('destination'), 2) || '').toUpperCase() || null, season: s.season, colours: (tp?.colourways || []).map((c) => c.name), status: 'open', source: 'handover', meta: {},
  }).select('id').single();
  if (error || !o) back(path, { error: /duplicate|unique/i.test(error?.message || '') ? t('duplicatePo') : error?.message || 'failed' });
  const r = await carryOver(me, sb, styleId, o.id, { seedMilestones: { etd, factoryCountry: (factory as { country?: string | null } | null)?.country || null } });
  revalidatePath(path); revalidatePath(`/app/${slug}/orders`); revalidatePath(`/app/${slug}/styles`);
  redirect(`/app/${slug}/orders/${encodeURIComponent(r.po)}?saved=1`);
}

// From the order page: the PO names a style code that is in development; a person links them.
export async function linkOrderToStyle(form: FormData) {
  const slug = String(form.get('tenant')), orderId = String(form.get('order_id')), styleId = String(form.get('style_id')), po = String(form.get('po'));
  const me = await requireTenant(slug), t = await getTranslations('handover');
  const path = `/app/${slug}/orders/${encodeURIComponent(po)}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('role') });
  const sb = await supabaseServer();
  const [{ data: o }, { data: s }] = await Promise.all([sb.from('orders').select('id, style_id').eq('tenant_id', me.tenant.id).eq('id', orderId).maybeSingle(), sb.from('styles').select('id').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle()]);
  if (!o || !s) back(path, { error: 'not found' });
  if (o.style_id) back(path, { error: t('orderHasStyle') });
  await carryOver(me, sb, styleId, orderId, {});
  revalidatePath(path); revalidatePath(`/app/${slug}/styles/${styleId}`);
  redirect(`${path}?saved=1`);
}
