'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/tenant';
import { sendMail } from '@/lib/mail';

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
  if (error || !t) redirect('/admin?error=' + encodeURIComponent(error?.message || 'failed'));
  await sb.from('gates').insert(GATES.map(([stream, level, locked]) => ({ tenant_id: t.id, stream, level, locked, set_by: me.user.id })));
  await sb.from('agents').insert({ tenant_id: t.id, name: 'Mira', scope_kind: 'tenant', languages: [d.locale, 'en'] });
  await sb.rpc('ledger_append', { p_tenant: t.id, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Tenant created: ${d.name} (${d.kind}, ${d.plan})`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  await inviteUser(t.id, d.owner_email, 'owner', null, me.user.id, me.user.email || '');
  redirect(`/admin/tenants/${t.id}`);
}

export async function inviteMember(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), email = String(form.get('email') || '').trim().toLowerCase(), role = String(form.get('role')) as (typeof ROLES)[number];
  const name = String(form.get('display_name') || '').trim() || null;
  if (!z.string().email().safeParse(email).success || !ROLES.includes(role)) redirect(`/admin/tenants/${tenantId}?error=invalid`);
  await inviteUser(tenantId, email, role, name, me.user.id, me.user.email || '');
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}`);
}

// Creates the auth user if needed (so OTP sign-in works for invited people only),
// records the invite, and emails a link that attaches the membership on first sign-in.
async function inviteUser(tenantId: string, email: string, role: string, displayName: string | null, by: string, byEmail: string) {
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).single();
  const { data: inv } = await sb.from('invites').insert({ tenant_id: tenantId, email, role, display_name: displayName, invited_by: by }).select('token').single();
  // ensure an auth user exists; ignore "already registered"
  await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => null);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inv?.token}`;
  await sendMail({ to: email, subject: `You're invited to ${tenant?.name} on VIA Merch`, text: `${byEmail} has invited you to ${tenant?.name} on VIA Merch as ${role}.\n\nOpen this link to accept and sign in:\n${url}\n\nYou sign in with a code sent to this email; there is no password. Sessions end after 2 hours without activity.\n\nVIA Labs · getvia.xyz` }).catch((e) => console.error('[invite mail]', e));
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Email', p_actor: `VIA admin (${byEmail})`, p_actor_user: by, p_counterparty: email, p_stream: 'Setup', p_order: null, p_what: `Invited ${email} as ${role}`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
}

export async function updateRequest(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id')), status = String(form.get('status'));
  if (!['new', 'contacted', 'provisioned', 'declined'].includes(status)) return;
  await supabaseAdmin().from('access_requests').update({ status }).eq('id', id);
  revalidatePath('/admin/requests');
}
