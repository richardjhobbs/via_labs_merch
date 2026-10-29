// Reads for the workspace, under the signed-in person's RLS.
import { supabaseServer } from './supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// Agents and job workers pass the service-role client; screens use the person's RLS client.
type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import { orderHealth, slipException, type MilestoneRow, type Health } from './core/path';

export type OrderRow = {
  id: string; po: string; style: string | null; description: string | null; category: string | null; composition: string | null;
  qty: number | null; sizes: Record<string, number>; colours: string[]; fob: number | null; currency: string; incoterm: string | null;
  pol: string | null; pod: string | null; instore_date: string | null; season: string | null; status: string; source: string | null;
  customer: { id: string; name: string; short: string | null } | null; factory: { id: string; name: string; short: string | null; country: string | null } | null;
  mill: { id: string; name: string; short: string | null } | null; fibre: { id: string; name: string; short: string | null } | null;
  milestones: (MilestoneRow & { id: string; forecast_date: string | null; note: string | null })[];
};
export type OrderWithHealth = OrderRow & { health: Health };

const SELECT = 'id, po, style, description, category, composition, qty, sizes, colours, fob, currency, incoterm, pol, pod, instore_date, season, status, source, customer:parties!orders_customer_id_fkey(id, name, short), factory:parties!orders_factory_id_fkey(id, name, short, country), mill:parties!orders_mill_id_fkey(id, name, short), fibre:parties!orders_fibre_id_fkey(id, name, short), milestones(id, key, plan_date, expected_date, actual_date, forecast_date, owner_kind, note)';

export async function listOrders(tenantId: string, opts: { status?: string; customers?: string[] | null } = {}, client?: Client): Promise<OrderWithHealth[]> {
  const sb = client || await supabaseServer();
  let q = sb.from('orders').select(SELECT).eq('tenant_id', tenantId).order('po');
  if (opts.status) q = q.eq('status', opts.status);
  const { data } = await q;
  const rows = ((data || []) as unknown as OrderRow[]).filter((o) => !opts.customers || (o.customer && opts.customers.includes(o.customer.id)));
  return rows.map((o) => ({ ...o, health: orderHealth(o.milestones) }));
}

export async function getOrder(tenantId: string, po: string, client?: Client): Promise<OrderWithHealth | null> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('orders').select(SELECT).eq('tenant_id', tenantId).eq('po', po).maybeSingle();
  if (!data) return null;
  const o = data as unknown as OrderRow;
  return { ...o, health: orderHealth(o.milestones) };
}

export function exceptionsOf(orders: OrderWithHealth[]) {
  return orders.filter((o) => o.status === 'open').map((o) => slipException(o.po, o.qty || 0, o.fob || 0, o.health)).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'crit' ? -1 : 1));
}
