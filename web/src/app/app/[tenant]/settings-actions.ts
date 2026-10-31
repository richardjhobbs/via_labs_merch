'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { sendMail, brandedHtml } from '@/lib/mail';
import { SUPPORT_HOURS } from '@/lib/support';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';

// Owner or manager decides a VIA support request: grant (72 hours) or decline. Written to the ledger.
export async function decideSupport(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id')), decision = String(form.get('decision'));
  const { tenant, membership, user } = await requireTenant(slug);
  if (!['owner', 'manager'].includes(membership.role)) redirect(`/app/${slug}/settings?error=role`);
  const sb = await supabaseServer();
  const who = membership.display_name || user.email || 'member';
  const now = new Date();
  const patch = decision === 'grant'
    ? { status: 'granted', decided_by: user.id, decided_by_name: who, decided_at: now.toISOString(), expires_at: new Date(now.getTime() + SUPPORT_HOURS * 3600e3).toISOString() }
    : { status: 'declined', decided_by: user.id, decided_by_name: who, decided_at: now.toISOString() };
  const { data: row, error } = await sb.from('support_access').update(patch).eq('id', id).eq('tenant_id', tenant.id).eq('status', 'requested').select('reason').maybeSingle();
  if (error || !row) redirect(`/app/${slug}/settings?error=${encodeURIComponent(error?.message || 'not found')}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Workspace', p_actor: who, p_actor_user: user.id, p_counterparty: 'VIA Labs', p_stream: 'Setup', p_order: null,
    p_what: decision === 'grant' ? `Granted VIA Labs support access for ${SUPPORT_HOURS} hours: ${row.reason}` : `Declined VIA Labs support access: ${row.reason}`, p_gate: 'ADMIN', p_gated: true, p_ref: { support_access: id } });
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (to) await sendMail({ to, subject: `${tenant.name}: support access ${decision === 'grant' ? 'granted' : 'declined'}`,
    text: `${who} at ${tenant.name} ${decision === 'grant' ? `granted support access for ${SUPPORT_HOURS} hours` : 'declined support access'}.\nReason given: ${row.reason}\n\n${APP}/admin`,
    html: brandedHtml({ title: `${tenant.name}: support access ${decision === 'grant' ? 'granted' : 'declined'}`, paragraphs: [`${who} at ${tenant.name} ${decision === 'grant' ? `granted support access for ${SUPPORT_HOURS} hours.` : 'declined support access.'}`, `Reason given: ${row.reason}`], cta: { label: 'Open the console', url: `${APP}/admin` } }) }).catch(() => {});
  revalidatePath(`/app/${slug}/settings`);
  redirect(`/app/${slug}/settings?saved=1`);
}

// Owner or manager ends an active grant early.
export async function revokeSupport(form: FormData) {
  const slug = String(form.get('slug')), id = String(form.get('id'));
  const { tenant, membership, user } = await requireTenant(slug);
  if (!['owner', 'manager'].includes(membership.role)) redirect(`/app/${slug}/settings?error=role`);
  const sb = await supabaseServer();
  const who = membership.display_name || user.email || 'member';
  const { error } = await sb.from('support_access').update({ status: 'revoked', ended_by: who, ended_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenant.id).eq('status', 'granted');
  if (error) redirect(`/app/${slug}/settings?error=${encodeURIComponent(error.message)}`);
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Workspace', p_actor: who, p_actor_user: user.id, p_counterparty: 'VIA Labs', p_stream: 'Setup', p_order: null, p_what: 'Revoked VIA Labs support access', p_gate: 'ADMIN', p_gated: true, p_ref: { support_access: id } });
  revalidatePath(`/app/${slug}/settings`);
  redirect(`/app/${slug}/settings?saved=1`);
}
