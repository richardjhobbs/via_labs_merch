// A person's decision on a draft, shared by the approval queue and the assistant panel.
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { queueBrief } from '@/lib/agents/order-agent';
import { recordDecision } from '@/lib/agents/desks';
import { queueLesson } from '@/lib/agents/learning';
import type { requireTenant } from '@/lib/tenant';
import { recordOutbound } from '@/lib/threads';

type Me = Awaited<ReturnType<typeof requireTenant>>;

export async function decideDraft(me: Me, id: string, status: 'approved' | 'rejected', opts: { body?: string; note?: string } = {}): Promise<{ ok: boolean; error?: string; seq?: number }> {
  const { tenant, membership, user } = me;
  if (membership.role === 'viewer') return { ok: false, error: 'viewers cannot decide drafts' };
  const sb = await supabaseServer();
  const { data: d } = await sb.from('drafts').select('id, seq, title, body, body_en, lang, stream, status, order_id, party_id, source_message_id, track, style_id, parties(name)').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
  if (!d) return { ok: false, error: 'draft not found' };
  if (d.status !== 'queued' && d.status !== 'escalated') return { ok: false, error: `already ${d.status}`, seq: d.seq };
  const body = (opts.body || '').trim(), note = (opts.note || '').trim();
  const edited = status === 'approved' && !!body && body !== d.body.trim();
  const who = membership.display_name || user.email || 'member';
  const { error } = await sb.from('drafts').update({ status, body: edited ? body : d.body, edited, decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note || null }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  const hh = new Date().toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' });
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: user.id, p_counterparty: (d.parties as unknown as { name: string } | null)?.name || null, p_stream: d.stream, p_order: d.order_id, p_what: `${status === 'approved' ? (edited ? 'Edited and approved' : 'Approved') : 'Rejected'} Q-${d.seq}: ${d.title}${note ? ` (${note})` : ''}`, p_gate: `${status.toUpperCase()} ${hh} · ${who}`, p_gated: true, p_ref: { draft_id: id }, p_track: d.track || 'production', p_style: d.style_id || null });
  if (status === 'approved') await recordOutbound(tenant.id, { id: d.id, body: edited ? body : d.body, body_en: d.body_en, lang: d.lang, stream: d.stream, party_id: d.party_id, order_id: d.order_id, source_message_id: d.source_message_id, track: d.track, style_id: d.style_id }, who);
  await recordDecision(tenant.id, d.id, status, user.id, who);
  // a person's correction is something to learn from: an agent proposes a lesson, a person confirms it
  if (status === 'approved' && edited) await queueLesson(supabaseAdmin(), { tenant_id: tenant.id, draft_id: d.id, decision: 'edited', before: d.body, after: body });
  if (status === 'rejected' && note) await queueLesson(supabaseAdmin(), { tenant_id: tenant.id, draft_id: d.id, decision: 'rejected', before: d.body, note });
  await queueBrief(supabaseAdmin(), tenant.id, d.order_id, `draft ${status}`);
  return { ok: true, seq: d.seq };
}
