'use server';
// Mailbox settings and disconnect. Only the member who connected the mailbox, or an owner or manager,
// may change it. Writes go through the service role (members cannot write merch.channels directly).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { findLabelId, revoke } from '@/lib/connectors/google';
import { findFolderId } from '@/lib/connectors/microsoft';
import { CHANNEL_COLS, type Channel, type MailConfig } from '@/lib/connectors/mail';
import { forwardConfigured, newForwardAddress } from '@/lib/connectors/forward';

async function load(slug: string, id: string) {
  const me = await requireTenant(slug);
  const sb = supabaseAdmin();
  const { data: ch } = await sb.from('channels').select(CHANNEL_COLS).eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  const allowed = !!ch && me.membership.id !== 'admin' && (ch.owner_user_id === me.user.id || ['owner', 'manager'].includes(me.membership.role));
  return { me, sb, ch: ch as Channel | null, allowed, who: me.membership.display_name || me.user.email || 'member' };
}
const box = (ch: Channel) => (ch.kind === 'email_m365' ? 'Microsoft 365' : ch.config?.connector === 'gdrive' ? 'Google Drive' : ch.kind === 'email_inbound' ? 'Forwarding address' : 'Gmail');
const back = (slug: string, q: string) => { revalidatePath(`/app/${slug}/connections`); redirect(`/app/${slug}/connections?${q}`); };

export async function saveMailbox(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const filter = form.get('filter') === 'label' ? 'label' : 'known', label = String(form.get('label') || '').trim();
  const { me, sb, ch, allowed, who } = await load(slug, id);
  if (!ch || !allowed) return back(slug, 'gerror=forbidden');
  let label_id: string | null = null;
  if (filter === 'label') {
    if (!label) return back(slug, `gerror=${ch.kind === 'email_m365' ? 'folder' : 'label'}&glabel=`);
    try { label_id = ch.kind === 'email_m365' ? await findFolderId(sb, ch, label) : await findLabelId(sb, ch, label); } catch (e) { return back(slug, `gerror=failed&gmsg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 160))}`); }
    if (!label_id) return back(slug, `gerror=${ch.kind === 'email_m365' ? 'folder' : 'label'}&glabel=${encodeURIComponent(label)}`);
  }
  const config: MailConfig = { ...ch.config, filter, label: filter === 'label' ? label : null, label_id };
  await sb.from('channels').update({ config }).eq('id', id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${box(ch)} ${ch.account} now reads ${filter === 'label' ? `mail in ${ch.kind === 'email_m365' ? 'the folder' : 'with the label'} ${label}` : 'mail from known customers and suppliers'}`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
  back(slug, 'gsaved=1');
}

export async function disconnectMailbox(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const { me, sb, ch, allowed, who } = await load(slug, id);
  if (!ch || !allowed) return back(slug, 'gerror=forbidden');
  // Gmail: revoke at Google. Drive: only delete the token, because revoking at Google can end the person's
  // whole grant to the app and would also cut their Gmail connection. Microsoft has no per-token revoke.
  if (ch.kind === 'email_gmail') await revoke(ch.auth_enc);
  await sb.from('channels').update({ status: 'off', auth_enc: null, error: null }).eq('id', id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Disconnected ${box(ch)} ${ch.account}${ch.kind === 'email_gmail' ? '; Google access revoked' : ch.kind === 'email_inbound' ? '; the address no longer accepts mail' : '; stored sign-in deleted'}`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
  back(slug, 'gsaved=1');
}

// Forwarding address: one per member, created on request; a new one replaces the old (the old stops working).
export async function createForwardAddress(form: FormData) {
  const slug = String(form.get('tenant'));
  const me = await requireTenant(slug);
  if (me.membership.id === 'admin' || me.membership.role === 'viewer') return back(slug, 'gerror=viewer');
  if (!forwardConfigured()) return back(slug, 'gerror=notReady&gp=forward');
  const sb = supabaseAdmin();
  await sb.from('channels').update({ status: 'off' }).eq('tenant_id', me.tenant.id).eq('owner_user_id', me.user.id).eq('kind', 'email_inbound').eq('status', 'connected');
  const account = newForwardAddress();
  const who = me.membership.display_name || me.user.email || 'member';
  const { error } = await sb.from('channels').insert({ tenant_id: me.tenant.id, kind: 'email_inbound', name: account, account, owner_user_id: me.user.id, status: 'connected', scope: 'Messages the member forwards from chat apps', config: { connector: 'forward', connected_by: who } });
  if (error) return back(slug, `gerror=failed&gmsg=${encodeURIComponent(error.message.slice(0, 160))}`);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Created a forwarding address for chat messages (accepts mail only from ${who}'s own addresses)`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
  back(slug, 'gsaved=1');
}
