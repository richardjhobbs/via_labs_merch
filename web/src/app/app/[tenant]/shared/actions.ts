'use server';
// The partner portal and partner access. Partners write nothing directly (RLS gives them read only); their
// submissions go in here under the service role after checking the task is for the party they speak for.
// Inviting and removing partners is for owners and managers, on the customer or supplier's page.
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';
import { sendMail, brandedHtml } from '@/lib/mail';
import { EVIDENCE_BUCKET, esgEnabled } from '@/lib/esg';

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const back = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);

export async function invitePartner(form: FormData) {
  const slug = String(form.get('tenant')), partyId = String(form.get('party_id'));
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('partners');
  const path = `/app/${slug}/parties/${partyId}`;
  if (!['owner', 'manager'].includes(membership.role)) back(path, { error: t('onlyManagers') });
  const email = String(form.get('email') || '').trim().toLowerCase(), name = String(form.get('name') || '').trim().slice(0, 80) || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(path, { error: t('badEmail') });
  const sb = await supabaseServer();
  const [{ data: party }, { data: tn }] = await Promise.all([
    sb.from('parties').select('id, name').eq('id', partyId).eq('tenant_id', tenant.id).maybeSingle(),
    sb.from('tenants').select('settings').eq('id', tenant.id).single(),
  ]);
  if (!party) redirect(`/app/${slug}/parties`);
  if (!esgEnabled(tn?.settings)) back(path, { error: t('needAddon') });
  const { data: inv, error } = await sb.from('invites').insert({ tenant_id: tenant.id, email, role: 'partner', display_name: name, invited_by: user.id, scopes: { parties: [party!.id] } }).select('token').single();
  if (error || !inv) back(path, { error: error?.message || 'failed' });
  const url = `${APP}/invite/${inv!.token}`;
  const subject = `${tenant.name} shares compliance records with ${party!.name} on VIA Merch`;
  const text = `${membership.display_name || tenant.name} at ${tenant.name} has invited you to see and supply the compliance records that concern ${party!.name}: certificates, audits, test reports and figures they need from you, and the reports they send you.\n\nYou see only these records, nothing else in their workspace.`;
  try { await sendMail({ to: email, subject, text: `${text}\n\n${url}`, html: brandedHtml({ title: subject, paragraphs: text.split('\n\n'), cta: { label: 'Open the shared records', url }, footnote: 'Sign-in is by a code or link sent to this address. The invitation expires in 14 days.' }) }); } catch { /* the invite stands; it can be resent */ }
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: party!.name, p_stream: 'Compliance and CSR', p_order: null, p_what: `Invited ${email} as a partner for ${party!.name}: compliance records only`, p_gate: 'Logged', p_gated: false, p_ref: { party_id: party!.id } });
  revalidatePath(path); back(path, { saved: '1' });
}

export async function removePartner(form: FormData) {
  const slug = String(form.get('tenant')), partyId = String(form.get('party_id')), id = String(form.get('id'));
  const { tenant, membership, user } = await requireTenant(slug);
  const t = await getTranslations('partners');
  const path = `/app/${slug}/parties/${partyId}`;
  if (!['owner', 'manager'].includes(membership.role)) back(path, { error: t('onlyManagers') });
  const admin = supabaseAdmin();
  const { data: m } = await admin.from('memberships').select('id, display_name, role').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!m || m.role !== 'partner') back(path, { error: t('onlyManagers') });
  await admin.from('memberships').delete().eq('id', id);
  await admin.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: m!.display_name, p_stream: 'Compliance and CSR', p_order: null, p_what: `Removed partner access for ${m!.display_name || 'a partner'}`, p_gate: 'Logged', p_gated: false, p_ref: { party_id: partyId } });
  revalidatePath(path); back(path, { saved: '1' });
}

// A partner supplies a figure, document or certificate for a task assigned to their company.
export async function partnerSubmit(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const { tenant, membership, user } = await requireTenant(slug, { partner: true });
  const t = await getTranslations('esg');
  const path = `/app/${slug}/shared/task/${id}`;
  if (membership.role !== 'partner') redirect(`/app/${slug}/esg/task/${id}`);
  const mine = membership.scopes?.parties || [];
  const admin = supabaseAdmin();
  const { data: task } = await admin.from('esg_tasks').select('id, status, party_id, period_label, parties(name), esg_requirements(code, title, measure, unit, trigger)').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!task || !task.party_id || !mine.includes(task.party_id)) redirect(`/app/${slug}/shared`);
  if (['accepted', 'waived'].includes(task.status)) back(path, { error: t('closed') });
  const req = task.esg_requirements as unknown as { code: string | null; title: string; measure: string; unit: string | null; trigger: string };
  const raw = String(form.get('value_num') || '').trim().replace(/,/g, ''), value_num = raw ? Number(raw) : null;
  if (raw && isNaN(value_num!)) back(path, { error: t('badNumber') });
  const value_text = String(form.get('value_text') || '').trim().slice(0, 4000) || null, note = String(form.get('note') || '').trim().slice(0, 2000) || null;
  const vf = String(form.get('valid_from') || ''), vu = String(form.get('valid_until') || '');
  const valid_from = ISO.test(vf) ? vf : null, valid_until = ISO.test(vu) ? vu : null;
  if (req.trigger === 'expiry' && !valid_until) back(path, { error: t('needExpiry') });
  const files = (form.getAll('evidence') as File[]).filter((f) => f && f.size).slice(0, 5);
  if (files.some((f) => f.size > 4_000_000)) back(path, { error: t('tooBig') });
  if (value_num == null && !value_text && !files.length) back(path, { error: t('emptySubmission') });
  if (req.measure === 'number' && value_num == null) back(path, { error: t('needNumber') });
  const evidence = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer()), sha256 = createHash('sha256').update(buf).digest('hex');
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const objectPath = `${tenant.id}/${id}/${sha256.slice(0, 16)}.${ext}`;
    const { error } = await admin.storage.from(EVIDENCE_BUCKET).upload(objectPath, buf, { contentType: f.type || 'application/octet-stream', upsert: true });
    if (error) back(path, { error: error.message });
    evidence.push({ name: f.name.slice(0, 160), path: objectPath, bytes: f.size, sha256 });
  }
  const party = (task.parties as unknown as { name: string } | null)?.name || 'partner';
  const actor = `${membership.display_name || user.email} (${party})`;
  const { data: prev } = await admin.from('esg_submissions').select('version').eq('task_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (prev?.version || 0) + 1;
  const { data: sub, error } = await admin.from('esg_submissions').insert({ tenant_id: tenant.id, task_id: id, version, value_num, value_text, note, evidence, valid_from, valid_until, source: 'manual', submitted_by: user.id, submitted_by_name: actor }).select('id').single();
  if (error || !sub) back(path, { error: error?.message || 'failed' });
  await admin.from('esg_tasks').update({ status: 'submitted', latest_submission_id: sub!.id }).eq('id', id);
  await admin.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Portal', p_actor: actor, p_actor_user: user.id, p_counterparty: party, p_stream: 'Compliance and CSR', p_order: null, p_what: `${party} submitted v${version} for ${req.code ? `${req.code} ` : ''}${req.title}, ${task.period_label}${value_num != null ? `: ${value_num}${req.unit ? ` ${req.unit}` : ''}` : ''}${evidence.length ? `, ${evidence.length} file${evidence.length === 1 ? '' : 's'}` : ''}${valid_until ? `, valid until ${valid_until}` : ''}`, p_gate: 'Logged', p_gated: false, p_ref: { esg_task: id, esg_submission: sub!.id } });
  revalidatePath(path); back(path, { saved: 'submitted' });
}
