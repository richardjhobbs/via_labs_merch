// Inbound pipeline: a message from any channel becomes a record, is linked to a party and
// an order, classified into a stream, and handed to the agent, which captures any reported
// date and queues a reply at the stream's gate level.
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extract, recordUsage, LANG_NAMES } from '@/lib/llm';
import { runAgent } from './run';
import { findOrCreateThread, threadMessages } from '@/lib/threads';
import { latestBrief, briefForAgent, queueBrief } from './order-agent';
import { ALL_STREAMS, streamForTrack, type Track } from '@/lib/tracks';
import { fileAttachmentAsRecord } from '@/lib/connectors/attachments';
import { plmOf } from '@/lib/connectors/plm';

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
  stream: z.string().describe(`the closest of: ${ALL_STREAMS.join(', ')}`),
  track: z.enum(['production', 'development', 'unsure']).describe('production: about a placed PO (WIP, QC, shipping, claims, amendments to an order). development: about a style before a PO (brief, tech pack, spec, swatch, lab dip, strike-off, proto, fit, size set, sample round, costing a new style). unsure when neither is clear.'),
  po_numbers: z.array(z.string()).describe('PO numbers mentioned, as written'),
  style_codes: z.array(z.string()).describe('style numbers or codes mentioned, as written (not PO numbers)'),
  party_hint: z.string().nullable().describe('the sender\'s company if stated or implied'),
  reported_dates: z.array(z.object({ milestone: z.enum(['fabric', 'labdip', 'fit', 'pp', 'cut', 'inline', 'final', 'exf', 'etd', 'eta']), kind: z.enum(['expected', 'actual']), date: z.string().describe('YYYY-MM-DD'), po: z.string().nullable() })).describe('milestone dates the sender states as fact'),
  asks: z.array(z.string()).describe('what the sender wants from us, one line each'),
});

export async function processInbound(messageId: string) {
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('messages').select('*').eq('id', messageId).single();
  if (!m || m.processed_at) return { skipped: true };
  const T = m.tenant_id as string;
  const [{ data: parties }, { data: orders }, { data: styles }, { data: tn }] = await Promise.all([
    sb.from('parties').select('id, name, short, kind, lang, channel_pref, meta').eq('tenant_id', T),
    sb.from('orders').select('id, po, customer_id, factory_id, mill_id').eq('tenant_id', T),
    sb.from('styles').select('id, code, season, customer_id, status').eq('tenant_id', T).not('status', 'in', '("dropped")').order('created_at', { ascending: false }),
    sb.from('tenants').select('settings').eq('id', T).single(),
  ]);
  const devOn = !!(tn?.settings as { tracks?: { development?: boolean } } | null)?.tracks?.development;
  const names = (parties || []).map((p) => `${p.name}${p.short ? ` (${p.short})` : ''}`).join('; ');

  const { data: parsed, usage } = await extract(Parsed, `You read inbound messages for a garment merchandising team and extract facts. Known customers and suppliers: ${names || 'none'}. Known PO numbers: ${(orders || []).map((o) => o.po).join(', ') || 'none'}. Known style codes in development: ${(styles || []).slice(0, 80).map((x) => x.code).join(', ') || 'none'}. Today is ${new Date().toISOString().slice(0, 10)}. Dates must be YYYY-MM-DD; only include dates the sender states, never ones they ask for.`, `From: ${m.sender_name || ''} <${m.from_addr || ''}>\nSubject: ${(m.raw as { subject?: string })?.subject || ''}\n\n${m.text}`);
  await recordUsage(T, { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: usage.cost });

  // link party and order
  let partyId = m.party_id as string | null;
  if (!partyId && parsed?.party_hint) { const q = parsed.party_hint.toLowerCase(); partyId = (parties || []).find((p) => p.name.toLowerCase().includes(q) || (p.short || '').toLowerCase() === q)?.id || null; }
  if (!partyId && m.from_addr) { const dom = String(m.from_addr).split('@')[1]?.split('.')[0]?.toLowerCase(); if (dom && dom.length > 3) partyId = (parties || []).find((p) => p.name.toLowerCase().replace(/\s+/g, '').includes(dom))?.id || null; }
  // a PO number is unique per customer: when two customers share it, the sender's party decides, else no link
  const byPo = (x: string) => { const L = (orders || []).filter((o) => o.po === x); return L.length === 1 ? L[0] : L.find((o) => !!partyId && [o.customer_id, o.factory_id, o.mill_id].includes(partyId)) || null; };
  const po = parsed?.po_numbers.map((x) => x.replace(/^PO\s*#?/i, '').trim()).find((x) => !!byPo(x)) || null;
  const orderId = po ? byPo(po)!.id : null;
  // which track: a matched PO is production; a matched style with no PO is development; otherwise the model's
  // reading, then the sender's default, then production. Development only when the company runs that track.
  const styleHit = devOn ? (parsed?.style_codes || []).map((x) => x.trim().toLowerCase()).map((x) => (styles || []).find((st) => st.code.toLowerCase() === x && (!partyId || !st.customer_id || st.customer_id === partyId))).find(Boolean) || null : null;
  let track: Track = 'production';
  let unsure = false;
  if (orderId) track = 'production';
  else if (styleHit) track = 'development';
  else if (devOn && parsed?.track === 'development') track = 'development';
  else if (devOn && parsed?.track === 'unsure') {
    const { data: c } = m.from_addr ? await sb.from('contacts').select('track_default').eq('tenant_id', T).ilike('email', String(m.from_addr)).limit(1).maybeSingle() : { data: null };
    track = (c?.track_default as Track | null) || 'production'; unsure = true;
  }
  const styleId = styleHit?.id || null;
  // a PLM notification or an unknown sender on a known style: the style's customer is the party
  if (!partyId && styleHit?.customer_id) partyId = styleHit.customer_id;
  const stream = streamForTrack(parsed?.stream, track);
  await sb.from('messages').update({ lang: parsed?.lang || null, text_en: parsed?.text_en || null, stream, parsed: parsed ? { ...parsed, track_unsure: unsure } : null, party_id: partyId, order_id: orderId, style_id: styleId, track, processed_at: new Date().toISOString() }).eq('id', messageId);
  // once the party and PO (or style) are known, the message belongs in that file's thread for the party
  let threadId = m.thread_id as string | null;
  if (partyId) {
    const home = await findOrCreateThread(sb, T, partyId, orderId, (m.raw as { channel?: string })?.channel || null, (m.raw as { subject?: string })?.subject || null, { track, styleId: orderId ? null : styleId });
    if (home !== threadId) {
      await sb.from('messages').update({ thread_id: home }).eq('id', messageId);
      if (threadId) { const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId); if (!count) await sb.from('threads').delete().eq('id', threadId); }
      threadId = home;
    }
    await sb.from('threads').update({ party_id: partyId, order_id: orderId, style_id: orderId ? null : styleId, track, last_message_at: new Date().toISOString() }).eq('id', threadId);
  } else if (threadId) await sb.from('threads').update({ track, style_id: styleId, last_message_at: new Date().toISOString() }).eq('id', threadId);
  // the order agent's brief carries the order's history, so only the last few messages of the thread come along
  const hasBrief = !!orderId && !!(await sb.from('agent_memory').select('id').eq('order_id', orderId).limit(1).maybeSingle()).data;
  const history = threadId ? (await threadMessages(sb, threadId)).filter((x) => x.id !== messageId).slice(hasBrief ? -3 : -8) : [];
  const party = (parties || []).find((p) => p.id === partyId);
  // attachments on a development message with a known style become records (read in the background)
  const { data: atts } = await sb.from('attachments').select('id, tenant_id, message_id, storage_path, filename, mime, bytes, sha256, record_id').eq('message_id', messageId);
  const filed: string[] = [];
  if (track === 'development' && styleId) {
    const plm = plmOf(m.from_addr as string | null);
    for (const a of atts || []) { try { await fileAttachmentAsRecord(sb, a, styleId, { source: plm ? 'plm' : 'email', actor: plm || party?.name || m.sender_name || 'Inbound', sourceRef: plm ? `${plm} notification` : null }); filed.push(a.filename); } catch (e) { console.error('[inbound] file attachment', a.filename, e instanceof Error ? e.message : String(e)); } }
  }
  const attNote = (atts || []).length ? `\nAttachments: ${(atts || []).map((a) => a.filename).join(', ')}${filed.length ? ` (filed on the style as records, being read; a person confirms them)` : styleId ? '' : ' (not filed: no style matched; a person can file them from the conversation)'}.` : '';
  await sb.rpc('ledger_append', { p_tenant: T, p_channel: (m.raw as { channel?: string })?.channel || 'Inbound', p_actor: party?.name || m.sender_name || m.from_addr || 'Unknown sender', p_actor_user: null, p_counterparty: null, p_stream: stream, p_order: orderId, p_what: `Inbound${unsure ? ' (track unsure)' : ''}: ${(parsed?.text_en || m.text).slice(0, 140)}`, p_gate: 'Logged', p_gated: false, p_ref: { message_id: messageId }, p_track: track, p_style: styleId });

  // hand to the agent: capture dates, draft the reply; on production it reads the order agent's brief first
  const ob = orderId && track !== 'development' ? briefForAgent(await latestBrief(sb, orderId)) : null;
  const brief = track === 'development' ? `An inbound message arrived on the DEVELOPMENT track and was logged${styleHit ? ` against style ${styleHit.code}` : ''}. Handle it:
1. Read the style with get_style when a style is known; if a tech pack, brief, swatch, lab dip, strike-off or sample is mentioned, say what the record shows about it. Do not record any decision: approvals and rejections are a person's action.
2. Queue one reply with queue_draft on stream "${stream}"${styleHit ? ` with style "${styleHit.code}"` : ''} to the sender${party ? ` (${party.name})` : ''}, in ${LANG_NAMES[parsed?.lang || 'en'] || 'their language'} with body_en, answering their asks from the record. Price, a sample approval, a promised sample date and anything not on the record need a person: say so in the draft's impact and do not promise it.
3. Reply here with two lines: what you found on the record, and the draft ref.

${history.length ? `Earlier in this conversation (oldest first):\n${history.map((h) => `${h.received_at.slice(0, 10)} ${h.direction === 'in' ? (h.sender_name || 'them') : 'us'}: ${(h.text_en || h.text).slice(0, 400)}`).join('\n')}\n\n` : ''}Message from ${m.sender_name || m.from_addr || 'unknown'}${party ? ` at ${party.name}` : ''} via ${(m.raw as { channel?: string })?.channel || 'channel'}:
---
${m.text}
---
English rendering: ${parsed?.text_en || m.text}
Extracted: style ${styleHit?.code || (parsed?.style_codes || []).join(', ') || 'none matched'}; asks ${JSON.stringify(parsed?.asks || [])}.${attNote}` : `An inbound message arrived and was logged. Handle it:
1. If it states a milestone date as fact for a known PO, record it with set_milestone (expected for a promised date, actual for a completed step).
2. If it reports an ESG or compliance figure or confirmation for a stated period (energy, water, effluent, chemicals, waste, emissions, wages, accidents, audits, certificates), look it up with get_compliance and, if a matching open task exists, record it with record_compliance_value. A person checks it.
3. Queue one reply with queue_draft on stream "${stream}" to the sender${party ? ` (${party.name})` : ''}, in ${LANG_NAMES[parsed?.lang || 'en'] || 'their language'} with body_en, answering their asks from the record. If something needs a decision by a person (price, quantity, promised date, claim), say so in the draft's impact and do not promise it.
4. Reply here with two lines: what you recorded, and the draft ref.

${history.length ? `Earlier in this conversation (oldest first):\n${history.map((h) => `${h.received_at.slice(0, 10)} ${h.direction === 'in' ? (h.sender_name || 'them') : 'us'}: ${(h.text_en || h.text).slice(0, 400)}`).join('\n')}\n\n` : ''}Message from ${m.sender_name || m.from_addr || 'unknown'}${party ? ` at ${party.name}` : ''} via ${(m.raw as { channel?: string })?.channel || 'channel'}:
---
${m.text}
---
English rendering: ${parsed?.text_en || m.text}
Extracted: PO ${po || 'none matched'}; reported dates ${JSON.stringify(parsed?.reported_dates || [])}; asks ${JSON.stringify(parsed?.asks || [])}.${attNote}${ob ? `\n\nThe order agent's brief for PO ${po} (version ${ob.version}, ${ob.updated}): ${JSON.stringify(ob)}\nIt is the current record of the order: answer from it, and call get_order or get_messages only for what it lacks.` : ''}`;
  const r = await runAgent({ tenantId: T, trigger: 'inbound', track, sourceMessageId: messageId, messages: [{ role: 'user', content: brief }] });
  if (track !== 'development') await queueBrief(sb, T, orderId, 'message');
  return { messageId, partyId, orderId, styleId, track, stream, drafts: r.drafts, summary: r.text, error: r.error };
}
