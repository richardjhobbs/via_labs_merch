// Reads for the workspace, under the signed-in person's RLS.
import { supabaseServer } from './supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// Agents and job workers pass the service-role client; screens use the person's RLS client.
type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import { orderHealth, slipException, type MilestoneRow, type Health } from './core/path';

export type OrderRow = {
  id: string; po: string; style: string | null; description: string | null; category: string | null; composition: string | null;
  qty: number | null; sizes: Record<string, number>; colours: string[]; fob: number | null; currency: string; incoterm: string | null;
  pol: string | null; pod: string | null; destination: string | null; instore_date: string | null; season: string | null; status: string; source: string | null; style_id: string | null; meta: Record<string, unknown> | null;
  dev_style: { id: string; code: string; name: string | null; status: string } | null;
  customer: { id: string; name: string; short: string | null } | null; factory: { id: string; name: string; short: string | null; country: string | null } | null;
  mill: { id: string; name: string; short: string | null } | null; fibre: { id: string; name: string; short: string | null } | null;
  milestones: (MilestoneRow & { id: string; forecast_date: string | null; note: string | null })[];
};
export type OrderWithHealth = OrderRow & { health: Health };

const SELECT = 'id, po, style, description, category, composition, qty, sizes, colours, fob, currency, incoterm, pol, pod, destination, instore_date, season, status, source, style_id, meta, dev_style:styles!orders_style_id_fkey(id, code, name, status), customer:parties!orders_customer_id_fkey(id, name, short), factory:parties!orders_factory_id_fkey(id, name, short, country), mill:parties!orders_mill_id_fkey(id, name, short), fibre:parties!orders_fibre_id_fkey(id, name, short), milestones(id, key, plan_date, expected_date, actual_date, forecast_date, owner_kind, note)';

export async function listOrders(tenantId: string, opts: { status?: string; customers?: string[] | null } = {}, client?: Client): Promise<OrderWithHealth[]> {
  const sb = client || await supabaseServer();
  let q = sb.from('orders').select(SELECT).eq('tenant_id', tenantId).order('po');
  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  const rows = ((data || []) as unknown as OrderRow[]).filter((o) => !opts.customers || (o.customer && opts.customers.includes(o.customer.id)));
  return rows.map((o) => ({ ...o, health: orderHealth(o.milestones) }));
}

// A PO number is unique per customer, not per company (two brands can both send PO 1, migration 0028).
export type PoMatch = { id: string; po: string; customer: { id: string; name: string; short: string | null } | null; factory: { name: string } | null };
export async function ordersByPo(sb: Client, tenantId: string, po: string): Promise<PoMatch[]> {
  const { data } = await sb.from('orders').select('id, po, customer:parties!orders_customer_id_fkey(id, name, short), factory:parties!orders_factory_id_fkey(name)').eq('tenant_id', tenantId).eq('po', po.trim()).limit(20);
  return (data || []) as unknown as PoMatch[];
}

// One order from a PO and, when several customers share the number, the customer's name, code or id.
export function pickOrder(matches: PoMatch[], po: string, customer?: string | null): { id: string } | { error: string } {
  if (!matches.length) return { error: `No PO ${po} in this company` };
  let L = matches;
  const q = customer?.trim().toLowerCase();
  if (q && L.length > 1) L = L.filter((m) => m.customer && (m.customer.id === q || m.customer.name.toLowerCase() === q || (m.customer.short || '').toLowerCase() === q || m.customer.name.toLowerCase().includes(q)));
  if (L.length === 1) return { id: L[0].id };
  const who = (L.length ? L : matches).map((m) => m.customer?.name || 'no customer').join(', ');
  return { error: L.length ? `PO ${po} exists for more than one customer (${who}). Say which customer.` : `PO ${po} is not on file for ${customer}. It exists for: ${who}.` };
}

// The order page and the agent pass a PO number or an order id; a PO that several customers share returns null.
export async function getOrder(tenantId: string, ref: string, client?: Client): Promise<OrderWithHealth | null> {
  const sb = client || await supabaseServer();
  if (/^[0-9a-f-]{36}$/i.test(ref)) return getOrderById(tenantId, ref, sb);
  const { data } = await sb.from('orders').select(SELECT).eq('tenant_id', tenantId).eq('po', ref).limit(2);
  if (!data || data.length !== 1) return null;
  const o = data[0] as unknown as OrderRow;
  return { ...o, health: orderHealth(o.milestones) };
}

export async function getOrderById(tenantId: string, id: string, client?: Client): Promise<OrderWithHealth | null> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('orders').select(SELECT).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!data) return null;
  const o = data as unknown as OrderRow;
  return { ...o, health: orderHealth(o.milestones) };
}

export function exceptionsOf(orders: OrderWithHealth[]) {
  return orders.filter((o) => o.status === 'open').map((o) => slipException(o.po, o.qty || 0, o.fob || 0, o.health)).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'crit' ? -1 : 1));
}
