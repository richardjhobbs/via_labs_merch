// The agent's own work, without anyone asking: a scheduled pass over the record that queues a
// draft for every exception and every due milestone that has none yet. Runs from the minute
// tick (at most once an hour per company) and right after sample data is loaded.
import { supabaseAdmin } from '@/lib/supabase/server';
import { listOrders, exceptionsOf } from '@/lib/orders';
import { LABELS, isoOf, today } from '@/lib/core/path';
import { runAgent } from './run';
import { ingestInbound } from './inbound';
import { briefForAgent, type BriefRow } from './order-agent';

const PASS_KEY = (t: string) => `proactive:${t}`;
const MAX_ITEMS = 6;
const SEEN_KEY = (t: string) => `proactive_seen:${t}`;

export async function lastPass(tenantId: string) {
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', PASS_KEY(tenantId)).maybeSingle();
  return data?.value || null;
}

export async function runProactive(tenantId: string, opts: { force?: boolean } = {}) {
  const sb = supabaseAdmin();
  const last = await lastPass(tenantId);
  if (!opts.force && last && Date.now() - Date.parse(last) < 60 * 60_000) return { skipped: 'recent' as const };
  const passAt = new Date().toISOString();
  await sb.from('app_config').upsert({ key: PASS_KEY(tenantId), value: passAt, updated_at: passAt });

  const [orders, { data: open }] = await Promise.all([
    listOrders(tenantId, { status: 'open' }, sb),
    sb.from('drafts').select('order_id, stream').eq('tenant_id', tenantId).in('status', ['queued', 'escalated']),
  ]);
  if (!orders.length) return { skipped: 'no orders' as const };
  const hasDraft = new Set((open || []).map((d) => `${d.order_id}`));
  const T = today();

  type Item = { id: string; po: string; kind: string; detail: string; party: string; partyLang: string };
  const items: Item[] = [];
  for (const e of exceptionsOf(orders)) {
    const o = orders.find((x) => x.po === e.po)!;
    if (hasDraft.has(o.id)) continue;
    items.push({ id: o.id, po: e.po, kind: `${e.sev === 'crit' ? 'critical' : 'warning'} exception`, detail: `${e.title}. ${e.chain.map((c) => c.t).join('; ')}. Options: ${e.opts.map((x) => x[0]).join(' / ')}.`, party: o.factory?.name || 'factory', partyLang: 'factory language' });
  }
  for (const o of orders) {
    if (hasDraft.has(o.id) || items.some((i) => i.po === o.po)) continue;
    for (const m of Object.values(o.health.p)) {
      const due = m.plan - T;
      if (m.status !== 'done' && !m.expected && due >= 0 && due <= 3 && ['factory', 'mill'].includes(m.owner)) {
        const party = m.owner === 'mill' ? o.mill?.name : o.factory?.name;
        items.push({ id: o.id, po: o.po, kind: 'milestone due', detail: `${LABELS[m.key]} is due ${isoOf(m.plan)} (${due === 0 ? 'today' : `in ${due} day${due > 1 ? 's' : ''}`}) and nothing has been reported. Ask ${party || m.owner} to confirm it is on track.`, party: party || m.owner, partyLang: 'their language' });
        break;
      }
    }
    if (items.length >= MAX_ITEMS) break;
  }
  if (!items.length) return { queued: 0, items: 0 };

  // Only what changed since the last pass: an item seen last time is left alone unless its order has a newer
  // brief or a new message since. An unchanged book costs nothing (9 Nov 2026: the pass ran every hour).
  const keyOf = (i: Item) => `${i.po}|${i.kind}|${i.detail.slice(0, 120)}`;
  const { data: seenRow } = await sb.from('app_config').select('value').eq('key', SEEN_KEY(tenantId)).maybeSingle();
  let seen: { at?: string; keys?: string[] } = {};
  try { seen = seenRow?.value ? JSON.parse(seenRow.value) : {}; } catch { seen = {}; }
  const ids = items.map((i) => i.id);
  const [{ data: mem }, { data: msgs }] = await Promise.all([
    sb.from('agent_memory').select('order_id, version, brief, sources, created_at, reason, id').in('order_id', ids).order('version', { ascending: false }),
    seen.at ? sb.from('messages').select('order_id').in('order_id', ids).gt('created_at', seen.at) : Promise.resolve({ data: [] as { order_id: string }[] }),
  ]);
  const latest = new Map<string, BriefRow>();
  for (const m of (mem || []) as (BriefRow & { order_id: string })[]) if (!latest.has(m.order_id)) latest.set(m.order_id, m);
  const moved = new Set((msgs || []).map((m) => m.order_id as string));
  const fresh = items.filter((i) => !seen.keys?.includes(keyOf(i)) || moved.has(i.id) || (!!seen.at && (latest.get(i.id)?.created_at || '') > seen.at));
  await sb.from('app_config').upsert({ key: SEEN_KEY(tenantId), value: JSON.stringify({ at: passAt, keys: items.map(keyOf) }), updated_at: passAt });
  if (!fresh.length) return { queued: 0, items: items.length, skipped: 'nothing changed' as const };

  const brief = `Scheduled pass. Nobody is waiting on this conversation. For each item below, queue exactly one draft with queue_draft: stream "Production status", to the party named, in the party's own language with an English rendering in body_en, priority 1 for a critical exception and 2 otherwise. A recovery request asks for written confirmation of the new dates, a plan to recover the ETD, and a reply deadline two working days out; a chaser asks for confirmation that the milestone is on track by its plan date. Short, firm, specific dates and PO numbers. Use get_order first when you need the dates. When all drafts are queued, reply with one line per draft: PO, ref, to whom.

Items:
${fresh.slice(0, MAX_ITEMS).map((i, n) => { const b = briefForAgent(latest.get(i.id) || null); return `${n + 1}. PO ${i.po} — ${i.kind}: ${i.detail} → ${i.party}${b ? `\n   Order agent's brief (v${b.version}): ${b.status} Next: ${b.next_action?.what || 'none'}. Waiting on: ${b.open_asks.map((a) => `${a.owed_by}: ${a.what}`).join('; ') || 'nothing'}. Last contact: ${b.last_contact.map((c) => `${c.party} ${c.date}`).join(', ') || 'none'}.` : ''}`; }).join('\n')}\n\nThe order agent's brief is the current record of each order: write from it, and call get_order or get_messages only if the brief lacks something the message needs.`;
  const r = await runAgent({ tenantId, trigger: 'schedule', messages: [{ role: 'user', content: brief }] });
  return { queued: r.drafts.length, items: fresh.length, error: r.error };
}

// Sample inbound traffic so a freshly loaded company already has messages flowing through the pipeline.
export async function seedSampleInbound(tenantId: string) {
  const sb = supabaseAdmin();
  const orders = await listOrders(tenantId, { status: 'open' }, sb);
  const { data: parties } = await sb.from('parties').select('id, name, kind, meta').eq('tenant_id', tenantId).is('archived_at', null);
  const byCode = (c: string) => parties?.find((p) => (p.meta as { code?: string })?.code === c);
  const poOf = (factoryCode: string, not?: string[]) => orders.find((o) => (o.factory as { id: string } | null)?.id === byCode(factoryCode)?.id && !(not || []).includes(o.po))?.po;
  const hx = byCode('HX'), nl = byCode('NL'), da = byCode('DA');
  const apexPo = poOf('DA');
  const msgs = [
    hx && { channelKind: 'wecom', from: 'chen@huaxin.example', senderName: 'Ms Chen', partyId: hx.id, subject: null, text: `48812 面料延期，永利说11月4日交货。我们11月6日开始裁剪，PP样品11月10日寄出。请确认唛头和尺码比例。` },
    nl && { channelKind: 'email', from: 'hannah@northline.example', senderName: 'Hannah Price', partyId: nl.id, subject: 'SS27 WIP + 48830 fit comments', text: `Hi, could you send the WIP for all our SS27 POs by Monday, in our sheet format as usual? Fit comments for 48830 are attached - we need the revised fit sample back by 5 Nov or the in-store date is at risk. Thanks, Hannah` },
    da && apexPo && { channelKind: 'whatsapp', from: '+8801700000000', senderName: 'Mr Hasan', partyId: da.id, subject: null, text: `Dear sir, for ${apexPo} please confirm carton marking and shipping mark by tomorrow, cartons arriving Thursday. Also fabric for ${apexPo} received today, inline inspection can be booked. Regards Hasan` },
  ].filter(Boolean) as { channelKind: string; from: string; senderName: string; partyId: string; subject: string | null; text: string }[];
  let n = 0;
  for (const m of msgs) { await ingestInbound({ tenantId, ...m, raw: { sample: true } }); n++; }
  await sb.rpc('q_send', { p_queue: 'merch_agent_runs', p_msg: { type: 'proactive', tenant_id: tenantId } });
  return n;
}
