// The agent's tools over the company's record. Ported from the demo's mira/tools.js and run
// server-side under the service role, scoped to one tenant. Sending is gated in code:
// queue_draft never sends; request_approval sends itself only at L2+ on an uncapped stream.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { listOrders, getOrder, exceptionsOf } from '@/lib/orders';
import { LABELS, MILESTONES, isoOf, type MilestoneKey } from '@/lib/core/path';

export type AgentCtx = {
  tenantId: string; agentId: string | null; agentName: string;
  trigger: 'chat' | 'inbound' | 'schedule' | 'partner';
  userId: string | null; userName: string | null; userEmail: string | null;
  sourceMessageId?: string | null;
  calls: { name: string; input: unknown; ok: boolean; ms: number }[];
  drafts: string[];                // draft ids created in this run
};

const STREAMS = ['General enquiries', 'RFQ and quotes', 'Tech pack forwarding', 'Approvals', 'Order confirmation', 'WIP reports', 'Amendments', 'Price clarification', 'Production status', 'QC', 'Compliance and CSR', 'Logistics', 'Claims', 'Material sourcing'] as const;

export async function gateOf(tenantId: string, stream: string) {
  const { data } = await supabaseAdmin().from('gates').select('level, locked').eq('tenant_id', tenantId).eq('stream', stream).maybeSingle();
  return { level: data?.level ?? 1, locked: data?.locked ?? null };
}

const actorOf = (ctx: AgentCtx) => ctx.userName ? `${ctx.agentName} (for ${ctx.userName})` : ctx.agentName;
const d = (n: number | undefined) => (n == null ? null : isoOf(n));

async function partyByRef(tenantId: string, ref: string) {
  const sb = supabaseAdmin(), r = ref.trim();
  if (/^[0-9a-f-]{36}$/i.test(r)) { const { data } = await sb.from('parties').select('id, name, short, kind, country, lang, channel_pref').eq('tenant_id', tenantId).eq('id', r).maybeSingle(); if (data) return data; }
  const { data } = await sb.from('parties').select('id, name, short, kind, country, lang, channel_pref, meta').eq('tenant_id', tenantId);
  const L = (data || []), q = r.toLowerCase();
  return L.find((p) => (p.meta as { code?: string })?.code?.toLowerCase() === q) || L.find((p) => p.name.toLowerCase() === q || (p.short || '').toLowerCase() === q) || L.find((p) => p.name.toLowerCase().includes(q) || (p.short || '').toLowerCase().includes(q)) || null;
}

function orderBrief(o: Awaited<ReturnType<typeof listOrders>>[number]) {
  const h = o.health;
  return { po: o.po, style: o.style, description: o.description, customer: o.customer?.name, factory: o.factory?.name, factory_country: o.factory?.country, qty: o.qty, fob: o.fob, currency: o.currency, status: o.status, health: h.state, etd_plan: d(h.p.etd?.plan), etd_forecast: d(h.p.etd?.f), etd_slip_days: h.etdSlip, late_milestones: Object.values(h.p).filter((m) => m.status === 'late').map((m) => LABELS[m.key]) };
}

export function toolsFor(ctx: AgentCtx) {
  const sb = supabaseAdmin();
  const T = ctx.tenantId;
  const wrap = <I, O>(name: string, fn: (i: I) => Promise<O>) => async (i: I) => {
    const t0 = Date.now();
    try { const r = await fn(i); ctx.calls.push({ name, input: i, ok: true, ms: Date.now() - t0 }); return JSON.stringify(r); }
    catch (e) { ctx.calls.push({ name, input: i, ok: false, ms: Date.now() - t0 }); return JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
  };

  const get_briefing = betaZodTool({
    name: 'get_briefing',
    description: 'What needs the person now: the open approval queue (drafts the agent prepared), open exceptions, off-plan POs and headline counts. Call first for "what needs me", "where are we", "morning briefing".',
    inputSchema: z.object({}),
    run: wrap('get_briefing', async () => {
      const [{ data: drafts }, orders] = await Promise.all([
        sb.from('drafts').select('id, seq, priority, stream, title, impact, gate_level, created_at, orders(po), parties(name)').eq('tenant_id', T).in('status', ['queued', 'escalated']).order('priority').order('seq').limit(12),
        listOrders(T, { status: 'open' }, sb),
      ]);
      const ex = exceptionsOf(orders);
      return { today: isoOf(Math.floor(Date.now() / 864e5)), open_drafts: (drafts || []).map((x) => ({ id: x.id, ref: `Q-${x.seq}`, priority: x.priority, stream: x.stream, po: (x.orders as unknown as { po: string } | null)?.po, party: (x.parties as unknown as { name: string } | null)?.name, title: x.title, impact: x.impact, autonomy: `L${x.gate_level}` })), exceptions: ex.slice(0, 6).map((e) => ({ severity: e.sev, po: e.po, title: e.title, exposure_usd: e.exposure })), off_plan_pos: orders.filter((o) => o.health.state === 'red').map((o) => o.po), counts: { open_pos: orders.length, off_plan: orders.filter((o) => o.health.state !== 'green').length } };
    }),
  });

  const search_orders = betaZodTool({
    name: 'search_orders',
    description: 'List POs with customer, factory, qty, plan and forecast ETD and health (red/amber/green). Filter by free text, customer, factory, or off_plan only.',
    inputSchema: z.object({ query: z.string().optional().describe('PO, style or description text'), customer: z.string().optional().describe('customer name or code'), factory: z.string().optional().describe('factory name or code'), off_plan: z.boolean().optional() }),
    run: wrap('search_orders', async (a) => {
      let L = await listOrders(T, {}, sb);
      const q = (a.query || '').toLowerCase();
      if (q) L = L.filter((o) => `${o.po} ${o.style || ''} ${o.description || ''}`.toLowerCase().includes(q));
      if (a.customer) { const p = await partyByRef(T, a.customer); L = L.filter((o) => o.customer?.id === p?.id || o.customer?.name.toLowerCase().includes(a.customer!.toLowerCase())); }
      if (a.factory) { const p = await partyByRef(T, a.factory); L = L.filter((o) => o.factory?.id === p?.id || o.factory?.name.toLowerCase().includes(a.factory!.toLowerCase())); }
      if (a.off_plan) L = L.filter((o) => o.health.state !== 'green');
      return L.slice(0, 40).map(orderBrief);
    }),
  });

  const get_order = betaZodTool({
    name: 'get_order',
    description: 'Full record for one PO: critical path with plan, forecast and status per milestone, supply chain (factory, mill, fibre), route, sizes, colours and the open exception if any.',
    inputSchema: z.object({ po: z.string().describe('PO number, e.g. 48812') }),
    run: wrap('get_order', async ({ po }) => {
      const o = await getOrder(T, po.trim(), sb);
      if (!o) return { error: `No PO ${po} in this company` };
      const h = o.health, ex = exceptionsOf([o])[0];
      return { ...orderBrief(o), composition: o.composition, category: o.category, sizes: o.sizes, colours: o.colours, incoterm: o.incoterm, route: `${o.pol || '?'} → ${o.pod || '?'}`, in_store: o.instore_date, season: o.season, supply_chain: { factory: o.factory?.name, mill: o.mill?.name, fibre: o.fibre?.name },
        critical_path: MILESTONES.map((k) => h.p[k]).filter(Boolean).map((m) => ({ milestone: LABELS[m.key], key: m.key, owner: m.owner, plan: d(m.plan), forecast: d(m.status === 'done' ? m.actual : m.f), reported_expected: d(m.expected), actual: d(m.actual), status: m.status, slip_days: m.status === 'done' ? 0 : m.slip })),
        exception: ex ? { severity: ex.sev, title: ex.title, exposure_usd: ex.exposure, chain: ex.chain.map((c) => c.t), options: ex.opts.map((o) => ({ option: o[0], consequence: o[1] })) } : null };
    }),
  });

  const get_exceptions = betaZodTool({
    name: 'get_exceptions',
    description: 'Open exception chains computed from live dates: cause, downstream effect, cost exposure (airfreight) and decision options.',
    inputSchema: z.object({}),
    run: wrap('get_exceptions', async () => exceptionsOf(await listOrders(T, { status: 'open' }, sb)).map((e) => ({ severity: e.sev, po: e.po, title: e.title, exposure_usd: e.exposure, chain: e.chain.map((c) => c.t), options: e.opts.map((o) => ({ option: o[0], consequence: o[1] })) }))),
  });

  const get_party = betaZodTool({
    name: 'get_party',
    description: 'A customer or supplier: kind, tier, country, language, preferred channel, contacts, scorecard and live POs.',
    inputSchema: z.object({ party: z.string().describe('name, short name or code') }),
    run: wrap('get_party', async ({ party }) => {
      const p = await partyByRef(T, party);
      if (!p) return { error: `No customer or supplier matching "${party}"` };
      const [{ data: full }, { data: contacts }, orders] = await Promise.all([
        sb.from('parties').select('tier, city, score, policy, report_format').eq('id', p.id).single(),
        sb.from('contacts').select('name, role, email, phone, lang').eq('party_id', p.id),
        listOrders(T, { status: 'open' }, sb),
      ]);
      const mine = orders.filter((o) => [o.customer?.id, o.factory?.id, o.mill?.id, o.fibre?.id].includes(p.id));
      return { ...p, ...full, contacts, open_pos: mine.map(orderBrief) };
    }),
  });

  const get_messages = betaZodTool({
    name: 'get_messages',
    description: 'Recent inbound and outbound messages, in the original language with the English rendering, optionally for one PO or one party.',
    inputSchema: z.object({ po: z.string().optional(), party: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    run: wrap('get_messages', async (a) => {
      let q = sb.from('messages').select('id, direction, from_addr, sender_name, lang, text, text_en, stream, received_at, orders(po), parties(name)').eq('tenant_id', T).order('received_at', { ascending: false }).limit(a.limit || 15);
      if (a.po) { const { data: o } = await sb.from('orders').select('id').eq('tenant_id', T).eq('po', a.po).maybeSingle(); if (o) q = q.eq('order_id', o.id); }
      if (a.party) { const p = await partyByRef(T, a.party); if (p) q = q.eq('party_id', p.id); }
      const { data } = await q;
      return (data || []).map((m) => ({ id: m.id, direction: m.direction, from: m.sender_name || m.from_addr, lang: m.lang, text: m.text, text_en: m.text_en, stream: m.stream, at: m.received_at, po: (m.orders as unknown as { po: string } | null)?.po, party: (m.parties as unknown as { name: string } | null)?.name }));
    }),
  });

  const get_ledger = betaZodTool({
    name: 'get_ledger',
    description: 'Recent signed ledger entries (captures, drafts, approvals, rejections, autonomy changes), optionally for one PO.',
    inputSchema: z.object({ po: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    run: wrap('get_ledger', async (a) => {
      let q = sb.from('ledger').select('id, at, channel, actor, counterparty, stream, what, gate, gated, orders(po)').eq('tenant_id', T).order('id', { ascending: false }).limit(a.limit || 20);
      if (a.po) { const { data: o } = await sb.from('orders').select('id').eq('tenant_id', T).eq('po', a.po).maybeSingle(); if (o) q = q.eq('order_id', o.id); }
      const { data } = await q;
      return (data || []).map((r) => ({ ...r, po: (r.orders as unknown as { po: string } | null)?.po, orders: undefined }));
    }),
  });

  const get_gates = betaZodTool({
    name: 'get_gates',
    description: 'Autonomy per stream: L0 record only, L1 draft and a person sends, L2 routine messages sent by the agent, L3 act within limits. Locked streams are capped.',
    inputSchema: z.object({}),
    run: wrap('get_gates', async () => { const { data } = await sb.from('gates').select('stream, level, locked').eq('tenant_id', T).order('stream'); return data || []; }),
  });

  const queue_draft = betaZodTool({
    name: 'queue_draft',
    description: 'Create an outbound message draft and put it in the approval queue. It is NOT sent. Write in the merchandiser\'s voice: short, firm, specific dates and PO numbers. If the recipient works in another language, write the message in their language and put an English rendering in body_en.',
    inputSchema: z.object({ stream: z.enum(STREAMS), po: z.string().optional().describe('PO number or empty'), party: z.string().describe('customer or supplier the message goes to (name or code)'), title: z.string().describe('one-line summary'), body: z.string().describe('the full message in the recipient\'s language'), body_en: z.string().optional().describe('English rendering when body is not English'), lang: z.string().optional().describe('ISO code of body, e.g. zh'), impact: z.string().optional().describe('why it matters: dates, money, risk'), priority: z.number().int().min(1).max(3).optional().describe('1 urgent, 2 normal, 3 low') }),
    run: wrap('queue_draft', async (a) => {
      const p = await partyByRef(T, a.party);
      const o = a.po ? (await sb.from('orders').select('id').eq('tenant_id', T).eq('po', a.po).maybeSingle()).data : null;
      const g = await gateOf(T, a.stream);
      const { data: contact } = p ? await sb.from('contacts').select('id').eq('party_id', p.id).order('is_primary', { ascending: false }).limit(1).maybeSingle() : { data: null };
      const { data: dr, error } = await sb.from('drafts').insert({ tenant_id: T, agent_id: ctx.agentId, role: 'merchandiser', priority: a.priority || 2, stream: a.stream, order_id: o?.id || null, party_id: p?.id || null, contact_id: contact?.id || null, source_message_id: ctx.sourceMessageId || null, title: a.title, impact: a.impact || null, body: a.body, body_en: a.body_en || null, lang: a.lang || p?.lang || 'en', gate_level: g.level }).select('id, seq').single();
      if (error || !dr) throw new Error(error?.message || 'draft failed');
      ctx.drafts.push(dr.id);
      await sb.rpc('ledger_append', { p_tenant: T, p_channel: p?.channel_pref || 'Draft', p_actor: actorOf(ctx), p_actor_user: ctx.userId, p_counterparty: p?.name || a.party, p_stream: a.stream, p_order: o?.id || null, p_what: `Draft Q-${dr.seq}: ${a.title}`, p_gate: `L${g.level}${g.locked != null ? ' · capped' : ''}`, p_gated: true, p_ref: { draft_id: dr.id } });
      return { id: dr.id, ref: `Q-${dr.seq}`, queued: true, autonomy: `L${g.level}`, note: g.level >= 2 && g.locked == null ? 'Routine stream at L2: request_approval may send it.' : 'A person must approve before it is sent.' };
    }),
  });

  const request_approval = betaZodTool({
    name: 'request_approval',
    description: 'Ask to send a queued draft. Below L2, or on a capped stream, this returns needs_person and the draft waits in the queue. At L2+ on an uncapped stream the agent approves it itself and it is logged.',
    inputSchema: z.object({ id: z.string().describe('draft id or ref like Q-12') }),
    run: wrap('request_approval', async ({ id }) => {
      const m = id.match(/^Q-(\d+)$/i);
      const { data: dr } = m ? await sb.from('drafts').select('*').eq('tenant_id', T).eq('seq', Number(m[1])).maybeSingle() : await sb.from('drafts').select('*').eq('tenant_id', T).eq('id', id).maybeSingle();
      if (!dr) return { error: 'No such draft' };
      if (dr.status !== 'queued') return { sent: false, status: dr.status };
      const g = await gateOf(T, dr.stream);
      if (g.level < 2 || g.locked != null) return { sent: false, needs_person: true, ref: `Q-${dr.seq}`, autonomy: `L${g.level}`, note: 'Waiting in the approval queue for a person.' };
      await sb.from('drafts').update({ status: 'approved', decided_at: new Date().toISOString(), decision_note: `AUTO · L${g.level}` }).eq('id', dr.id);
      await sb.rpc('ledger_append', { p_tenant: T, p_channel: 'Draft', p_actor: ctx.agentName, p_actor_user: null, p_counterparty: null, p_stream: dr.stream, p_order: dr.order_id, p_what: `Approved Q-${dr.seq} under L${g.level}: ${dr.title}`, p_gate: `AUTO · L${g.level}`, p_gated: false, p_ref: { draft_id: dr.id } });
      return { sent: false, approved: true, ref: `Q-${dr.seq}`, note: 'Approved under L2; it goes out when the channel is connected.' };
    }),
  });

  const set_milestone = betaZodTool({
    name: 'set_milestone',
    description: 'Record a revised expected date or an actual date for a milestone of a PO, as reported by the person or a supplier. The forecast downstream recomputes. Only when a date was clearly given; never guess.',
    inputSchema: z.object({ po: z.string(), key: z.enum(MILESTONES), field: z.enum(['expected', 'actual']), date: z.string().describe('YYYY-MM-DD'), note: z.string().optional() }),
    run: wrap('set_milestone', async (a) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return { error: 'date must be YYYY-MM-DD' };
      const { data: o } = await sb.from('orders').select('id').eq('tenant_id', T).eq('po', a.po).maybeSingle();
      if (!o) return { error: `No PO ${a.po}` };
      const patch = a.field === 'actual' ? { actual_date: a.date } : { expected_date: a.date, actual_date: null };
      const { error } = await sb.from('milestones').update({ ...patch, note: a.note || null, updated_by: ctx.userId }).eq('order_id', o.id).eq('key', a.key as MilestoneKey);
      if (error) throw new Error(error.message);
      await sb.rpc('ledger_append', { p_tenant: T, p_channel: ctx.trigger === 'chat' ? 'Console' : 'Inbound', p_actor: actorOf(ctx), p_actor_user: ctx.userId, p_counterparty: null, p_stream: 'Production status', p_order: o.id, p_what: `${LABELS[a.key as MilestoneKey]} ${a.field} date set to ${a.date}${a.note ? ` (${a.note})` : ''}`, p_gate: ctx.trigger === 'chat' ? 'PERSON · chat' : 'AUTO · capture', p_gated: false, p_ref: { key: a.key, field: a.field, date: a.date } });
      const after = await getOrder(T, a.po, sb);
      return { ok: true, health: after?.health.state, etd_forecast: d(after?.health.p.etd?.f), etd_slip_days: after?.health.etdSlip };
    }),
  });

  const all = [get_briefing, search_orders, get_order, get_exceptions, get_party, get_messages, get_ledger, get_gates, queue_draft, request_approval, set_milestone];
  // inbound runs may capture a reported date (L1 record) and draft; they never approve
  return ctx.trigger === 'inbound' ? all.filter((t) => t.name !== 'request_approval') : all;
}
