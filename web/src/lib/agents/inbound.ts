// Inbound pipeline: a message from any channel becomes a record, is linked to a party and
// an order, classified into a stream, and handed to the agent, which captures any reported
// date and queues a reply at the stream's gate level.
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extract, recordUsage, LANG_NAMES } from '@/lib/llm';
import { runAgent } from './run';
import { findOrCreateThread, threadMessages } from '@/lib/threads';

export type InboundInput = { tenantId: string; channelKind: string; channelId?: string | null; from: string; senderName?: string | null; partyId?: string | null; subject?: string | null; text: string; externalId?: string | null; raw?: unknown };

// Store the message and put it on the inbound queue (the minute worker drains it).
export async function ingestInbound(m: InboundInput, opts: { enqueue?: boolean } = {}) {
  const sb = supabaseAdmin();
  const threadId = await findOrCreateThread(sb, m.tenantId, m.partyId || null, null, m.channelKind, m.subject || null);
  await sb.from('threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);
  const { data: msg, error } = await sb.from('messages').insert({ tenant_id: m.tenantId, thread_id: threadId, channel_id: m.channelId || null, direction: 'in', party_id: m.partyId || null, external_id: m.externalId || null, from_addr: m.from, sender_name: m.senderName || null, text: m.text, raw: { channel: m.channelKind, subject: m.subject || null, ...(typeof m.raw === 'object' && m.raw ? m.raw : {}) } }).select('id').single();
  if (error || !msg) throw new Error(error?.message || 'message insert failed');
  await recordUsage(m.tenantId, { messagesIn: 1 });
  if (opts.enqueue !== false) await sb.rpc('q_send', { p_queue: 'merch_inbound', p_msg: { message_id: msg.id, tenant_id: m.tenantId } });
  return msg.id;
}

const Parsed = z.object({
  lang: z.string().describe('ISO 639-1 code of the message language'),
  text_en: z.string().describe('faithful English rendering; identical to the original when it is English'),
  stream: z.enum(['General enquiries', 'RFQ and quotes', 'Tech pack forwarding', 'Approvals', 'Order confirmation', 'WIP reports', 'Amendments', 'Price clarification', 'Production status', 'QC', 'Compliance and CSR', 'Logistics', 'Claims', 'Material sourcing']),
  po_numbers: z.array(z.string()).describe('PO numbers mentioned, as written'),
  party_hint: z.string().nullable().describe('the sender\'s company if stated or implied'),
  reported_dates: z.array(z.object({ milestone: z.enum(['fabric', 'labdip', 'fit', 'pp', 'cut', 'inline', 'final', 'exf', 'etd', 'eta']), kind: z.enum(['expected', 'actual']), date: z.string().describe('YYYY-MM-DD'), po: z.string().nullable() })).describe('milestone dates the sender states as fact'),
  asks: z.array(z.string()).describe('what the sender wants from us, one line each'),
});

export async function processInbound(messageId: string) {
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('messages').select('*').eq('id', messageId).single();
  if (!m || m.processed_at) return { skipped: true };
  const T = m.tenant_id as string;
  const { data: parties } = await sb.from('parties').select('id, name, short, kind, lang, channel_pref, meta').eq('tenant_id', T);
  const { data: orders } = await sb.from('orders').select('id, po').eq('tenant_id', T);
  const names = (parties || []).map((p) => `${p.name}${p.short ? ` (${p.short})` : ''}`).join('; ');

  const { data: parsed, usage } = await extract(Parsed, `You read inbound messages for a garment merchandising team and extract facts. Known customers and suppliers: ${names || 'none'}. Known PO numbers: ${(orders || []).map((o) => o.po).join(', ') || 'none'}. Today is ${new Date().toISOString().slice(0, 10)}. Dates must be YYYY-MM-DD; only include dates the sender states, never ones they ask for.`, `From: ${m.sender_name || ''} <${m.from_addr || ''}>\nSubject: ${(m.raw as { subject?: string })?.subject || ''}\n\n${m.text}`);
  await recordUsage(T, { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: usage.cost });

  // link party and order
  let partyId = m.party_id as string | null;
  if (!partyId && parsed?.party_hint) { const q = parsed.party_hint.toLowerCase(); partyId = (parties || []).find((p) => p.name.toLowerCase().includes(q) || (p.short || '').toLowerCase() === q)?.id || null; }
  if (!partyId && m.from_addr) { const dom = String(m.from_addr).split('@')[1]?.split('.')[0]?.toLowerCase(); if (dom && dom.length > 3) partyId = (parties || []).find((p) => p.name.toLowerCase().replace(/\s+/g, '').includes(dom))?.id || null; }
  const po = parsed?.po_numbers.map((x) => x.replace(/^PO\s*#?/i, '').trim()).find((x) => (orders || []).some((o) => o.po === x)) || null;
  const orderId = po ? (orders || []).find((o) => o.po === po)!.id : null;
  await sb.from('messages').update({ lang: parsed?.lang || null, text_en: parsed?.text_en || null, stream: parsed?.stream || null, parsed: parsed || null, party_id: partyId, order_id: orderId, processed_at: new Date().toISOString() }).eq('id', messageId);
  // once the party and PO are known, the message belongs in that order file's thread for the party
  let threadId = m.thread_id as string | null;
  if (partyId) {
    const home = await findOrCreateThread(sb, T, partyId, orderId, (m.raw as { channel?: string })?.channel || null, (m.raw as { subject?: string })?.subject || null);
    if (home !== threadId) {
      await sb.from('messages').update({ thread_id: home }).eq('id', messageId);
      if (threadId) { const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId); if (!count) await sb.from('threads').delete().eq('id', threadId); }
      threadId = home;
    }
    await sb.from('threads').update({ party_id: partyId, order_id: orderId, last_message_at: new Date().toISOString() }).eq('id', threadId);
  }
  const history = threadId ? (await threadMessages(sb, threadId)).filter((x) => x.id !== messageId).slice(-8) : [];
  const party = (parties || []).find((p) => p.id === partyId);
  await sb.rpc('ledger_append', { p_tenant: T, p_channel: (m.raw as { channel?: string })?.channel || 'Inbound', p_actor: party?.name || m.sender_name || m.from_addr || 'Unknown sender', p_actor_user: null, p_counterparty: null, p_stream: parsed?.stream || null, p_order: orderId, p_what: `Inbound: ${(parsed?.text_en || m.text).slice(0, 140)}`, p_gate: 'Logged', p_gated: false, p_ref: { message_id: messageId } });

  // hand to the agent: capture dates, draft the reply
  const brief = `An inbound message arrived and was logged. Handle it:
1. If it states a milestone date as fact for a known PO, record it with set_milestone (expected for a promised date, actual for a completed step).
2. Queue one reply with queue_draft on stream "${parsed?.stream || 'General enquiries'}" to the sender${party ? ` (${party.name})` : ''}, in ${LANG_NAMES[parsed?.lang || 'en'] || 'their language'} with body_en, answering their asks from the record. If something needs a decision by a person (price, quantity, promised date, claim), say so in the draft's impact and do not promise it.
3. Reply here with two lines: what you recorded, and the draft ref.

${history.length ? `Earlier in this conversation (oldest first):\n${history.map((h) => `${h.received_at.slice(0, 10)} ${h.direction === 'in' ? (h.sender_name || 'them') : 'us'}: ${(h.text_en || h.text).slice(0, 400)}`).join('\n')}\n\n` : ''}Message from ${m.sender_name || m.from_addr || 'unknown'}${party ? ` at ${party.name}` : ''} via ${(m.raw as { channel?: string })?.channel || 'channel'}:
---
${m.text}
---
English rendering: ${parsed?.text_en || m.text}
Extracted: PO ${po || 'none matched'}; reported dates ${JSON.stringify(parsed?.reported_dates || [])}; asks ${JSON.stringify(parsed?.asks || [])}.`;
  const r = await runAgent({ tenantId: T, trigger: 'inbound', sourceMessageId: messageId, messages: [{ role: 'user', content: brief }] });
  return { messageId, partyId, orderId, stream: parsed?.stream, drafts: r.drafts, summary: r.text, error: r.error };
}
