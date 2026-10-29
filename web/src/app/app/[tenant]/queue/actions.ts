'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';

// A person approves (optionally after editing) or rejects a draft. Both are signed ledger rows.
export async function approveDraft(form: FormData) { return decide(form, 'approved'); }
export async function rejectDraft(form: FormData) { return decide(form, 'rejected'); }

async function decide(form: FormData, status: 'approved' | 'rejected') {
  const slug = String(form.get('tenant')), id = String(form.get('id')), body = String(form.get('body') || ''), note = String(form.get('note') || '').trim();
  const { tenant, membership, user } = await requireTenant(slug);
  if (membership.role === 'viewer') redirect(`/app/${slug}/queue?error=viewer`);
  const sb = await supabaseServer();
  const { data: d } = await sb.from('drafts').select('id, seq, title, body, stream, order_id, party_id, parties(name)').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
  if (!d) redirect(`/app/${slug}/queue?error=missing`);
  const edited = status === 'approved' && body.trim() && body.trim() !== d.body.trim();
  const who = membership.display_name || user.email || 'member';
  const { error } = await sb.from('drafts').update({ status, body: edited ? body : d.body, edited: !!edited, decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note || null }).eq('id', id);
  if (error) redirect(`/app/${slug}/queue?error=${encodeURIComponent(error.message)}`);
  const hh = new Date().toLocaleTimeString('en-GB', { timeZone: tenant.tz, hour: '2-digit', minute: '2-digit' });
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: user.id, p_counterparty: (d.parties as unknown as { name: string } | null)?.name || null, p_stream: d.stream, p_order: d.order_id, p_what: `${status === 'approved' ? (edited ? 'Edited and approved' : 'Approved') : 'Rejected'} Q-${d.seq}: ${d.title}${note ? ` (${note})` : ''}`, p_gate: `${status.toUpperCase()} ${hh} · ${who}`, p_gated: true, p_ref: { draft_id: id } });
  revalidatePath(`/app/${slug}/queue`); revalidatePath(`/app/${slug}`);
  redirect(`/app/${slug}/queue?saved=1`);
}
