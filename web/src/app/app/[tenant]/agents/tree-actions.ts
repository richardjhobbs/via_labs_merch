'use server';
// Director view overrides: pause or resume any agent, pin an order to a desk (or let the desk rules place it
// again), and close a decision an agent left for a person. Owners and managers only; each is a ledger row.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { reassignOrders } from '@/lib/agents/desks';

const back = (slug: string, q: string, anchor = '') => redirect(`/app/${slug}/agents/tree?${q}${anchor}`);

async function director(form: FormData) {
  const slug = String(form.get('slug'));
  const ctx = await requireTenant(slug);
  if (!['owner', 'manager'].includes(ctx.membership.role) || ctx.viewingAs) back(slug, 'terr=role');
  return { ...ctx, slug, who: ctx.membership.display_name || ctx.user.email || 'member' };
}

async function log(tenantId: string, who: string, userId: string, what: string, orderId: string | null, ref: Record<string, unknown>) {
  await supabaseAdmin().rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Workspace', p_actor: who, p_actor_user: userId, p_counterparty: null, p_stream: 'Setup', p_order: orderId, p_what: what, p_gate: 'ADMIN', p_gated: true, p_ref: ref });
}

export async function setAgentStatus(form: FormData) {
  const { tenant, user, who, slug } = await director(form);
  const id = String(form.get('id')), to = String(form.get('to'));
  if (!['active', 'paused'].includes(to)) back(slug, 'terr=fields');
  const sb = supabaseAdmin();
  const { data: a } = await sb.from('agents').select('id, name, order_id, status').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
  if (!a || a.status === 'closed') back(slug, 'terr=fields');
  await sb.from('agents').update({ status: to }).eq('id', a!.id);
  await reassignOrders(sb, tenant.id); // a paused desk's orders go to Mira, and come back when it resumes
  await log(tenant.id, who, user.id, `${to === 'paused' ? 'Paused' : 'Resumed'} agent ${a!.name}`, (a!.order_id as string | null) || null, { agent: a!.id });
  revalidatePath(`/app/${slug}/agents`, 'layout');
  back(slug, 'tsaved=1');
}

export async function pinOrder(form: FormData) {
  const { tenant, user, who, slug } = await director(form);
  const id = String(form.get('id')), desk = String(form.get('desk') || '');
  const sb = supabaseAdmin();
  const { data: a } = await sb.from('agents').select('id, name, order_id').eq('tenant_id', tenant.id).eq('id', id).eq('layer', 'order').maybeSingle();
  if (!a) back(slug, 'terr=fields');
  const { data: d } = desk ? await sb.from('agents').select('id, name').eq('tenant_id', tenant.id).eq('id', desk).eq('layer', 'desk').eq('status', 'active').maybeSingle() : { data: null };
  if (desk && !d) back(slug, 'terr=fields');
  await sb.from('agents').update({ pinned_parent_id: d?.id || null }).eq('id', a!.id);
  await reassignOrders(sb, tenant.id);
  await log(tenant.id, who, user.id, d ? `Moved ${a!.name} to desk "${d.name}"` : `${a!.name} placed by the desk rules again`, a!.order_id as string, { agent: a!.id, desk: d?.id || null });
  revalidatePath(`/app/${slug}/agents`, 'layout');
  back(slug, 'tsaved=1');
}

export async function resolveDecision(form: FormData) {
  const { tenant, user, who, slug } = await director(form);
  const id = String(form.get('id')), note = String(form.get('note') || '').trim().slice(0, 500);
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('agent_messages').select('id, body, order_id').eq('tenant_id', tenant.id).eq('id', id).eq('status', 'open').maybeSingle();
  if (!m) back(slug, 'terr=fields');
  await sb.from('agent_messages').update({ status: 'answered', decided_by: user.id, closed_at: new Date().toISOString(), body: { ...(m!.body as object), resolution: note || null, resolved_by: who } }).eq('id', m!.id);
  const b = m!.body as { factory?: string; title?: string; person_question?: string };
  await log(tenant.id, who, user.id, `Decided: ${b.person_question || b.title || b.factory || 'agent question'}${note ? `: ${note}` : ''}`.slice(0, 900), (m!.order_id as string | null) || null, { agent_message: m!.id });
  revalidatePath(`/app/${slug}/agents`, 'layout');
  back(slug, 'tsaved=1');
}
