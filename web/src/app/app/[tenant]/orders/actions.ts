'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';
import { LABELS, MILESTONES, OWNERS, planFromEtd, type MilestoneKey } from '@/lib/core/path';

// A person reports a revised or actual date. The forecast downstream is recomputed
// on read, and the change is a signed ledger row.
export async function setMilestone(form: FormData) {
  const slug = String(form.get('tenant')), orderId = String(form.get('order_id')), key = String(form.get('key')) as MilestoneKey, field = String(form.get('field')), date = String(form.get('date') || '');
  const { tenant, membership, user } = await requireTenant(slug);
  const sb = await supabaseServer();
  const { data: o } = await sb.from('orders').select('po').eq('id', orderId).eq('tenant_id', tenant.id).maybeSingle();
  if (!o || !MILESTONES.includes(key) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`/app/${slug}/orders`);
  const patch = field === 'actual' ? { actual_date: date } : { expected_date: date, actual_date: null };
  const { error } = await sb.from('milestones').update({ ...patch, updated_by: user.id }).eq('order_id', orderId).eq('key', key);
  if (error) redirect(`/app/${slug}/orders/${encodeURIComponent(o.po)}?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Production status', p_order: orderId, p_what: `${LABELS[key]} ${field} date set to ${date}`, p_gate: 'Logged', p_gated: false, p_ref: { key, field, date } });
  revalidatePath(`/app/${slug}/orders`);
  redirect(`/app/${slug}/orders/${encodeURIComponent(o.po)}?saved=1`);
}

// Import orders from a spreadsheet. Expected headers (case-insensitive):
// PO, Customer, Factory, Style, Description, Qty, FOB, ETD (date), and optionally
// Mill, Fibre, Category, Composition, Currency, Incoterm, POL, POD, In-store, Season.
const H = (r: Record<string, unknown>, ...names: string[]) => { for (const n of names) { const k = Object.keys(r).find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (k !== undefined && r[k] !== '' && r[k] != null) return r[k]; } return undefined; };
const toIso = (v: unknown): string | null => { if (v == null || v === '') return null; if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; } const s = String(v).trim(); const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) || s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/); if (!m) { const d = new Date(s); return isNaN(+d) ? null : d.toISOString().slice(0, 10); } return m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };

export async function importOrders(_prev: { ok: boolean; message: string }, form: FormData): Promise<{ ok: boolean; message: string }> {
  const slug = String(form.get('tenant'));
  const { tenant, membership, user } = await requireTenant(slug);
  if (membership.role === 'viewer') return { ok: false, message: 'Viewers cannot import.' };
  const file = form.get('file') as File | null;
  if (!file || !file.size) return { ok: false, message: 'Choose a file first.' };
  if (file.size > 5_000_000) return { ok: false, message: 'File is larger than 5 MB.' };
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', cellDates: false });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) return { ok: false, message: 'The first sheet has no rows.' };
  const sb = await supabaseServer();
  const { data: existing } = await sb.from('parties').select('id, name, kind, country').eq('tenant_id', tenant.id);
  const byName = new Map((existing || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const party = async (name: unknown, kind: string, country?: unknown) => {
    const n = String(name || '').trim(); if (!n) return null;
    const hit = byName.get(n.toLowerCase()); if (hit) return hit;
    const { data } = await sb.from('parties').insert({ tenant_id: tenant.id, kind, name: n, short: n.split(/\s+/)[0], country: country ? String(country).trim().toUpperCase().slice(0, 2) : null, meta: { source: 'import' } }).select('id, name, kind, country').single();
    if (data) byName.set(n.toLowerCase(), data); return data;
  };
  let created = 0, skipped = 0; const problems: string[] = [];
  for (const [i, r] of rows.entries()) {
    const po = String(H(r, 'PO', 'PO number', 'Order') || '').trim();
    const etd = toIso(H(r, 'ETD', 'Ship date', 'Ex-factory'));
    if (!po || !etd) { problems.push(`Row ${i + 2}: needs PO and ETD`); skipped++; continue; }
    const customer = await party(H(r, 'Customer', 'Brand', 'Buyer'), 'brand', H(r, 'Customer country'));
    const factory = await party(H(r, 'Factory', 'Supplier', 'Vendor'), 'factory', H(r, 'Factory country', 'Country'));
    const mill = await party(H(r, 'Mill', 'Fabric mill'), 'mill'); const fibre = await party(H(r, 'Fibre', 'Fiber', 'Yarn'), 'fibre');
    const qty = Number(H(r, 'Qty', 'Quantity', 'Units') || 0) || null, fob = Number(H(r, 'FOB', 'Price', 'Unit price') || 0) || null;
    const { data: o, error } = await sb.from('orders').insert({ tenant_id: tenant.id, po, customer_id: customer?.id || null, factory_id: factory?.id || null, mill_id: mill?.id || null, fibre_id: fibre?.id || null, owner_user_id: user.id, style: String(H(r, 'Style', 'Style code') || '') || null, description: String(H(r, 'Description', 'Desc', 'Product') || '') || null, category: String(H(r, 'Category') || '') || null, composition: String(H(r, 'Composition', 'Fabric') || '') || null, qty, fob, currency: String(H(r, 'Currency') || 'USD').toUpperCase().slice(0, 3), incoterm: String(H(r, 'Incoterm') || 'FOB'), pol: String(H(r, 'POL', 'Port of loading') || '') || null, pod: String(H(r, 'POD', 'Port of discharge', 'Destination') || '') || null, instore_date: toIso(H(r, 'In-store', 'Instore', 'In store')), season: String(H(r, 'Season') || '') || null, source: 'import' }).select('id').single();
    if (error || !o) { problems.push(`Row ${i + 2} (${po}): ${error?.message.includes('duplicate') ? 'PO already exists' : error?.message}`); skipped++; continue; }
    const plan = planFromEtd(etd, factory?.country);
    const ms = MILESTONES.map((k) => { const given = toIso(H(r, LABELS[k], k)); return { tenant_id: tenant.id, order_id: o.id, key: k, owner_kind: OWNERS[k], plan_date: given || plan[k] }; });
    await sb.from('milestones').insert(ms);
    created++;
  }
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Imported ${created} POs from ${file.name}${skipped ? ` (${skipped} skipped)` : ''}`, p_gate: 'Logged', p_gated: false, p_ref: { file: file.name, created, skipped } });
  revalidatePath(`/app/${slug}/orders`);
  return { ok: created > 0, message: `${created} orders imported${skipped ? `, ${skipped} skipped: ${problems.slice(0, 5).join('; ')}` : ''}.` };
}
