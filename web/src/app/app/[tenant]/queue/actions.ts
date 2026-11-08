'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { decideDraft } from '@/lib/drafts';
import { supabaseAdmin } from '@/lib/supabase/server';

// A person approves (optionally after editing) or rejects a draft. Both are signed ledger rows.
export async function approveDraft(form: FormData) { return decide(form, 'approved'); }
export async function rejectDraft(form: FormData) { return decide(form, 'rejected'); }

async function decide(form: FormData, status: 'approved' | 'rejected') {
  const slug = String(form.get('tenant')), id = String(form.get('id')), body = String(form.get('body') || ''), note = String(form.get('note') || '').trim();
  const back = String(form.get('back') || '');
  const me = await requireTenant(slug);
  const r = await decideDraft(me, id, status, { body, note });
  revalidatePath(`/app/${slug}/queue`); revalidatePath(`/app/${slug}`);
  const dest = back.startsWith(`/app/${slug}`) ? back : `/app/${slug}/queue`;
  redirect(dest + (dest.includes('?') ? '&' : '?') + (r.ok ? 'saved=1' : 'error=' + encodeURIComponent(r.error || 'failed')));
}

// A person sent an approved reply themselves (from Zalo, WeChat, WhatsApp, their phone or mail): record when,
// how and by whom, and close the draft. Signed ledger row.
export async function markSentByHand(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const via = String(form.get('via') || 'other').replace(/[^a-z]/g, '').slice(0, 20) || 'other';
  const me = await requireTenant(slug);
  if (me.membership.role === 'viewer' || me.membership.id === 'admin') redirect(`/app/${slug}/queue`);
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('messages').select('id, raw, stream, order_id, sent_at, direction, parties(name)').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (m && m.direction === 'out' && !m.sent_at) {
    const raw = (m.raw || {}) as { draft_id?: string };
    const who = me.membership.display_name || me.user.email || 'member';
    await sb.from('messages').update({ sent_at: new Date().toISOString(), raw: { ...raw, send: 'manual', via, sent_by: me.user.id } }).eq('id', id);
    if (raw.draft_id) await sb.from('drafts').update({ status: 'sent' }).eq('id', raw.draft_id).eq('tenant_id', me.tenant.id);
    await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: via, p_actor: who, p_actor_user: me.user.id, p_counterparty: (m.parties as unknown as { name: string } | null)?.name || null, p_stream: m.stream, p_order: m.order_id, p_what: `Sent by hand via ${via}`, p_gate: 'SENT', p_gated: true, p_ref: { message_id: id, draft_id: raw.draft_id || null } });
  }
  revalidatePath(`/app/${slug}/queue`);
  redirect(`/app/${slug}/queue?saved=1`);
}
