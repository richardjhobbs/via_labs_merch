'use server';
// Mailbox settings and disconnect. Only the member who connected the mailbox, or an owner or manager,
// may change it. Writes go through the service role (members cannot write merch.channels directly).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { findLabelId, revoke, type Channel, type GmailConfig } from '@/lib/connectors/google';

async function load(slug: string, id: string) {
  const me = await requireTenant(slug);
  const sb = supabaseAdmin();
  const { data: ch } = await sb.from('channels').select('id, tenant_id, kind, status, account, owner_user_id, auth_enc, config, last_sync_at').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  const allowed = !!ch && me.membership.id !== 'admin' && (ch.owner_user_id === me.user.id || ['owner', 'manager'].includes(me.membership.role));
  return { me, sb, ch: ch as Channel | null, allowed, who: me.membership.display_name || me.user.email || 'member' };
}
const back = (slug: string, q: string) => { revalidatePath(`/app/${slug}/connections`); redirect(`/app/${slug}/connections?${q}`); };

export async function saveMailbox(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const filter = form.get('filter') === 'label' ? 'label' : 'known', label = String(form.get('label') || '').trim();
  const { me, sb, ch, allowed, who } = await load(slug, id);
  if (!ch || !allowed) return back(slug, 'gerror=forbidden');
  let label_id: string | null = null;
  if (filter === 'label') {
    if (!label) return back(slug, `gerror=label&glabel=`);
    try { label_id = await findLabelId(sb, ch, label); } catch (e) { return back(slug, `gerror=failed&gmsg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 160))}`); }
    if (!label_id) return back(slug, `gerror=label&glabel=${encodeURIComponent(label)}`);
  }
  const config: GmailConfig = { ...(ch.config || { connector: 'gmail' }), filter, label: filter === 'label' ? label : null, label_id };
  await sb.from('channels').update({ config }).eq('id', id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Gmail ${ch.account} now reads ${filter === 'label' ? `mail with the label ${label}` : 'mail from known customers and suppliers'}`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
  back(slug, 'gsaved=1');
}

export async function disconnectMailbox(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const { me, sb, ch, allowed, who } = await load(slug, id);
  if (!ch || !allowed) return back(slug, 'gerror=forbidden');
  await revoke(ch.auth_enc);
  await sb.from('channels').update({ status: 'off', auth_enc: null, error: null }).eq('id', id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Disconnected Gmail ${ch.account}; Google access revoked`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
  back(slug, 'gsaved=1');
}
