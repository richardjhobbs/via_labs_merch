'use server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { COLS, H, num, toIso } from '@/lib/import-parse';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { pickedFile } from '@/lib/connectors/drive';
import { requireTenant } from '@/lib/tenant';
import { LABELS, MILESTONES, OWNERS, planFromEtd, type MilestoneKey } from '@/lib/core/path';
import { queueBrief } from '@/lib/agents/order-agent';

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
  if (error) redirect(`/app/${slug}/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Production status', p_order: orderId, p_what: `${LABELS[key]} ${field} date set to ${date}`, p_gate: 'Logged', p_gated: false, p_ref: { key, field, date } });
  await queueBrief(supabaseAdmin(), tenant.id, orderId, 'milestone');
  revalidatePath(`/app/${slug}/orders`);
  redirect(`/app/${slug}/orders/${orderId}?saved=1`);
}

// Import orders from a spreadsheet. Expected headers (case-insensitive):
// PO, Customer, Factory, Style, Description, Qty, FOB, ETD (date), and optionally
// Mill, Fibre, Category, Composition, Currency, Incoterm, POL, POD, Destination (country code), In-store, Season.


export type ImportState = { ok: boolean; message: string; tone?: 'ok' | 'warn' | 'crit'; existing?: string[] };
export async function importOrders(_prev: ImportState, form: FormData): Promise<ImportState> {
  const slug = String(form.get('tenant'));
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('orders');
  if (membership.role === 'viewer') return { ok: false, message: t('importViewer') };
  // a Google Sheet chosen in Drive is exported as .xlsx and imported exactly like an upload
  let file = form.get('file') as File | null;
  const driveId = String(form.get('drive_file_id') || '');
  if ((!file || !file.size) && driveId) {
    const r = await pickedFile(supabaseAdmin(), tenant.id, user.id, driveId);
    if ('error' in r) return { ok: false, message: (await getTranslations('drive'))(r.error) };
    file = r.file;
  }
  if (!file || !file.size) return { ok: false, message: t('importNoFile') };
  if (file.size > 4_000_000) return { ok: false, message: t('importTooBig') };
  // a CSV is read as text, so decimal commas and day-first dates are interpreted by the rules above, not guessed
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', cellDates: false, raw: isCsv });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) return { ok: false, message: `${t('importEmpty')} ${t('importUnchanged')}` };
  // when the PO or ETD column is not there at all, say so and show the columns the file has
  const heads = Object.keys(rows[0]).map((h) => h.replace(/^\ufeff/, '').trim()).filter(Boolean);
  const missing = [!rows.some((r) => H(r, ...COLS.po)) && 'PO', !rows.some((r) => H(r, ...COLS.etd)) && 'ETD'].filter(Boolean) as string[];
  if (missing.length) return { ok: false, message: `${t('importMissingCols', { missing: missing.join(', '), found: heads.slice(0, 20).join(', ') || '—' })} ${t('importUnchanged')}` };
  const sb = await supabaseServer();
  const { data: existing } = await sb.from('parties').select('id, name, kind, country').eq('tenant_id', tenant.id);
  const byName = new Map((existing || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const party = async (name: unknown, kind: string, country?: unknown) => {
    const n = String(name || '').trim(); if (!n) return null;
    const hit = byName.get(n.toLowerCase()); if (hit) return hit;
    const { data } = await sb.from('parties').insert({ tenant_id: tenant.id, kind, name: n, short: n.split(/\s+/)[0], country: country ? String(country).trim().toUpperCase().slice(0, 2) : null, meta: { source: 'import' } }).select('id, name, kind, country').single();
    if (data) byName.set(n.toLowerCase(), data); return data;
  };
  let created = 0, skipped = 0; const problems: string[] = []; const dups: string[] = [];
  for (const [i, r] of rows.entries()) {
    const po = String(H(r, ...COLS.po) || '').trim();
    const etd = toIso(H(r, ...COLS.etd));
    if (!po || !etd) { problems.push(t('rowNeeds', { row: i + 2 })); skipped++; continue; }
    const customer = await party(H(r, ...COLS.customer), 'brand', H(r, 'Customer country'));
    const factory = await party(H(r, ...COLS.factory), 'factory', H(r, 'Factory country', 'Country'));
    const mill = await party(H(r, 'Mill', 'Fabric mill'), 'mill'); const fibre = await party(H(r, 'Fibre', 'Fiber', 'Yarn'), 'fibre');
    const dest = String(H(r, 'Destination', 'Destination country', 'Ship to country', 'Country of destination') || '').trim().toUpperCase();
    const destination = /^[A-Z]{2}$/.test(dest) ? dest : (customer as { country?: string | null } | null)?.country?.toUpperCase() || null;
    const qty = num(H(r, ...COLS.qty)), fob = num(H(r, ...COLS.fob));
    const { data: o, error } = await sb.from('orders').insert({ tenant_id: tenant.id, po, destination, customer_id: customer?.id || null, factory_id: factory?.id || null, mill_id: mill?.id || null, fibre_id: fibre?.id || null, owner_user_id: user.id, style: String(H(r, ...COLS.style) || '') || null, description: String(H(r, ...COLS.description) || '') || null, category: String(H(r, 'Category') || '') || null, composition: String(H(r, 'Composition', 'Fabric') || '') || null, qty, fob, currency: String(H(r, 'Currency') || 'USD').toUpperCase().slice(0, 3), incoterm: String(H(r, 'Incoterm') || 'FOB'), pol: String(H(r, 'POL', 'Port of loading') || '') || null, pod: String(H(r, 'POD', 'Port of discharge', 'Destination') || '') || null, instore_date: toIso(H(r, 'In-store', 'Instore', 'In store')), season: String(H(r, 'Season') || '') || null, source: 'import' }).select('id').single();
    if (error || !o) { const dup = !!error?.message.includes('duplicate'); if (dup) dups.push(po); problems.push(dup ? t('rowDup', { row: i + 2, po }) : `${i + 2} (${po}): ${error?.message}`); skipped++; continue; }
    const plan = planFromEtd(etd, factory?.country);
    const ms = MILESTONES.map((k) => { const given = toIso(H(r, LABELS[k], k)); return { tenant_id: tenant.id, order_id: o.id, key: k, owner_kind: OWNERS[k], plan_date: given || plan[k] }; });
    await sb.from('milestones').insert(ms);
    created++;
  }
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Imported ${created} POs from ${file.name}${driveId ? ' (Google Drive)' : ''}${skipped ? ` (${skipped} skipped)` : ''}`, p_gate: 'Logged', p_gated: false, p_ref: { file: file.name, created, skipped } });
  revalidatePath(`/app/${slug}/orders`);
  const why = skipped ? ` ${t('importSkipped', { n: skipped, why: problems.slice(0, 5).join('; ') })}` : '';
  // every skipped row is a PO already here (a file uploaded twice): nothing is wrong, so say so calmly and link to them
  if (!created && skipped && dups.length === skipped) return { ok: false, tone: 'warn', existing: dups.slice(0, 10), message: t('importAllExist', { n: dups.length }) };
  return { ok: created > 0, tone: created ? (skipped ? 'warn' : 'ok') : 'crit', existing: dups.slice(0, 10), message: created ? `${t('importDone', { n: created })}${why}` : `${t('importNone')}${why} ${t('importUnchanged')}` };
}

// Where the goods go (ISO country code): market compliance rules follow it.
export async function setDestination(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('order_id'));
  const { tenant, membership, user } = await requireTenant(slug);
  const back = `/app/${slug}/orders/${id}`;
  const code = String(form.get('destination') || '').trim().toUpperCase();
  if (membership.role === 'viewer' || (code && !/^[A-Z]{2}$/.test(code))) redirect(`${back}?error=${encodeURIComponent('Use a two-letter country code, e.g. DE or US.')}`);
  const sb = await supabaseServer();
  const { error } = await sb.from('orders').update({ destination: code || null }).eq('id', id).eq('tenant_id', tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: id, p_what: `Destination set to ${code || 'none'}`, p_gate: 'Logged', p_gated: false, p_ref: {} });
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}
