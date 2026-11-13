'use server';
import { redirect } from 'next/navigation';
import { featureByKey } from '@/lib/features';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/tenant';
import { sendMail, brandedHtml } from '@/lib/mail';
import { inviteUser, mailInvite } from '@/lib/invites';
import { loadSample } from '@/lib/sample/load';
import { loadSampleThreads } from '@/lib/sample/threads-load';
import { SUPPORT_HOURS } from '@/lib/support';
import { DEV_GATES, isTrack } from '@/lib/tracks';

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
  await sb.from('gates').insert([...GATES.map(([stream, level, locked]) => ({ tenant_id: t.id, track: 'production', stream, level, locked, set_by: me.user.id })), ...DEV_GATES.map(([stream, level, locked]) => ({ tenant_id: t.id, track: 'development', stream, level, locked, set_by: me.user.id }))]);
  await sb.from('agents').insert({ tenant_id: t.id, name: 'Mira', scope_kind: 'tenant', languages: [d.locale, 'en'] });
  await sb.rpc('ledger_append', { p_tenant: t.id, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Tenant created: ${d.name} (${d.kind}, ${d.plan})`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  // Created from an access request: the owner gets the welcome email (what VIA Merch is, what happens next)
  // instead of the plain invite, and the request is closed and linked to the company.
  const reqId = String(form.get('request_id') || '');
  const { data: req } = /^[0-9a-f-]{36}$/i.test(reqId) ? await sb.from('access_requests').select('id, name, company').eq('id', reqId).maybeSingle() : { data: null };
  const mailError = await inviteUser(t.id, d.owner_email, 'owner', req?.name || null, me.user.id, me.user.email || '', req ? { requester: req.name } : undefined);
  if (req) await sb.from('access_requests').update({ status: 'provisioned', tenant_id: t.id }).eq('id', req.id);
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

// A member's job title and the customers they handle (empty = all). Owners and managers always see all.
export async function setMemberScope(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), id = String(form.get('id')), title = String(form.get('title') || '').trim() || null;
  const parties = form.getAll('parties').map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  // which lines of work the person sees: production, development or both (never none)
  const tracks = form.getAll('tracks').map(String).filter(isTrack);
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('memberships').select('display_name').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (!m) redirect(`/admin/tenants/${tenantId}?error=missing`);
  const { error } = await sb.from('memberships').update({ title, scopes: { parties }, tracks: tracks.length ? tracks : ['production'] }).eq('id', id);
  if (error) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error.message)}`);
  const { data: names } = parties.length ? await sb.from('parties').select('name').in('id', parties) : { data: [] };
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: m.display_name, p_stream: 'Setup', p_order: null, p_what: `${m.display_name}: ${title ? title + '; ' : ''}customers ${parties.length ? (names || []).map((n) => n.name).join(', ') : 'all'}; tracks ${(tracks.length ? tracks : ['production']).join(' and ')}`, p_gate: 'ADMIN', p_gated: true, p_ref: { membership_id: id, parties } });
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent('scope saved')}`);
}

export async function updateRequest(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id')), status = String(form.get('status'));
  if (!['new', 'provisioned', 'declined'].includes(status)) return;
  const { error } = await supabaseAdmin().from('access_requests').update({ status }).eq('id', id);
  revalidatePath('/admin/requests');
  redirect('/admin/requests?' + (error ? 'error=' + encodeURIComponent(error.message) : 'saved=' + id));
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

// VIA staff ask a company for support access. Owners and managers get an email and decide in Settings.
export async function requestSupport(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), reason = String(form.get('reason') || '').trim().slice(0, 300);
  if (reason.length < 8) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent('Give the company a reason of at least a few words.')}`);
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('id, slug, name').eq('id', tenantId).maybeSingle();
  if (!tenant) redirect('/admin');
  const { data: open } = await sb.from('support_access').select('id').eq('tenant_id', tenantId).eq('status', 'requested').maybeSingle();
  if (open) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent('A request is already waiting for this company.')}`);
  const { data: row, error } = await sb.from('support_access').insert({ tenant_id: tenantId, reason, requested_by: me.user.id, requested_by_email: me.user.email }).select('id').single();
  if (error || !row) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error?.message || 'failed')}`);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA Labs (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `VIA Labs asked for support access (${SUPPORT_HOURS} hours): ${reason}`, p_gate: 'ADMIN', p_gated: true, p_ref: { support_access: row.id } });
  // email every owner and manager
  const { data: deciders } = await sb.from('memberships').select('user_id').eq('tenant_id', tenantId).in('role', ['owner', 'manager']);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/app/${tenant.slug}/settings`;
  for (const d of deciders || []) {
    const { data: u } = await sb.auth.admin.getUserById(d.user_id);
    const to = u?.user?.email; if (!to) continue;
    await sendMail({ to, subject: `VIA Labs asks for support access to ${tenant.name}`,
      text: `VIA Labs asks for support access to ${tenant.name}.\n\nReason: ${reason}\n\nAccess lasts ${SUPPORT_HOURS} hours from the moment you grant it, is limited to VIA Labs staff, can be revoked at any time, and the grant and every opening are written to your ledger. Until you grant it, nobody at VIA Labs can read your orders, customers, suppliers, conversations or ledger.\n\nDecide here: ${url}`,
      html: brandedHtml({ title: `VIA Labs asks for support access to ${tenant.name}`, paragraphs: [`Reason: ${reason}`, `Access lasts ${SUPPORT_HOURS} hours from the moment you grant it, is limited to VIA Labs staff, can be revoked at any time, and the grant and every opening are written to your ledger. Until you grant it, nobody at VIA Labs can read your orders, customers, suppliers, conversations or ledger.`], cta: { label: 'Decide in Settings', url }, footnote: 'Only an owner or manager of your company can grant access. Declining has no effect on the service.' }) }).catch(() => {});
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent('support request')}`);
}

// VIA staff end their own access early.
export async function endSupport(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('id')), tenantId = String(form.get('tenant_id'));
  const sb = supabaseAdmin();
  await sb.from('support_access').update({ status: 'revoked', ended_by: 'VIA Labs', ended_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId).in('status', ['requested', 'granted']);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA Labs (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: 'VIA Labs ended its support access', p_gate: 'ADMIN', p_gated: true, p_ref: { support_access: id } });
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}`);
}

// Paid add-ons, switched per company by VIA staff (service metadata, no support grant needed).
export async function setAddon(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), addon = String(form.get('addon')), on = form.get('on') === '1';
  if (!['esg'].includes(addon)) redirect(`/admin/tenants/${tenantId}?error=unknown%20add-on`);
  const sb = supabaseAdmin();
  const { data: t } = await sb.from('tenants').select('settings').eq('id', tenantId).single();
  const settings = (t?.settings || {}) as { addons?: Record<string, boolean> };
  const { error } = await sb.from('tenants').update({ settings: { ...settings, addons: { ...(settings.addons || {}), [addon]: on } } }).eq('id', tenantId);
  if (error) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${on ? 'Switched on' : 'Switched off'} the ESG and compliance add-on`, p_gate: 'ADMIN', p_gated: true, p_ref: { addon } });
  // switching on answers an open request from the company; tell the person who asked
  if (on) {
    const { data: open } = await sb.from('addon_requests').update({ status: 'approved', decided_by_email: me.user.email, decided_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('addon', addon).eq('status', 'requested').select('requested_by').maybeSingle();
    if (open?.requested_by) await notifyRequester(tenantId, open.requested_by, true, null);
  }
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent(`add-on ${on ? 'on' : 'off'}`)}`);
}

// Feature switches (lib/features.ts): an enhancement only some companies get, switched per company.
export async function setFeature(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), key = String(form.get('feature')), on = form.get('on') === '1';
  const f = featureByKey(key);
  if (!f) redirect(`/admin/tenants/${tenantId}?error=unknown%20feature`);
  const sb = supabaseAdmin();
  const { data: t } = await sb.from('tenants').select('settings').eq('id', tenantId).single();
  const settings = (t?.settings || {}) as { features?: Record<string, boolean> };
  const { error } = await sb.from('tenants').update({ settings: { ...settings, features: { ...(settings.features || {}), [key]: on } } }).eq('id', tenantId);
  if (error) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${on ? 'Switched on' : 'Switched off'} the feature: ${f!.name}`, p_gate: 'ADMIN', p_gated: true, p_ref: { feature: key } });
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent(`feature ${on ? 'on' : 'off'}`)}`);
}

// The development track: a company switch in tenants.settings.tracks (docs/development-merchandising.md).
// Not an add-on yet: pricing is a later decision, so production-only companies simply never see it.
export async function setDevelopmentTrack(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), on = form.get('on') === '1';
  const sb = supabaseAdmin();
  const { data: t } = await sb.from('tenants').select('settings').eq('id', tenantId).single();
  const settings = (t?.settings || {}) as { tracks?: Record<string, boolean> };
  const { error } = await sb.from('tenants').update({ settings: { ...settings, tracks: { ...(settings.tracks || {}), development: on } } }).eq('id', tenantId);
  if (error) redirect(`/admin/tenants/${tenantId}?error=${encodeURIComponent(error.message)}`);
  // owners and managers get the track at once so someone can hand it out; everyone else is added per person
  if (on) {
    const { data: leads } = await sb.from('memberships').select('id, tracks').eq('tenant_id', tenantId).in('role', ['owner', 'manager']);
    for (const l of leads || []) if (!(l.tracks || []).includes('development')) await sb.from('memberships').update({ tracks: [...(l.tracks || ['production']), 'development'] }).eq('id', l.id);
  }
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${on ? 'Switched on' : 'Switched off'} the development track`, p_gate: 'ADMIN', p_gated: true, p_ref: { track: 'development' }, p_track: 'development' });
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent(`development track ${on ? 'on' : 'off'}`)}`);
}

export async function declineAddon(form: FormData) {
  const me = await requireAdmin();
  const tenantId = String(form.get('tenant_id')), id = String(form.get('id')), note = String(form.get('note') || '').trim().slice(0, 500) || null;
  const sb = supabaseAdmin();
  const { data: r } = await sb.from('addon_requests').update({ status: 'declined', decided_by_email: me.user.email, decided_at: new Date().toISOString(), decision_note: note }).eq('id', id).eq('tenant_id', tenantId).eq('status', 'requested').select('requested_by').maybeSingle();
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${me.user.email})`, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Declined the ESG and compliance add-on request${note ? `: ${note}` : ''}`, p_gate: 'ADMIN', p_gated: true, p_ref: { addon_request: id } });
  if (r?.requested_by) await notifyRequester(tenantId, r.requested_by, false, note);
  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?sent=${encodeURIComponent('request declined')}`);
}

async function notifyRequester(tenantId: string, userId: string, approved: boolean, note: string | null) {
  const sb = supabaseAdmin();
  const [{ data: u }, { data: t }] = await Promise.all([sb.auth.admin.getUserById(userId), sb.from('tenants').select('name, slug').eq('id', tenantId).single()]);
  const email = u?.user?.email;
  if (!email || !t) return;
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz'}/app/${t.slug}/esg`;
  const subject = approved ? `ESG and compliance is on for ${t.name}` : `Your ESG and compliance request for ${t.name}`;
  const text = approved ? 'VIA Labs has switched on ESG and compliance. Start from a template or upload a requirements document.' : `VIA Labs has not switched on ESG and compliance yet.${note ? ` ${note}` : ''} Reply to this email to talk it through.`;
  try { await sendMail({ to: email, subject, text: `${text}\n\n${url}`, html: brandedHtml({ title: subject, paragraphs: [text], cta: approved ? { label: 'Open ESG & compliance', url } : undefined }) }); } catch { /* the outcome shows in the workspace */ }
}
