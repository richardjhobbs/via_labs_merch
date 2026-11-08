'use server';
// A person acts on an alert from My day: ask the agent to draft a chaser (it goes to the approval queue like
// any other draft), or dismiss it with a reason. Both are ledger rows; alerts are written by the service role.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant, scopeOf } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { runAgent } from '@/lib/agents/run';
import { hasLlm } from '@/lib/llm';

async function load(slug: string, id: string) {
  const me = await requireTenant(slug);
  if (me.membership.role === 'viewer' || me.membership.id === 'admin') redirect(`/app/${slug}`);
  const sb = supabaseAdmin();
  const { data: a } = await sb.from('alerts').select('id, kind, order_id, party_id, milestone, due_date, detail, status').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!a || a.status !== 'open') redirect(`/app/${slug}`);
  return { me, sb, a, who: me.membership.display_name || me.user.email || 'member' };
}

export async function chaseAlert(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const { me, sb, a, who } = await load(slug, id);
  const d = (a.detail || {}) as { po?: string; party?: string; label?: string; days_silent?: number | null };
  if (!hasLlm()) redirect(`/app/${slug}?error=${encodeURIComponent('The agent is not switched on.')}`);
  const brief = `Nothing has come in from ${d.party} about PO ${d.po}: ${d.label} is due ${a.due_date}${d.days_silent != null ? ` and the last message from them was ${d.days_silent} days ago` : ''}. Queue exactly one chaser with queue_draft on stream "Production status" to ${d.party}, in their own language with body_en: ask them to confirm ${d.label} is on track for ${a.due_date} or give the new date and the reason, and to reply within one working day. Use get_order first for the dates. Do not promise anything. Reply with one line: the draft ref.`;
  const r = await runAgent({ tenantId: me.tenant.id, trigger: 'chat', userId: me.user.id, userName: who, userEmail: me.user.email, role: me.membership.role, scope: scopeOf(me.membership), messages: [{ role: 'user', content: brief }] });
  if (!r.drafts.length) redirect(`/app/${slug}?error=${encodeURIComponent(r.error || 'No chaser was drafted. Try asking Mira directly.')}`);
  await sb.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: me.user.id, resolution: `chased Q-${r.drafts[0].seq}` }).eq('id', a.id);
  revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/queue`);
  redirect(`/app/${slug}/queue`);
}

export async function dismissAlert(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const WHY: Record<string, string> = { heard: 'heard on another channel', onTrack: 'confirmed on track', notNeeded: 'not needed' };
  const why = WHY[String(form.get('why'))] || 'not needed';
  const { me, sb, a, who } = await load(slug, id);
  const d = (a.detail || {}) as { po?: string; party?: string; label?: string };
  await sb.from('alerts').update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolved_by: me.user.id, resolution: why }).eq('id', a.id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: d.party || null, p_stream: 'Production status', p_order: a.order_id, p_what: `Dismissed ${a.kind === 'silence' ? `the silence alert on ${d.label} (due ${a.due_date})` : 'the reminder'} for PO ${d.po || '-'}: ${why}`, p_gate: 'DISMISSED', p_gated: true, p_ref: { alert_id: a.id } });
  revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}?saved=1`);
}
