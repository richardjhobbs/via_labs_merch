'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/tenant';
import { sendMail } from '@/lib/mail';
import { loadSample } from '@/lib/sample/load';
import { loadSampleThreads } from '@/lib/sample/threads-load';

const Tenant = z.object({ name: z.string().min(2).max(80), slug: z.string().regex(/^[a-z0-9-]{3,40}$/), kind: z.enum(['buying_office', 'brand', 'factory', 'trading', 'retailer']), plan: z.enum(['retainer', 'trial', 'per_user']), locale: z.string().max(5), tz: z.string().max(60), owner_email: z.string().email() });
const ROLES = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics', 'viewer'] as const;

// Default autonomy per stream for a new tenant (from the demo): price, claims and
// order confirmation are locked at L1 so the agent can never send those alone.
const GATES: [string, number, number | null][] = [['General enquiries', 2, null], ['RFQ and quotes', 1, null], ['Tech pack forwarding', 2, null], ['Approvals', 2, null], ['Order confirmation', 1, 1], ['WIP reports', 1, null], ['Amendments', 1, null], ['Price clarification', 1, 1], ['Production status', 1, null], ['QC', 2, null], ['Compliance and CSR', 2, null], ['Logistics', 1, null], ['Claims', 1, 1], ['Material sourcing', 0, null]];

export async function createTenant(form: FormData) {
  const me = await requireAdmin();
  const p = Tenant.safeParse(Object.fromEntries(form));
  if (!p.success) redirect('/admin?error=' + encodeURIComponent('Check the form'));
  const d = p.data, sb = supabaseAdmin();
  const { data: t, error } = await sb.from('tenants').insert({ name: d.name, slug: d.slug, kind: d.kind, plan: d.plan, locale: d.locale, tz: d.tz }).select('id').single();
  if (error || !t) {
    const msg = /invalid api key|jwt/i.test(error?.message || '') ? 'Supabase rejected SUPABASE_SERVICE_ROLE_KEY in the Vercel project. Paste the service_role key from Supabase → Settings → API Keys and redeploy.' : (error?.message || 'failed');
    redirect('/admin?error=' + encodeURIComponent(msg));
  }
  await sb.from('gates').insert(GATES.map(([stream, level, locked]) => ({ tenant_id: t.id, stream, level, locked, set_by: me.user.id })));
  await sb.from('agents').insert({ tenant_id: t.id, name: 'Mira', scope_kind: 'tenant', languages: [d.locale, 'en'] });
  await sb.rpc('ledger_append', { p_tenant: t.id, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Tenant created: ${d.name} (${d.kind}, ${d.plan})`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  const mailError = await inviteUser(t.id, d.owner_email, 'owner', null, me.user.id, me.user.email || '');
  redirect(`/admin/tenants/${t.id}` + (mailError ? '?error=' + encodeURIComponent(mailError) : ''));
}

// Re-send a pending invite (new 14-day expiry, same token).
export async function resendInvite(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('id')), sb = supabaseAdmin();
  const { data: inv } = await sb.from('invites').select('id, tenant_id, email, role, token, tenants(name)').eq('id', id).is('accepted_at', null).maybeSingle();
  if (!inv) return;
  await sb.from('invites').update({ expires_at: new Date(Date.now() + 14 * 864e5).toISOString() }).eq('id', id);
  const err = await mailInvite(inv.email, (inv.tenants as unknown as { name: string })?.name, inv.role, inv.token, me.user.email || '');
  revalidatePath(`/admin/tenants/${inv.tenant_id}`);
  redirect(`/admin/tenants/${inv.tenant_id}` + (err ? '?error=' + encodeURIComponent(err) : '?sent=' + encodeURIComponent(inv.email)));
}

export async function inviteMember(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), email = String(form.get('email') || '').trim().toLowerCase(), role = String(form.get('role')) as (typeof ROLES)[number];
  const name = String(form.get('display_name') || '').trim() || null;
  if (!z.string().email().safeParse(email).success || !ROLES.includes(role)) redirect(`/admin/tenants/${tenantId}?error=invalid`);
  const mailError = await inviteUser(tenantId, email, role, name, me.user.id, me.user.email || '');
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}` + (mailError ? '?error=' + encodeURIComponent(mailError) : '?sent=' + encodeURIComponent(email)));
}

// Creates the auth user if needed (so OTP sign-in works for invited people only),
// records the invite, and emails a link that attaches the membership on first sign-in.
async function inviteUser(tenantId: string, email: string, role: string, displayName: string | null, by: string, byEmail: string) {
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).single();
  const { data: inv } = await sb.from('invites').insert({ tenant_id: tenantId, email, role, display_name: displayName, invited_by: by }).select('token').single();
  // ensure an auth user exists; ignore "already registered"
  await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => null);
  const mailError = await mailInvite(email, tenant?.name || 'VIA Merch', role, inv?.token || '', byEmail);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Email', p_actor: `VIA admin (${byEmail})`, p_actor_user: by, p_counterparty: email, p_stream: 'Setup', p_order: null, p_what: `Invited ${email} as ${role}${mailError ? ' (email failed: ' + mailError.slice(0, 80) + ')' : ''}`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  return mailError;
}

// Returns an error message when the email could not be sent, so the console can show it.
async function mailInvite(email: string, tenantName: string, role: string, token: string, byEmail: string): Promise<string | null> {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  try {
    const r = await sendMail({ to: email, subject: `You're invited to ${tenantName} on VIA Merch`, text: `${byEmail} has invited you to ${tenantName} on VIA Merch as ${role}.\n\nOpen this link to accept and sign in:\n${url}\n\nYou sign in with a code sent to this email; there is no password. Sessions end after 2 hours without activity.\n\nVIA Labs · getvia.xyz` });
    if ((r as { skipped?: boolean }).skipped) return 'Invite recorded but no email sent: RESEND_API_KEY is not set in the Vercel project.';
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return `Invite recorded but the email failed: ${m}. Check MAIL_FROM is on a domain verified in Resend.`;
  }
}

// A member's job title and the customers they handle (empty = all). Owners and managers always see all.
export async function setMemberScope(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), id = String(form.get('id')), title = String(form.get('title') || '').trim() || null;
  const parties = form.getAll('parties').map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('memberships').select('display_name').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (!m) redirect(`/admin/tenants/${tenantId}?error=missing`);
  const { error } = await sb.from('memberships').update({ title, scopes: { parties } }).eq('id', id);
  if (error) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error.message)}`);
  const { data: names } = parties.length ? await sb.from('parties').select('name').in('id', parties) : { data: [] };
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: m.display_name, p_stream: 'Setup', p_order: null, p_what: `${m.display_name}: ${title ? title + '; ' : ''}customers ${parties.length ? (names || []).map((n) => n.name).join(', ') : 'all'}`, p_gate: 'ADMIN', p_gated: true, p_ref: { membership_id: id, parties } });
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent('scope saved')}`);
}

export async function updateRequest(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id')), status = String(form.get('status'));
  if (!['new', 'contacted', 'provisioned', 'declined'].includes(status)) return;
  await supabaseAdmin().from('access_requests').update({ status }).eq('id', id);
  revalidatePath('/admin/requests');
}

export async function loadSampleThreadsAction(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('tenant_id'));
  const r = await loadSampleThreads(id, me.user.email || '');
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}` + (r.ok ? '?sent=' + encodeURIComponent(`sample conversations: ${r.threads} threads, ${r.messages} messages`) : '?error=' + encodeURIComponent(r.error || 'failed')));
}

export async function loadSampleAction(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('tenant_id'));
  const r = await loadSample(id, me.user.id, me.user.email || '');
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}` + (r.ok ? '?sent=' + encodeURIComponent(`sample data: ${r.orders} POs`) : '?error=' + encodeURIComponent(r.error || 'failed')));
}
