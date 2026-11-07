'use server';
// ESG and compliance: every change is checked for role here, enforced again by RLS and the report guard,
// and written to the ledger on the "Compliance and CSR" stream.
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';
import { extract, hasLlm, recordUsage } from '@/lib/llm';
import { documentContent, findParty } from '@/lib/documents';
import { DISCIPLINES, EVIDENCE_BUCKET, FREQUENCIES, MEASURES, OWNER_ROLES, PROGRAMME_KINDS, READ_REQUIREMENTS_SYSTEM, RequirementsSchema, canApproveReport, canLead, defaultPeriodEnd, esgEnabled, generateTasks, type ReadRequirements } from '@/lib/esg';
import { draftSummary, gatherRows } from '@/lib/esg-report';

const STREAM = 'Compliance and CSR';
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const num = z.string().trim().max(24).optional().transform((v) => (v && !isNaN(Number(v)) ? Number(v) : null));

async function ctx(form: FormData) {
  const slug = String(form.get('tenant'));
  const r = await requireTenant(slug);
  const sb = await supabaseServer();
  const { data: tn } = await sb.from('tenants').select('settings').eq('id', r.tenant.id).single();
  if (!esgEnabled(tn?.settings)) redirect(`/app/${slug}/esg`);
  const actor = r.membership.display_name || r.user.email || 'Member';
  const log = (what: string, ref: Record<string, unknown>, gate = 'Logged', counterparty: string | null = null) =>
    sb.rpc('ledger_append', { p_tenant: r.tenant.id, p_channel: 'Console', p_actor: actor, p_actor_user: r.user.id, p_counterparty: counterparty, p_stream: STREAM, p_order: null, p_what: what, p_gate: gate, p_gated: gate !== 'Logged', p_ref: ref });
  return { ...r, slug, sb, actor, log };
}
const back = (path: string, q: Record<string, string>) => redirect(`${path}?${new URLSearchParams(q)}`);

// ------------------------------------------------------------------ programmes

const Programme = z.object({ name: z.string().trim().min(3).max(160), kind: z.enum(PROGRAMME_KINDS), issuer_party_id: opt(40), issuer_name: opt(160), chain: opt(200), framework: opt(240), reference: opt(80), purpose: opt(400), starts_on: isoDate.optional().or(z.literal('')).transform((v) => v || null), ends_on: isoDate.optional().or(z.literal('')).transform((v) => v || null), notes: opt(2000) });
const fields = <T extends z.ZodRawShape>(s: z.ZodObject<T>, form: FormData, prefix = '') => s.safeParse(Object.fromEntries(Object.keys(s.shape).map((k) => [k, form.get(prefix + k) ?? undefined])));

export async function addProgramme(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const base = `/app/${c.slug}/esg`;
  if (!canLead(c.membership.role)) back(base, { error: t('onlyLeads') });
  const p = fields(Programme, form);
  if (!p.success) back(base, { error: t('checkForm') });
  const { data, error } = await c.sb.from('esg_programmes').insert({ tenant_id: c.tenant.id, ...p.data!, source: 'manual' }).select('id').single();
  if (error || !data) back(base, { error: error?.message || 'failed' });
  await c.log(`Added compliance programme ${p.data!.name}`, { esg_programme: data!.id }, 'Logged', p.data!.issuer_name);
  redirect(`${base}/${data!.id}?saved=1`);
}

export async function setProgrammeStatus(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), status = String(form.get('status'));
  const path = `/app/${c.slug}/esg/${id}`;
  if (!canLead(c.membership.role) || !['active', 'closed', 'draft'].includes(status)) back(path, { error: t('onlyLeads') });
  const { data: p } = await c.sb.from('esg_programmes').update({ status }).eq('id', id).eq('tenant_id', c.tenant.id).select('name').single();
  await c.log(`Programme ${p?.name} set to ${status}`, { esg_programme: id });
  if (status === 'active') await generateTasks(c.tenant.id, { programmeId: id, sb: c.sb });
  revalidatePath(path); back(path, { saved: '1' });
}

// ------------------------------------------------------------------ requirements

const Requirement = z.object({ code: opt(40), title: z.string().trim().min(3).max(200), instruction: opt(2000), discipline: z.enum(DISCIPLINES), measure: z.enum(MEASURES), unit: opt(24), target: num, target_note: opt(240), baseline: num, frequency: z.enum(FREQUENCIES), first_period_end: isoDate, due_days: z.coerce.number().int().min(0).max(180), lead_days: z.coerce.number().int().min(1).max(120), owner_role: z.enum(OWNER_ROLES), owner_user_id: opt(40), supplier_party_id: opt(40), evidence: opt(400) });

export async function addRequirement(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const pid = String(form.get('programme_id')), path = `/app/${c.slug}/esg/${pid}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const r = fields(Requirement, form);
  if (!r.success) back(path, { error: t('checkForm') });
  const { data, error } = await c.sb.from('esg_requirements').insert({ tenant_id: c.tenant.id, programme_id: pid, ...r.data! }).select('id').single();
  if (error || !data) back(path, { error: error?.message || 'failed' });
  await c.log(`Added requirement ${r.data!.code ? `${r.data!.code} ` : ''}${r.data!.title} (${r.data!.frequency}, ${r.data!.owner_role})`, { esg_requirement: data!.id, esg_programme: pid });
  const n = await generateTasks(c.tenant.id, { programmeId: pid, sb: c.sb });
  revalidatePath(path); back(path, { saved: '1', created: String(n) });
}

// Who does it, which supplier provides it, and whether it is still active.
export async function updateRequirementOwner(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), pid = String(form.get('programme_id')), path = `/app/${c.slug}/esg/${pid}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const role = String(form.get('owner_role'));
  if (!(OWNER_ROLES as readonly string[]).includes(role)) back(path, { error: t('checkForm') });
  const patch = { owner_role: role, owner_user_id: String(form.get('owner_user_id') || '') || null, supplier_party_id: String(form.get('supplier_party_id') || '') || null, active: form.get('active') === 'on' };
  const { data: r, error } = await c.sb.from('esg_requirements').update(patch).eq('id', id).eq('tenant_id', c.tenant.id).select('code, title').single();
  if (error) back(path, { error: error.message });
  // open tasks follow the new owner
  await c.sb.from('esg_tasks').update({ assignee_user_id: patch.owner_user_id }).eq('requirement_id', id).in('status', ['open', 'returned']);
  await c.log(`Requirement ${r?.code ? `${r.code} ` : ''}${r?.title}: owner ${role}${patch.owner_user_id ? ' (named person)' : ''}${patch.supplier_party_id ? ', supplier provides it' : ''}${patch.active ? '' : ', paused'}`, { esg_requirement: id });
  if (patch.active) await generateTasks(c.tenant.id, { programmeId: pid, sb: c.sb });
  revalidatePath(path); back(path, { saved: '1' });
}

// ------------------------------------------------------------------ reading a requirements document

export type ReadReqState = { error?: string; draft?: { file: string; doc: ReadRequirements; issuerMatch: string | null; supplierMatches: (string | null)[] } };

export async function readRequirements(_prev: ReadReqState, form: FormData): Promise<ReadReqState> {
  const t = await getTranslations('esg');
  const c = await ctx(form);
  if (!canLead(c.membership.role)) return { error: t('onlyLeads') };
  if (!hasLlm()) return { error: t('noAgent') };
  const file = form.get('file') as File | null;
  if (!file || !file.size) return { error: t('noFile') };
  if (file.size > 4_000_000) return { error: t('tooBig') };
  const content = await documentContent(file);
  if (!content) return { error: t('badType') };
  let doc: ReadRequirements | null = null;
  try {
    const { data, usage } = await extract(RequirementsSchema, READ_REQUIREMENTS_SYSTEM, content, { maxTokens: 16000 });
    await recordUsage(c.tenant.id, { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: usage.cost });
    doc = data;
  } catch { return { error: t('unreadable') }; }
  if (!doc || !doc.requirements.length) return { error: t('unreadable') };
  // fill what the document left open with defaults the person can change in the review
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  for (const k of ['starts_on', 'ends_on'] as const) if (doc.programme[k] && !ISO.test(doc.programme[k]!)) doc.programme[k] = null;
  doc.requirements = doc.requirements.map((r) => ({ ...r, first_period_end: r.first_period_end && ISO.test(r.first_period_end) ? r.first_period_end : defaultPeriodEnd(r.frequency, doc!.programme.starts_on, doc!.programme.ends_on), due_days: r.due_days ?? (r.frequency === 'once' ? 0 : 30) }));
  const { data: parties } = await c.sb.from('parties').select('id, name').eq('tenant_id', c.tenant.id);
  return { draft: { file: file.name.slice(0, 200), doc, issuerMatch: findParty(parties || [], doc.programme.issuer), supplierMatches: doc.requirements.map((r) => findParty(parties || [], r.supplier)) } };
}

// A person has checked the review: save the programme and the requirements they kept, then create the tasks.
export async function saveRequirements(_prev: ReadReqState, form: FormData): Promise<ReadReqState> {
  const t = await getTranslations('esg');
  const c = await ctx(form);
  if (!canLead(c.membership.role)) return { error: t('onlyLeads') };
  const file = String(form.get('file_name') || '').slice(0, 200);
  const p = fields(Programme, form, 'p_');
  if (!p.success) return { error: t('checkProgramme') };
  const n = Number(form.get('count')) || 0;
  const reqs = [];
  for (let i = 0; i < Math.min(n, 120); i++) {
    if (form.get(`r${i}_use`) !== 'on') continue;
    const r = fields(Requirement, form, `r${i}_`);
    if (!r.success) return { error: t('checkRow', { n: i + 1 }) };
    reqs.push(r.data);
  }
  if (!reqs.length) return { error: t('noneKept') };
  const { data: prog, error } = await c.sb.from('esg_programmes').insert({ tenant_id: c.tenant.id, ...p.data, source: 'document', source_file: file }).select('id').single();
  if (error || !prog) return { error: error?.message || 'failed' };
  const { error: e2 } = await c.sb.from('esg_requirements').insert(reqs.map((r) => ({ tenant_id: c.tenant.id, programme_id: prog.id, ...r })));
  if (e2) return { error: e2.message };
  await c.log(`Added compliance programme ${p.data.name} from ${file}: ${reqs.length} requirement${reqs.length === 1 ? '' : 's'}, checked by ${c.actor}`, { esg_programme: prog.id, file }, 'Logged', p.data.issuer_name);
  const created = await generateTasks(c.tenant.id, { programmeId: prog.id, sb: c.sb });
  redirect(`/app/${c.slug}/esg/${prog.id}?saved=1&created=${created}`);
}

// ------------------------------------------------------------------ tasks: submit, review, assign

export async function submitTask(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/task/${id}`;
  if (c.membership.role === 'viewer') back(path, { error: t('viewer') });
  const { data: task } = await c.sb.from('esg_tasks').select('id, status, period_label, esg_requirements(code, title, measure, unit)').eq('id', id).eq('tenant_id', c.tenant.id).maybeSingle();
  if (!task) redirect(`/app/${c.slug}/esg`);
  if (['accepted', 'waived'].includes(task.status)) back(path, { error: t('closed') });
  const req = task.esg_requirements as unknown as { code: string | null; title: string; measure: string; unit: string | null };
  const rawNum = String(form.get('value_num') || '').trim().replace(/,/g, '');
  const value_num = rawNum ? Number(rawNum) : null;
  if (rawNum && isNaN(value_num!)) back(path, { error: t('badNumber') });
  const value_text = (String(form.get('value_text') || '').trim() || null)?.slice(0, 4000) ?? null;
  const note = (String(form.get('note') || '').trim() || null)?.slice(0, 2000) ?? null;
  const files = (form.getAll('evidence') as File[]).filter((f) => f && f.size);
  if (files.some((f) => f.size > 4_000_000)) back(path, { error: t('tooBig') });
  const { data: prev } = await c.sb.from('esg_submissions').select('version, evidence').eq('task_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  const keep = form.get('keep_evidence') === 'on' ? ((prev?.evidence as unknown[]) || []) : [];
  if (value_num == null && !value_text && !files.length && !keep.length) back(path, { error: t('emptySubmission') });
  if (req.measure === 'number' && value_num == null) back(path, { error: t('needNumber') });
  // evidence goes to the private bucket under the company and task; the hash is kept with the record
  const admin = supabaseAdmin();
  const evidence = [...keep];
  for (const f of files.slice(0, 5)) {
    const buf = Buffer.from(await f.arrayBuffer());
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const objectPath = `${c.tenant.id}/${id}/${sha256.slice(0, 16)}.${ext}`;
    const { error } = await admin.storage.from(EVIDENCE_BUCKET).upload(objectPath, buf, { contentType: f.type || 'application/octet-stream', upsert: true });
    if (error) back(path, { error: error.message });
    evidence.push({ name: f.name.slice(0, 160), path: objectPath, bytes: f.size, sha256 });
  }
  const version = (prev?.version || 0) + 1;
  const { data: sub, error } = await c.sb.from('esg_submissions').insert({ tenant_id: c.tenant.id, task_id: id, version, value_num, value_text, note, evidence, source: 'manual', submitted_by_name: c.actor }).select('id').single();
  if (error || !sub) back(path, { error: error?.message || 'failed' });
  await c.sb.from('esg_tasks').update({ status: 'submitted', latest_submission_id: sub!.id }).eq('id', id);
  const shown = value_num != null ? `${value_num}${req.unit ? ` ${req.unit}` : ''}` : value_text ? `"${value_text.slice(0, 60)}"` : '';
  await c.log(`Submitted v${version} for ${req.code ? `${req.code} ` : ''}${req.title}, ${task.period_label}${shown ? `: ${shown}` : ''}${evidence.length ? `, ${evidence.length} evidence file${evidence.length === 1 ? '' : 's'}` : ''}`, { esg_task: id, esg_submission: sub!.id });
  revalidatePath(path); back(path, { saved: 'submitted' });
}

export async function reviewTask(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), decision = String(form.get('decision')), path = `/app/${c.slug}/esg/task/${id}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const note = String(form.get('review_note') || '').trim().slice(0, 1000) || null;
  const status = { accept: 'accepted', return: 'returned', waive: 'waived', reopen: 'open' }[decision];
  if (!status) back(path, { error: t('checkForm') });
  if ((decision === 'return' || decision === 'waive') && !note) back(path, { error: t('needReason') });
  const { data: task } = await c.sb.from('esg_tasks').select('status, period_label, esg_requirements(code, title)').eq('id', id).eq('tenant_id', c.tenant.id).maybeSingle();
  if (!task) redirect(`/app/${c.slug}/esg`);
  if (decision === 'accept' && task.status !== 'submitted') back(path, { error: t('nothingToAccept') });
  await c.sb.from('esg_tasks').update({ status, review_note: note, reviewed_by: c.user.id, reviewed_by_name: c.actor, reviewed_at: new Date().toISOString(), ...(decision === 'return' || decision === 'reopen' ? { reminded_stage: 0 } : {}) }).eq('id', id);
  const r = task.esg_requirements as unknown as { code: string | null; title: string };
  await c.log(`${decision === 'accept' ? 'Accepted' : decision === 'return' ? 'Returned' : decision === 'waive' ? 'Waived' : 'Reopened'} ${r.code ? `${r.code} ` : ''}${r.title}, ${task.period_label}${note ? `: ${note}` : ''}`, { esg_task: id }, decision === 'accept' ? `APPROVED · ${c.actor}` : decision === 'return' ? `REJECTED · ${c.actor}` : 'Logged');
  revalidatePath(path); back(path, { saved: decision });
}

export async function assignTask(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/task/${id}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const who = String(form.get('assignee_user_id') || '') || null;
  await c.sb.from('esg_tasks').update({ assignee_user_id: who, reminded_stage: 0 }).eq('id', id).eq('tenant_id', c.tenant.id);
  const { data: m } = who ? await c.sb.from('memberships').select('display_name').eq('tenant_id', c.tenant.id).eq('user_id', who).maybeSingle() : { data: null };
  await c.log(`Compliance task assigned to ${m?.display_name || 'the owning role'}`, { esg_task: id });
  revalidatePath(path); back(path, { saved: 'assigned' });
}

// ------------------------------------------------------------------ reports

export async function prepareReport(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const pid = String(form.get('programme_id')), path = `/app/${c.slug}/esg/${pid}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const from = String(form.get('from')), to = String(form.get('to'));
  const label = String(form.get('label') || '').trim().slice(0, 60) || `${from} to ${to}`;
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success || from > to) back(path, { error: t('badPeriod') });
  const { data: p } = await c.sb.from('esg_programmes').select('name, issuer_name, framework, purpose, parties(name)').eq('id', pid).eq('tenant_id', c.tenant.id).single();
  if (!p) redirect(`/app/${c.slug}/esg`);
  const rows = await gatherRows(c.sb, c.tenant.id, pid, from, to);
  if (!rows.length) back(path, { error: t('noTasksInPeriod') });
  const issuer = (p.parties as unknown as { name: string } | null)?.name || p.issuer_name;
  const summary = await draftSummary(c.tenant.id, { name: p.name, issuer, framework: p.framework, purpose: p.purpose }, label, rows);
  const { data: agent } = await c.sb.from('agents').select('name').eq('tenant_id', c.tenant.id).eq('scope_kind', 'tenant').limit(1).maybeSingle();
  const preparedBy = hasLlm() ? `${agent?.name || 'Mira'} (for ${c.actor})` : c.actor;
  const { data: rep, error } = await c.sb.from('esg_reports').insert({ tenant_id: c.tenant.id, programme_id: pid, period_label: label, period_from: from, period_to: to, summary, rows, prepared_by_name: preparedBy }).select('id').single();
  if (error || !rep) back(path, { error: error?.message || 'failed' });
  await c.log(`Prepared report ${label} for ${p.name}: ${rows.length} items, ${rows.filter((r) => r.status === 'accepted').length} checked`, { esg_report: rep!.id }, 'Logged', issuer);
  redirect(`/app/${c.slug}/esg/report/${rep!.id}`);
}

export async function saveReportSummary(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/report/${id}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const summary = String(form.get('summary') || '').slice(0, 8000);
  const { error } = await c.sb.from('esg_reports').update({ summary }).eq('id', id).eq('tenant_id', c.tenant.id).eq('status', 'draft');
  if (error) back(path, { error: error.message });
  await c.log('Edited the summary of a draft compliance report', { esg_report: id });
  revalidatePath(path); back(path, { saved: 'summary' });
}

// Refresh the figures of a draft from the latest submissions.
export async function refreshReport(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/report/${id}`;
  if (!canLead(c.membership.role)) back(path, { error: t('onlyLeads') });
  const { data: rep } = await c.sb.from('esg_reports').select('programme_id, period_from, period_to, status').eq('id', id).eq('tenant_id', c.tenant.id).single();
  if (!rep || rep.status !== 'draft') back(path, { error: t('approvedFixed') });
  const rows = await gatherRows(c.sb, c.tenant.id, rep!.programme_id, rep!.period_from, rep!.period_to);
  await c.sb.from('esg_reports').update({ rows }).eq('id', id);
  await c.log('Refreshed the figures of a draft compliance report', { esg_report: id });
  revalidatePath(path); back(path, { saved: 'refreshed' });
}

export async function approveReport(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/report/${id}`;
  if (!canApproveReport(c.membership.role)) back(path, { error: t('onlyApprovers') });
  const { data: rep, error } = await c.sb.from('esg_reports').update({ status: 'approved', approved_by_name: c.actor }).eq('id', id).eq('tenant_id', c.tenant.id).eq('status', 'draft').select('period_label, rows').single();
  if (error || !rep) back(path, { error: error?.message || t('approvedFixed') });
  const rows = rep!.rows as { status: string }[];
  await c.log(`Approved compliance report ${rep!.period_label} (${rows.length} items, ${rows.filter((r) => r.status === 'accepted').length} checked)`, { esg_report: id }, `APPROVED · ${c.actor}`);
  revalidatePath(path); back(path, { saved: 'approved' });
}

export async function markReportSent(form: FormData) {
  const c = await ctx(form); const t = await getTranslations('esg');
  const id = String(form.get('id')), path = `/app/${c.slug}/esg/report/${id}`;
  if (!canApproveReport(c.membership.role)) back(path, { error: t('onlyApprovers') });
  const sentTo = String(form.get('sent_to') || '').trim().slice(0, 200);
  if (!sentTo) back(path, { error: t('needRecipient') });
  const { data: rep, error } = await c.sb.from('esg_reports').update({ status: 'sent', sent_to: sentTo, sent_note: String(form.get('sent_note') || '').trim().slice(0, 500) || null, sent_by_name: c.actor }).eq('id', id).eq('tenant_id', c.tenant.id).eq('status', 'approved').select('period_label').single();
  if (error || !rep) back(path, { error: error?.message || 'failed' });
  await c.log(`Compliance report ${rep!.period_label} sent to ${sentTo}`, { esg_report: id }, 'Logged', sentTo);
  revalidatePath(path); back(path, { saved: 'sent' });
}
