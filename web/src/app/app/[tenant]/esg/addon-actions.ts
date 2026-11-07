'use server';
// Asking for the ESG and compliance add-on from inside the workspace (replaces a mailto link). An owner or
// manager sends the request with an optional note; VIA Labs is emailed and decides in the console. VIA Labs
// staff in the workspace can switch it on directly.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';
import { sendMail, brandedHtml } from '@/lib/mail';
import { generateTasks } from '@/lib/esg';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';

export async function requestAddon(form: FormData) {
  const slug = String(form.get('tenant'));
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('esg');
  const back = `/app/${slug}/esg`;
  if (!['owner', 'manager'].includes(membership.role) || membership.id === 'admin') redirect(`${back}?error=${encodeURIComponent(t('addonOnlyManagers'))}`);
  const note = String(form.get('note') || '').trim().slice(0, 1000) || null;
  const sb = await supabaseServer();
  const name = membership.display_name || user.email || 'Member';
  const { data: req, error } = await sb.from('addon_requests').insert({ tenant_id: tenant.id, addon: 'esg', note, requested_by_name: name }).select('id').single();
  if (error) redirect(`${back}?${error.code === '23505' ? 'requested=1' : `error=${encodeURIComponent(error.message)}`}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: name, p_actor_user: user.id, p_counterparty: 'VIA Labs', p_stream: 'Setup', p_order: null, p_what: `Requested the ESG and compliance add-on${note ? `: ${note}` : ''}`, p_gate: 'Logged', p_gated: false, p_ref: { addon_request: req!.id } });
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (to) {
    const url = `${APP}/admin/tenants/${tenant.id}`;
    try { await sendMail({ to, subject: `VIA Merch add-on request: ESG and compliance for ${tenant.name}`, text: `${name} (${user.email}) at ${tenant.name} asks for the ESG and compliance add-on.${note ? `\n\n${note}` : ''}\n\n${url}`, html: brandedHtml({ title: `ESG and compliance for ${tenant.name}`, paragraphs: [`${name} (${user.email}) asks for the ESG and compliance add-on.`, ...(note ? [note] : [])], cta: { label: 'Open the company in the console', url } }) }); } catch { /* the request is saved and shows in the console */ }
  }
  revalidatePath(back);
  redirect(`${back}?requested=1`);
}

export async function switchOnNow(form: FormData) {
  const slug = String(form.get('tenant'));
  const { tenant, isAdmin, user } = await requireTenant(slug);
  if (!isAdmin) redirect(`/app/${slug}/esg`);
  const admin = supabaseAdmin();
  const { data: tn } = await admin.from('tenants').select('settings').eq('id', tenant.id).single();
  const settings = (tn?.settings || {}) as { addons?: Record<string, boolean> };
  await admin.from('tenants').update({ settings: { ...settings, addons: { ...(settings.addons || {}), esg: true } } }).eq('id', tenant.id);
  await admin.from('addon_requests').update({ status: 'approved', decided_by_email: user.email, decided_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('addon', 'esg').eq('status', 'requested');
  await admin.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: `VIA admin (${user.email})`, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: 'Switched on the ESG and compliance add-on', p_gate: 'ADMIN', p_gated: true, p_ref: { addon: 'esg' } });
  await generateTasks(tenant.id, { sb: admin });
  revalidatePath(`/app/${slug}`, 'layout');
  redirect(`/app/${slug}/esg`);
}
