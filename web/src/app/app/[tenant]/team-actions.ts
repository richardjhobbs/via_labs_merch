'use server';
// Settings, Team: owners and managers invite their own people and set each person's role, job title, customers
// and tracks. Members cannot write merch.memberships or merch.invites for others, so every change goes through
// the service role after the checks in lib/team.ts, with a ledger row. Partners are managed on the party page.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inviteUser, mailInvite } from '@/lib/invites';
import { assignable, canEdit, canRemove, canSetRole, isTeamRole, managesTeam } from '@/lib/team';
import { isTrack, tenantTracks } from '@/lib/tracks';

const back = (slug: string, q: string): never => redirect(`/app/${slug}/settings?${q}#team`);

async function ctx(slug: string) {
  const c = await requireTenant(slug);
  if (!managesTeam(c.membership.role) || c.viewingAs) back(slug, 'terr=role');
  const sb = supabaseAdmin();
  const [{ data: tn }, { count }] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', c.tenant.id).single(),
    sb.from('memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', c.tenant.id).eq('role', 'owner'),
  ]);
  const actor = c.membership.display_name || c.user.email || 'member';
  return { ...c, sb, owners: count || 0, companyTracks: tenantTracks(tn?.settings as never), actor };
}

// customers must be this company's; tracks only those the company runs (never none)
async function cleanAccess(form: FormData, tenantId: string, companyTracks: string[]) {
  const ids = form.getAll('parties').map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const { data: ok } = ids.length ? await supabaseAdmin().from('parties').select('id, name').eq('tenant_id', tenantId).in('id', ids) : { data: [] };
  const tracks = form.getAll('tracks').map(String).filter((x) => isTrack(x) && companyTracks.includes(x));
  return { parties: (ok || []).map((p) => p.id as string), names: (ok || []).map((p) => p.name as string), tracks: tracks.length ? tracks : ['production'] };
}

export async function inviteTeam(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, membership, sb, companyTracks, actor } = await ctx(slug);
  const email = String(form.get('email') || '').trim().toLowerCase(), role = String(form.get('role') || '');
  const name = String(form.get('name') || '').trim().slice(0, 80) || null, title = String(form.get('title') || '').trim().slice(0, 80) || null;
  if (!z.string().email().safeParse(email).success) back(slug, 'terr=email');
  if (!isTeamRole(role) || !assignable(membership.role).includes(role)) back(slug, 'terr=role');
  const { data: users } = await sb.from('memberships').select('user_id').eq('tenant_id', tenant.id);
  for (const u of users || []) { const { data } = await sb.auth.admin.getUserById(u.user_id as string); if (data?.user?.email?.toLowerCase() === email) back(slug, 'terr=member'); }
  const access = await cleanAccess(form, tenant.id, companyTracks);
  const err = await inviteUser(tenant.id, email, role, name, user.id, actor, undefined, { title, tracks: access.tracks, scopes: { parties: access.parties }, actor });
  revalidatePath(`/app/${slug}/settings`);
  back(slug, err ? `terr=${encodeURIComponent(err)}` : `tsent=${encodeURIComponent(email)}`);
}

export async function updateMember(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, user, membership, sb, owners, companyTracks, actor } = await ctx(slug);
  const { data: m } = await sb.from('memberships').select('id, user_id, role, display_name, title, scopes, tracks').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!m) back(slug, 'terr=missing');
  const self = m!.user_id === user.id, role = String(form.get('role') || m!.role);
  if (!canEdit(membership.role, m!.role, self) || !canSetRole(membership.role, m!.role, role, self, owners)) back(slug, 'terr=role');
  const title = String(form.get('title') || '').trim().slice(0, 80) || null;
  const access = await cleanAccess(form, tenant.id, companyTracks);
  const { error } = await sb.from('memberships').update({ role, title, scopes: { ...(m!.scopes || {}), parties: access.parties }, tracks: access.tracks }).eq('id', id);
  if (error) back(slug, `terr=${encodeURIComponent(error.message)}`);
  const changes = [role !== m!.role ? `role ${m!.role} to ${role}` : '', `title ${title || 'none'}`, `customers ${access.names.length ? access.names.join(', ') : 'all'}`, companyTracks.length > 1 ? `tracks ${access.tracks.join(', ')}` : ''].filter(Boolean).join('; ');
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: actor, p_actor_user: user.id, p_counterparty: m!.display_name, p_stream: 'Setup', p_order: null, p_what: `Team: ${m!.display_name || 'member'}: ${changes}`, p_gate: 'Logged', p_gated: false, p_ref: { membership: id } });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'tsaved=1');
}

// Removing a person ends their access and switches off the mailboxes and Drive they connected, so their mail
// stops coming in; what they did stays on the ledger. Desks they held fall to the layer above.
export async function removeMember(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, user, membership, sb, owners, actor } = await ctx(slug);
  const { data: m } = await sb.from('memberships').select('id, user_id, role, display_name').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!m) back(slug, 'terr=missing');
  if (!canRemove(membership.role, m!.role, m!.user_id === user.id, owners)) back(slug, 'terr=role');
  await sb.from('channels').update({ status: 'off', auth_enc: null, error: null }).eq('tenant_id', tenant.id).eq('owner_user_id', m!.user_id).in('kind', ['email_gmail', 'email_m365', 'email_inbound', 'sheets']);
  const { error } = await sb.from('memberships').delete().eq('id', id);
  if (error) back(slug, `terr=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: actor, p_actor_user: user.id, p_counterparty: m!.display_name, p_stream: 'Setup', p_order: null, p_what: `Team: removed ${m!.display_name || 'a member'} (${m!.role}); their connected mailboxes switched off`, p_gate: 'Logged', p_gated: false, p_ref: { membership: id } });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'tsaved=1');
}

export async function resendTeamInvite(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, membership, sb, actor } = await ctx(slug);
  const { data: inv } = await sb.from('invites').select('id, email, role, token').eq('id', id).eq('tenant_id', tenant.id).is('accepted_at', null).neq('role', 'partner').maybeSingle();
  if (!inv || !assignable(membership.role).includes(inv.role)) back(slug, 'terr=missing');
  await sb.from('invites').update({ expires_at: new Date(Date.now() + 14 * 864e5).toISOString() }).eq('id', id);
  const err = await mailInvite(inv!.email, tenant.name, inv!.role, inv!.token, actor);
  back(slug, err ? `terr=${encodeURIComponent(err)}` : `tsent=${encodeURIComponent(inv!.email)}`);
}

export async function cancelTeamInvite(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, user, membership, sb, actor } = await ctx(slug);
  const { data: inv } = await sb.from('invites').select('id, email, role').eq('id', id).eq('tenant_id', tenant.id).is('accepted_at', null).neq('role', 'partner').maybeSingle();
  if (!inv || !assignable(membership.role).includes(inv.role)) back(slug, 'terr=missing');
  await sb.from('invites').delete().eq('id', id);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: actor, p_actor_user: user.id, p_counterparty: inv!.email, p_stream: 'Setup', p_order: null, p_what: `Team: cancelled the invite to ${inv!.email}`, p_gate: 'Logged', p_gated: false, p_ref: { invite: id } });
  revalidatePath(`/app/${slug}/settings`);
  back(slug, 'tsaved=1');
}
