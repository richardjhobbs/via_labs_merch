// Development track tools: styles, tech pack versions and the style file. Read-only except nothing:
// sample decisions, tech pack confirmation and style status are a person's actions in the workspace, so
// the agent has no tool that writes them. Drafting to a party goes through queue_draft with `style`.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { listStyles, styleByCode, getStyle, styleBrief, styleFile, styleSignals } from '@/lib/styles';
import { styleRecords, techPackVersions, diffTechPack } from '@/lib/records';
import { listSamples, listMaterials, listDevMilestones, sampleState } from '@/lib/samples';
import { computeDevPath } from '@/lib/dev-path';
import { isoOf } from '@/lib/core/path';
import { actorOf } from './tools';
import { partyByRef, type AgentCtx } from './tools';

const brief = (s: Awaited<ReturnType<typeof listStyles>>[number]) => ({ id: s.id, code: s.code, name: s.name, season: s.season, category: s.category, status: s.status, customer: s.customer?.name, target_price: s.target_price, currency: s.currency, target_delivery: s.target_delivery, plm_ref: s.plm_ref, updated_at: s.updated_at });

export function styleTools(ctx: AgentCtx, wrap: <I, O>(name: string, fn: (i: I) => Promise<O>) => (i: I) => Promise<string>) {
  const sb = supabaseAdmin(), T = ctx.tenantId;
  const resolve = async (ref: string) => (/^[0-9a-f-]{36}$/i.test(ref.trim()) ? getStyle(T, ref.trim(), sb) : styleByCode(T, ref, sb));

  const search_styles = betaZodTool({
    name: 'search_styles',
    description: 'Development track: list styles in development with customer, season, status (brief, developing, sampling, costing, adopted, handed_over, dropped), the latest confirmed tech pack version and records awaiting a check. Filter by free text, customer, season or status.',
    inputSchema: z.object({ query: z.string().optional().describe('style code, name or description text'), customer: z.string().optional(), season: z.string().optional(), status: z.string().optional() }),
    run: wrap('search_styles', async (a) => {
      let L = await listStyles(T, { customers: ctx.scope, status: a.status, season: a.season }, sb);
      const q = (a.query || '').toLowerCase();
      if (q) L = L.filter((s) => `${s.code} ${s.name || ''} ${s.description || ''} ${s.category || ''}`.toLowerCase().includes(q));
      if (a.customer) { const p = await partyByRef(T, a.customer); L = L.filter((s) => s.customer?.id === p?.id || (s.customer?.name || '').toLowerCase().includes(a.customer!.toLowerCase())); }
      L = L.slice(0, 40);
      const sig = await styleSignals(T, L.map((s) => s.id), sb);
      return L.map((s) => ({ ...brief(s), tech_pack_version: sig.get(s.id)?.techPack?.version ?? null, records_awaiting_check: sig.get(s.id)?.pending ?? 0 }));
    }),
  });

  const get_style = betaZodTool({
    name: 'get_style',
    description: 'Development track: one style in full: the record, the latest confirmed tech pack (fabric, BOM, colourways, points of measure with tolerances, construction notes, labelling, packaging, testing), every tech pack version, and other records (briefs, photos, comments) with whether a person has confirmed them.',
    inputSchema: z.object({ style: z.string().describe('style code as the customer writes it, or the style id') }),
    run: wrap('get_style', async ({ style }) => {
      const s = await resolve(style);
      if (!s) return { error: `No style matching "${style}"` };
      if (ctx.scope && s.customer && !ctx.scope.includes(s.customer.id)) return { error: 'This style belongs to a customer outside your scope.' };
      const b = await styleBrief(T, s.id);
      if (!b) return { error: 'not found' };
      const tp = b.techPack?.parsed || null;
      return { ...brief(s), description: s.description, tech_pack: tp ? { version: b.techPack!.version, label: tp.version_label, date: tp.date, lang: tp.lang, fabric: tp.fabric_summary, sizes: tp.sizes, colourways: tp.colourways, bom: tp.bom, poms: tp.poms, construction: tp.construction, labelling: tp.labelling, packaging: tp.packaging, testing: tp.testing, notes: tp.notes, translations: Object.keys(tp.translations || {}) } : null, tech_pack_versions: b.techPackVersions, other_records: b.records };
    }),
  });

  const get_style_file = betaZodTool({
    name: 'get_style_file',
    description: 'Development track: every conversation on a style with the customer\'s design, tech and buying people, the mills, the sample room and the factory, who said what and when. Use for "where are we with the customer on 2201", "what did the mill say about the swatch".',
    inputSchema: z.object({ style: z.string() }),
    run: wrap('get_style_file', async ({ style }) => {
      const s = await resolve(style);
      if (!s) return { error: `No style matching "${style}"` };
      const file = await styleFile(T, s.id);
      return { style: s.code, customer: s.customer?.name, threads: file.map((t) => ({ party: t.party?.name, kind: t.party?.kind, subject: t.subject, channel: t.channel, summary: t.summary, messages: t.messages.slice(-12) })) };
    }),
  });

  const diff_tech_pack = betaZodTool({
    name: 'diff_tech_pack',
    description: 'Development track: what changed between two confirmed tech pack versions of a style (BOM lines, points of measure and tolerances, colourways, construction notes, fabric, sizes, labelling, packaging, price, delivery). Defaults to the latest version against the one before it.',
    inputSchema: z.object({ style: z.string(), from_version: z.number().int().optional(), to_version: z.number().int().optional() }),
    run: wrap('diff_tech_pack', async (a) => {
      const s = await resolve(a.style);
      if (!s) return { error: `No style matching "${a.style}"` };
      const tps = techPackVersions(await styleRecords(sb, T, s.id));
      if (tps.length < 2 && a.from_version == null) return { error: 'Only one confirmed tech pack version so far.', versions: tps.map((r) => r.version) };
      const to = a.to_version != null ? tps.find((r) => r.version === a.to_version) : tps[0];
      const from = a.from_version != null ? tps.find((r) => r.version === a.from_version) : tps[1];
      if (!to || !from) return { error: 'No such version', versions: tps.map((r) => r.version) };
      return { style: s.code, from: { version: from.version, label: from.parsed?.version_label, confirmed_at: from.confirmed_at }, to: { version: to.version, label: to.parsed?.version_label, confirmed_at: to.confirmed_at }, changes: diffTechPack(from.parsed, to.parsed) };
    }),
  });

  const get_samples = betaZodTool({
    name: 'get_samples',
    description: 'Development track: sample rounds (proto, fit, size set, SMS, PP, lab dip, strike-off...) for one style or across all styles: maker, due, sent with courier and AWB, received, state (planned, overdue, in transit, awaiting a decision, approved, rejected, resubmit), decision and who made it, comments. Decisions are only ever made by a person in the workspace.',
    inputSchema: z.object({ style: z.string().optional().describe('style code or id; omit for every open round'), open_only: z.boolean().optional() }),
    run: wrap('get_samples', async (a) => {
      const st = a.style ? await resolve(a.style) : null;
      if (a.style && !st) return { error: `No style matching "${a.style}"` };
      const L = await listSamples(T, { styleId: st?.id, open: a.open_only }, sb);
      return L.slice(0, 60).map((x) => ({ id: x.id, style: x.style?.code, po: x.order?.po, type: x.type, round: x.round, size: x.size, colourway: x.colourway, maker: x.maker?.name, requested: x.requested_at, due: x.due_at, sent: x.sent_at, courier: x.courier, awb: x.awb, received: x.received_at, state: sampleState(x), decision: x.decision, decided_by: x.decided_by_name, comments: x.comments, note: x.note }));
    }),
  });

  const record_sample_event = betaZodTool({
    name: 'record_sample_event',
    description: 'Development track: record that a sample round was sent (with courier and AWB) or received, or a new due date, when the maker or a person clearly states it. Never records a decision: approvals and rejections are a person\'s action in the workspace.',
    inputSchema: z.object({ sample_id: z.string().describe('id from get_samples'), event: z.enum(['sent', 'received', 'due']), date: z.string().describe('YYYY-MM-DD'), courier: z.string().optional(), awb: z.string().optional(), note: z.string().optional() }),
    run: wrap('record_sample_event', async (a) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return { error: 'date must be YYYY-MM-DD' };
      const { data: smp } = await sb.from('samples').select('id, style_id, type, round, decision').eq('tenant_id', T).eq('id', a.sample_id).maybeSingle();
      if (!smp) return { error: 'No such sample round' };
      const patch = a.event === 'sent' ? { sent_at: a.date, courier: a.courier || null, awb: a.awb || null } : a.event === 'received' ? { received_at: a.date } : { due_at: a.date };
      const { error } = await sb.from('samples').update({ ...patch, ...(a.note ? { note: a.note.slice(0, 500) } : {}) }).eq('id', smp.id);
      if (error) throw new Error(error.message);
      await sb.rpc('ledger_append', { p_tenant: T, p_channel: ctx.trigger === 'chat' ? 'Console' : 'Inbound', p_actor: actorOf(ctx), p_actor_user: ctx.userId, p_counterparty: null, p_stream: 'Sample schedule', p_order: null, p_what: `${smp.type} round ${smp.round} ${a.event === 'due' ? 'due date' : a.event} ${a.date}${a.courier ? ` ${a.courier} ${a.awb || ''}` : ''}${a.note ? ` (${a.note})` : ''}`, p_gate: ctx.trigger === 'chat' ? 'PERSON · chat' : 'AUTO · capture', p_gated: false, p_ref: { sample_id: smp.id, event: a.event, date: a.date }, p_track: 'development', p_style: smp.style_id });
      return { ok: true, sample_id: smp.id, event: a.event, date: a.date };
    }),
  });

  const get_materials = betaZodTool({
    name: 'get_materials',
    description: 'Development track: the bill of materials of a style with sourcing status per line (to source, swatch requested, swatch received, lab dip pending, approved, rejected), supplier, MOQ, lead time and price.',
    inputSchema: z.object({ style: z.string() }),
    run: wrap('get_materials', async ({ style }) => {
      const st = await resolve(style);
      if (!st) return { error: `No style matching "${style}"` };
      const L = await listMaterials(T, st.id, sb);
      return L.map((m) => ({ id: m.id, kind: m.kind, item: m.item, description: m.description, composition: m.composition, weight: m.weight, colour: m.colour, placement: m.placement, qty: m.qty, supplier: m.supplier?.name || m.supplier_name, status: m.status, moq: m.moq, lead_days: m.lead_days, price: m.price, currency: m.currency, note: m.note }));
    }),
  });

  const get_schedule = betaZodTool({
    name: 'get_schedule',
    description: 'Development track: the development schedule of a style (brief, tech pack, materials, proto, fits, size set, cost, adoption) with plan, forecast, slip and status per step. The forecast moves when an upstream step slips.',
    inputSchema: z.object({ style: z.string() }),
    run: wrap('get_schedule', async ({ style }) => {
      const st = await resolve(style);
      if (!st) return { error: `No style matching "${style}"` };
      const rows = await listDevMilestones(T, st.id, sb);
      if (!rows.length) return { style: st.code, schedule: [], note: 'No schedule yet; a person builds it from the target delivery date on the style page.' };
      return { style: st.code, target_delivery: st.target_delivery, schedule: computeDevPath(rows).map((p) => ({ step: p.label, key: p.key, owner: p.owner, plan: isoOf(p.plan), forecast: isoOf(p.f), actual: p.actual != null ? isoOf(p.actual) : null, status: p.status, slip_days: p.status === 'done' ? 0 : p.slip })) };
    }),
  });

  return [search_styles, get_style, get_style_file, diff_tech_pack, get_samples, record_sample_event, get_materials, get_schedule];
}
