'use server';
// Desks: an agent over a group of orders, working for a senior merchandiser. Owners and managers add, edit and
// close desks; only an owner sets a desk's ceilings (the most it may approve per stream, never above the gate).
// Every change is a ledger row, and the company's order agents are moved to the desk their rule now matches.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { reassignOrders } from '@/lib/agents/desks';
import type { DeskRule } from '@/lib/agents/authority';

const back = (slug: string, q: string) => redirect(`/app/${slug}/agents?${q}#desks`);

export async function saveDesk(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, membership, user, viewingAs } = await requireTenant(slug);
  if (!['owner', 'manager'].includes(membership.role) || viewingAs) back(slug, 'derr=role');
  const id = String(form.get('id') || '');
  const name = String(form.get('name') || '').trim().slice(0, 60);
  const by = String(form.get('by') || 'customer') as DeskRule['by'];
  if (!name || !['customer', 'supplier', 'category', 'list'].includes(by)) back(slug, 'derr=fields');
  const rule: DeskRule = { by };
  if (by === 'customer') rule.ids = form.getAll('customers').map(String).filter(Boolean);
  if (by === 'supplier') rule.ids = form.getAll('suppliers').map(String).filter(Boolean);
  if (by === 'category') rule.categories = String(form.get('categories') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (by === 'list') rule.order_ids = form.getAll('orders').map(String).filter(Boolean);
  const person = String(form.get('person') || '') || null;
  const sb = supabaseAdmin();
  if (person) { const { data: m } = await sb.from('memberships').select('id').eq('tenant_id', tenant.id).eq('id', person).neq('role', 'partner').maybeSingle(); if (!m) back(slug, 'derr=person'); }
  const { data: mira } = await sb.from('agents').select('id, languages').eq('tenant_id', tenant.id).eq('layer', 'manager').eq('track', 'production').limit(1).maybeSingle();
  const { data: cur } = id ? await sb.from('agents').select('id, ceilings').eq('tenant_id', tenant.id).eq('id', id).eq('layer', 'desk').maybeSingle() : { data: null };
  if (id && !cur) back(slug, 'derr=fields');
  // ceilings: the owner's to set; for anyone else they stay as they were (a new desk starts at L1)
  let ceilings = (cur?.ceilings as Record<string, number> | null) || {};
  if (membership.role === 'owner') {
    ceilings = {};
    for (const [k, v] of form.entries()) if (k.startsWith('ceil:')) { const n = Number(v); if (n >= 0 && n <= 3) ceilings[k.slice(5)] = n; }
  }
  const who = membership.display_name || user.email || 'member';
  const row = { name, desk_rule: rule, person_id: person, ceilings };
  const { error } = cur
    ? await sb.from('agents').update(row).eq('id', cur.id)
    : await sb.from('agents').insert({ ...row, tenant_id: tenant.id, layer: 'desk', scope_kind: 'desk', track: 'production', parent_agent_id: mira?.id || null, model: 'claude-sonnet-5-5', languages: mira?.languages || ['en'] });
  if (error) back(slug, `derr=${encodeURIComponent(error.message)}`);
  const moved = await reassignOrders(sb, tenant.id);
  const lv = Object.entries(ceilings).filter(([, n]) => n !== 1).map(([s, n]) => `${s} L${n}`).join(', ');
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Workspace', p_actor: who, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${cur ? 'Updated' : 'Added'} desk "${name}" (by ${by})${lv ? `; ceilings ${lv}` : ''}; ${moved} order${moved === 1 ? '' : 's'} moved`, p_gate: 'ADMIN', p_gated: true, p_ref: { desk: cur?.id || null, rule, ceilings } });
  revalidatePath(`/app/${slug}/agents`);
  back(slug, 'dsaved=1');
}

export async function closeDesk(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, membership, user, viewingAs } = await requireTenant(slug);
  if (!['owner', 'manager'].includes(membership.role) || viewingAs) back(slug, 'derr=role');
  const sb = supabaseAdmin();
  const { data: d } = await sb.from('agents').select('id, name').eq('tenant_id', tenant.id).eq('id', id).eq('layer', 'desk').maybeSingle();
  if (!d) back(slug, 'derr=fields');
  await sb.from('agents').update({ status: 'closed' }).eq('id', d!.id);
  const moved = await reassignOrders(sb, tenant.id);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Workspace', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Closed desk "${d!.name}"; ${moved} order${moved === 1 ? '' : 's'} moved`, p_gate: 'ADMIN', p_gated: true, p_ref: { desk: d!.id } });
  revalidatePath(`/app/${slug}/agents`);
  back(slug, 'dsaved=1');
}
