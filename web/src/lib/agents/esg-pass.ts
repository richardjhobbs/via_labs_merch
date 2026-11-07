// The compliance pass, from the minute tick (at most once an hour per company with the add-on):
//   1. create the reporting tasks that fall due within the horizon;
//   2. tell the people who own each open task, in good time: an email digest per person when a task enters
//      its lead window, a week before, and the day before or when overdue; each stage once, on the ledger;
//   3. where a supplier holds the figure (a mill's water use, a laundry's chemical inventory), have the agent
//      queue a request to that supplier in its own language. It is a draft on the Compliance and CSR stream,
//      so the gate decides; nothing goes out unapproved.
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendMail, brandedHtml } from '@/lib/mail';
import { hasLlm } from '@/lib/llm';
import { esgEnabled, esgSnapshot, generateTasks, reminderStage } from '@/lib/esg';
import { runAgent } from './run';

const PASS_KEY = (t: string) => `esg:${t}`;
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';
const ASK_AGAIN_DAYS = 7;

export async function lastEsgPass(tenantId: string) {
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', PASS_KEY(tenantId)).maybeSingle();
  return data?.value || null;
}

// The company that has waited longest for its pass, among those with the add-on.
export async function nextEsgTenant() {
  const sb = supabaseAdmin();
  const { data: tenants } = await sb.from('tenants').select('id, settings');
  let pick: string | null = null, oldest = -1;
  for (const t of (tenants || []).filter((x) => esgEnabled(x.settings))) {
    const lp = await lastEsgPass(t.id); const age = lp ? Date.now() - Date.parse(lp) : Number.MAX_SAFE_INTEGER;
    if (age > 60 * 60_000 && age > oldest) { pick = t.id; oldest = age; }
  }
  return pick;
}

export async function runEsgPass(tenantId: string, opts: { force?: boolean } = {}) {
  const sb = supabaseAdmin();
  const last = await lastEsgPass(tenantId);
  if (!opts.force && last && Date.now() - Date.parse(last) < 60 * 60_000) return { skipped: 'recent' as const };
  await sb.from('app_config').upsert({ key: PASS_KEY(tenantId), value: new Date().toISOString(), updated_at: new Date().toISOString() });
  const { data: tenant } = await sb.from('tenants').select('id, slug, name, settings').eq('id', tenantId).single();
  if (!tenant || !esgEnabled(tenant.settings)) return { skipped: 'off' as const };

  const created = await generateTasks(tenantId, { sb });
  const open = await esgSnapshot(tenantId, sb);

  // 2. reminders to people
  const toRemind = open.filter((t) => t.status !== 'submitted').map((t) => ({ t, stage: reminderStage(t.due, t.lead_days) })).filter((x) => x.stage > 0);
  const { data: staged } = toRemind.length ? await sb.from('esg_tasks').select('id, reminded_stage').in('id', toRemind.map((x) => x.t.id)) : { data: [] };
  const stageOf = new Map((staged || []).map((s) => [s.id, s.reminded_stage as number]));
  const fresh = toRemind.filter((x) => x.stage > (stageOf.get(x.t.id) || 0));
  let emailed = 0;
  if (fresh.length) {
    const { data: members } = await sb.from('memberships').select('user_id, role, display_name').eq('tenant_id', tenantId);
    const people = new Map<string, { name: string; items: (typeof fresh)[number][] }>();
    for (const x of fresh) {
      const who = x.t.assignee_user_id ? (members || []).filter((m) => m.user_id === x.t.assignee_user_id) : (members || []).filter((m) => m.role === x.t.owner_role);
      // nobody holds that role: the owners and managers hear about it instead
      const to = who.length ? who : (members || []).filter((m) => ['owner', 'manager'].includes(m.role));
      for (const m of to) { const p = people.get(m.user_id) || { name: m.display_name || '', items: [] as (typeof fresh)[number][] }; p.items.push(x); people.set(m.user_id, p); }
    }
    for (const [uid, p] of people) {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (!email) continue;
      const lines = p.items.sort((a, b) => a.t.days_left - b.t.days_left).slice(0, 25).map(({ t }) => `${t.days_left < 0 ? `OVERDUE ${-t.days_left} day${t.days_left === -1 ? '' : 's'}` : t.days_left === 0 ? 'Due today' : `${t.trigger === 'expiry' ? 'Expires' : 'Due'} ${t.due} (${t.days_left} day${t.days_left === 1 ? '' : 's'})`}: ${t.code ? `${t.code} ` : ''}${t.title}, ${t.po ? `PO ${t.po}` : t.period}${t.party ? ` · ${t.party}` : ''} · ${t.programme}`);
      const subject = `${tenant.name}: ${p.items.length} compliance report${p.items.length === 1 ? '' : 's'} to prepare`;
      const text = `${p.name ? `${p.name.split(' ')[0]}, these` : 'These'} ESG and compliance items are yours.\n\n${lines.join('\n')}\n\nOpen each one to see what is needed and the evidence to attach.`;
      try {
        await sendMail({ to: email, subject, text, html: brandedHtml({ title: subject, paragraphs: [text.split('\n\n')[0], ...lines, 'Open each one to see what is needed and the evidence to attach.'], cta: { label: 'Open ESG & compliance', url: `${APP}/app/${tenant.slug}/esg` } }) });
        emailed++;
      } catch { /* the ledger row below still records the reminder; the day page shows it */ }
    }
    for (const x of fresh) {
      await sb.from('esg_tasks').update({ reminded_stage: x.stage, reminded_at: new Date().toISOString() }).eq('id', x.t.id);
      await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Email', p_actor: 'VIA Merch', p_actor_user: null, p_counterparty: x.t.owner_role, p_stream: 'Compliance and CSR', p_order: null, p_what: `Reminder (${x.stage === 1 ? 'lead time' : x.stage === 2 ? 'one week' : x.t.days_left < 0 ? 'overdue' : 'due tomorrow'}): ${x.t.code ? `${x.t.code} ` : ''}${x.t.title}, ${x.t.po ? `PO ${x.t.po}` : x.t.period}${x.t.party ? ` (${x.t.party})` : ''}, due ${x.t.due} · ${x.t.programme}`, p_gate: 'Logged', p_gated: false, p_ref: { esg_task: x.t.id } });
    }
  }

  // 3. requests to suppliers who hold the figure
  let asked = 0;
  const supplierTasks = open.filter((t) => t.supplier_party_id && ['due', 'overdue', 'returned'].includes(t.state));
  if (supplierTasks.length && hasLlm()) {
    const { data: rows } = await sb.from('esg_tasks').select('id, supplier_asked_at').in('id', supplierTasks.map((t) => t.id));
    const askedAt = new Map((rows || []).map((r) => [r.id, r.supplier_asked_at as string | null]));
    const due = supplierTasks.filter((t) => { const a = askedAt.get(t.id); return !a || Date.now() - Date.parse(a) > ASK_AGAIN_DAYS * 864e5; }).slice(0, 5);
    if (due.length) {
      const { data: parties } = await sb.from('parties').select('id, name').in('id', due.map((t) => t.supplier_party_id!));
      const nameOf = (id: string) => parties?.find((p) => p.id === id)?.name || id;
      const brief = `Compliance pass. Nobody is waiting on this conversation. Our ESG reporting needs figures or evidence that a supplier holds. For each item, queue exactly one draft with queue_draft: stream "Compliance and CSR", to the supplier named, in their own language with an English rendering in body_en, priority 2 (1 if overdue). Ask for the figure, document or certificate for the period, PO or renewal stated, how it was measured where relevant, and the evidence named, by a date three working days before our due date. Be courteous and specific. Then stop.

Items:
${due.map((t, n) => `${n + 1}. ${nameOf(t.supplier_party_id!)}: ${t.code ? `${t.code} ` : ''}${t.title} for ${t.po ? `PO ${t.po}` : t.trigger === 'expiry' ? 'renewal of the certificate or licence' : t.period}${t.unit ? ` (unit ${t.unit})` : ''}; our report is due ${t.due}${t.days_left < 0 ? ' and is overdue' : ''}. Programme: ${t.programme}.`).join('\n')}`;
      const r = await runAgent({ tenantId, trigger: 'schedule', messages: [{ role: 'user', content: brief }] });
      if (r.drafts.length) {
        await sb.from('esg_tasks').update({ supplier_asked_at: new Date().toISOString() }).in('id', due.map((t) => t.id));
        asked = r.drafts.length;
      }
    }
  }
  return { created, reminded: fresh.length, emailed, asked };
}
