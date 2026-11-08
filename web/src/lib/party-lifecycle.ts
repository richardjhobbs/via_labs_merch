// Archive, restore and delete customers and suppliers. Server only (service role, after a role check).
// No activity: delete at once. Activity: archive, hidden from lists and pickers, restorable, and purged
// 183 days later; the purge unlinks orders, messages and other records first, so they stay without the party.
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ARCHIVE_DAYS = 183;
export const purgeDate = (archivedAt: string) => new Date(Date.parse(archivedAt) + ARCHIVE_DAYS * 86_400_000).toISOString().slice(0, 10);

// Every record that points at the party; [table, column, label key]
const REFS: [string, string, string][] = [
  ['orders', 'customer_id', 'orders'], ['orders', 'factory_id', 'orders'], ['orders', 'mill_id', 'orders'], ['orders', 'fibre_id', 'orders'],
  ['messages', 'party_id', 'messages'], ['threads', 'party_id', 'messages'], ['drafts', 'party_id', 'drafts'],
  ['esg_tasks', 'party_id', 'compliance'], ['esg_requirements', 'supplier_party_id', 'compliance'], ['esg_programmes', 'issuer_party_id', 'compliance'],
  ['party_bank_accounts', 'party_id', 'bank'], ['milestones', 'owner_party_id', 'orders'], ['agent_requests', 'party_id', 'messages'], ['parties', 'through_party_id', 'supply'],
];

export async function activityOf(sb: Client, tenantId: string, partyId: string) {
  const counts = await Promise.all(REFS.map(([t, c]) => sb.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq(c, partyId).then((r) => r.count || 0)));
  const by: Record<string, number> = {};
  REFS.forEach(([, , k], i) => { if (counts[i]) by[k] = (by[k] || 0) + counts[i]; });
  return { total: counts.reduce((a, b) => a + b, 0), by };
}

// Remove the party for good: keep every other record, without the link. Contacts, bank accounts and the
// party's own compliance tasks go with it (ON DELETE CASCADE). The ledger keeps the name as text.
export async function deleteParty(sb: Client, tenantId: string, partyId: string) {
  // milestone owner, messages, threads, drafts and the rest lose the link; orders keep their history
  for (const [t, c] of REFS) {
    if (t === 'party_bank_accounts' || t === 'esg_tasks') continue;
    // a requirement the supplier had to provide is switched off: unlinking would hand it to the company
    const patch = t === 'esg_requirements' ? { [c]: null, active: false } : { [c]: null };
    const { error } = await sb.from(t).update(patch).eq('tenant_id', tenantId).eq(c, partyId);
    if (error) throw new Error(`${t}.${c}: ${error.message}`);
  }
  const { error } = await sb.from('parties').delete().eq('tenant_id', tenantId).eq('id', partyId);
  if (error) throw new Error(error.message);
}

// Hourly: delete parties archived more than ARCHIVE_DAYS ago, a few at a time.
export async function purgeArchived(sb: Client, deadline: number) {
  const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000).toISOString();
  const { data } = await sb.from('parties').select('id, tenant_id, name, kind, archived_at').lt('archived_at', cutoff).limit(10);
  let n = 0;
  for (const p of data || []) {
    if (Date.now() > deadline - 4000) break;
    await deleteParty(sb, p.tenant_id, p.id);
    await sb.rpc('ledger_append', { p_tenant: p.tenant_id, p_channel: 'Console', p_actor: 'VIA Merch', p_actor_user: null, p_counterparty: p.name, p_stream: 'Setup', p_order: null, p_what: `Deleted ${p.name} automatically, ${ARCHIVE_DAYS} days after it was archived (${String(p.archived_at).slice(0, 10)}); orders and messages kept without the link`, p_gate: 'PURGED', p_gated: true, p_ref: {} });
    n++;
  }
  return n;
}
