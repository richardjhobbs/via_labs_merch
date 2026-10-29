// Conversations: one thread per party and order. Messages in and out hang off it, and the agent
// keeps a short "where we are" summary on the thread so nobody has to read the whole chain.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { anthropic, SMALL_MODEL, costOf, recordUsage, LANG_NAMES } from '@/lib/llm';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function findOrCreateThread(sb: Client, tenantId: string, partyId: string | null, orderId: string | null, kind: string | null, subject: string | null) {
  if (partyId) {
    let q = sb.from('threads').select('id').eq('tenant_id', tenantId).eq('party_id', partyId).order('last_message_at', { ascending: false }).limit(1);
    q = orderId ? q.eq('order_id', orderId) : q.is('order_id', null);
    const { data } = await q.maybeSingle();
    if (data) return data.id as string;
  }
  const { data: t, error } = await sb.from('threads').insert({ tenant_id: tenantId, party_id: partyId, order_id: orderId, kind, subject, last_message_at: new Date().toISOString() }).select('id').single();
  if (error || !t) throw new Error(error?.message || 'thread failed');
  return t.id as string;
}

export type ThreadMsg = { id: string; direction: 'in' | 'out'; sender_name: string | null; from_addr: string | null; lang: string | null; text: string; text_en: string | null; stream: string | null; received_at: string; sent_at: string | null };

export async function threadMessages(sb: Client, threadId: string): Promise<ThreadMsg[]> {
  const { data } = await sb.from('messages').select('id, direction, sender_name, from_addr, lang, text, text_en, stream, received_at, sent_at').eq('thread_id', threadId).order('received_at');
  return (data || []) as ThreadMsg[];
}

// The agent's summary of a thread, cached until the message count changes. Haiku, a few hundred tokens.
export async function threadSummary(tenantId: string, threadId: string, opts: { force?: boolean } = {}): Promise<{ summary: string | null; at: string | null; fresh: boolean }> {
  const sb = supabaseAdmin();
  const { data: th } = await sb.from('threads').select('id, summary, summary_at, summary_count, party_id, order_id, parties(name, kind, lang), orders(po, style, description)').eq('id', threadId).eq('tenant_id', tenantId).maybeSingle();
  if (!th) return { summary: null, at: null, fresh: false };
  const msgs = await threadMessages(sb, threadId);
  if (!msgs.length) return { summary: null, at: null, fresh: false };
  if (!opts.force && th.summary && th.summary_count === msgs.length) return { summary: th.summary, at: th.summary_at, fresh: false };
  if (!process.env.ANTHROPIC_API_KEY) return { summary: th.summary, at: th.summary_at, fresh: false };
  const party = th.parties as unknown as { name: string; kind: string; lang: string } | null, order = th.orders as unknown as { po: string; style: string; description: string } | null;
  const transcript = msgs.map((m) => `${m.received_at.slice(0, 10)} ${m.direction === 'in' ? `${m.sender_name || party?.name || 'them'} → us` : `us (${m.sender_name || 'merchandiser'}) → ${party?.name || 'them'}`}${m.sent_at === null && m.direction === 'out' ? ' [approved, not yet sent]' : ''}:\n${m.text_en || m.text}`).join('\n\n');
  const r = await anthropic().messages.create({ model: SMALL_MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: `You summarise a merchandising conversation for the merchandiser who owns it. Write 3 to 5 short lines, plain English, no headings, no markdown: (1) where things stand now, (2) what they owe us and by when, (3) what we owe them, (4) the next date that matters, (5) any risk or disagreement. Use dates and PO numbers exactly as given. Never invent.`, messages: [{ role: 'user', content: `Party: ${party?.name || 'unknown'} (${party?.kind || ''}, writes in ${LANG_NAMES[party?.lang || 'en'] || party?.lang}). ${order ? `PO ${order.po} ${order.style} ${order.description}.` : 'No single PO.'} Today ${new Date().toISOString().slice(0, 10)}.\n\n${transcript}` }] });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  await recordUsage(tenantId, { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens, cost: costOf(SMALL_MODEL, r.usage.input_tokens, r.usage.output_tokens) });
  if (!text) return { summary: th.summary, at: th.summary_at, fresh: false };
  const at = new Date().toISOString();
  await sb.from('threads').update({ summary: text, summary_at: at, summary_count: msgs.length }).eq('id', threadId);
  return { summary: text, at, fresh: true };
}

// An approved draft becomes an outbound message on the thread (sent when a channel is connected).
export async function recordOutbound(tenantId: string, draft: { id: string; body: string; body_en: string | null; lang: string | null; stream: string; party_id: string | null; order_id: string | null; source_message_id: string | null }, who: string) {
  const sb = supabaseAdmin();
  let threadId: string | null = null, kind: string | null = null;
  if (draft.source_message_id) { const { data: src } = await sb.from('messages').select('thread_id, raw').eq('id', draft.source_message_id).maybeSingle(); threadId = src?.thread_id || null; kind = (src?.raw as { channel?: string })?.channel || null; }
  if (!threadId) threadId = await findOrCreateThread(sb, tenantId, draft.party_id, draft.order_id, kind, null);
  const { data: m } = await sb.from('messages').insert({ tenant_id: tenantId, thread_id: threadId, direction: 'out', party_id: draft.party_id, order_id: draft.order_id, sender_name: who, lang: draft.lang, text: draft.body, text_en: draft.body_en || (draft.lang === 'en' || !draft.lang ? draft.body : null), stream: draft.stream, sent_at: null, raw: { draft_id: draft.id } }).select('id').single();
  await sb.from('threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);
  if (m) await sb.from('drafts').update({ sent_message_id: m.id }).eq('id', draft.id);
  await recordUsage(tenantId, { messagesOut: 1 });
  return { threadId, messageId: m?.id || null };
}

// Every thread on a PO with its messages and the contact roles: the order file, for screens and the agent.
export async function orderFile(tenantId: string, orderId: string) {
  const sb = supabaseAdmin();
  const [{ data: threads }, { data: msgs }] = await Promise.all([
    sb.from('threads').select('id, subject, kind, party_id, summary, last_message_at, parties(name, kind, lang)').eq('tenant_id', tenantId).eq('order_id', orderId).order('last_message_at', { ascending: false }),
    sb.from('messages').select('id, thread_id, direction, sender_name, lang, text, text_en, stream, received_at, sent_at, contacts(role)').eq('tenant_id', tenantId).eq('order_id', orderId).order('received_at'),
  ]);
  return (threads || []).map((th) => ({ id: th.id, subject: th.subject, channel: th.kind, party: th.parties as unknown as { name: string; kind: string; lang: string } | null, summary: th.summary, messages: (msgs || []).filter((m) => m.thread_id === th.id).map((m) => ({ at: m.received_at.slice(0, 16).replace('T', ' '), from: m.direction === 'in' ? `${m.sender_name || ''}${(m.contacts as unknown as { role: string } | null)?.role ? ` (${(m.contacts as unknown as { role: string }).role})` : ''}` : `us (${m.sender_name || 'merchandiser'})`, direction: m.direction, text: m.text_en || m.text, stream: m.stream, pending: m.direction === 'out' && m.sent_at === null })) }));
}

// "Where this order stands" across every party on it. Cached in orders.meta until the message count changes.
export async function orderSummary(tenantId: string, orderId: string, opts: { force?: boolean } = {}): Promise<{ summary: string | null; at: string | null }> {
  const sb = supabaseAdmin();
  const { data: o } = await sb.from('orders').select('po, style, description, qty, meta, customer:parties!orders_customer_id_fkey(name), factory:parties!orders_factory_id_fkey(name)').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
  if (!o) return { summary: null, at: null };
  const file = await orderFile(tenantId, orderId);
  const n = file.reduce((a, t) => a + t.messages.length, 0);
  const cached = (o.meta as { summary?: { text: string; at: string; count: number } })?.summary;
  if (!n) return { summary: null, at: null };
  if (!opts.force && cached && cached.count === n) return { summary: cached.text, at: cached.at };
  if (!process.env.ANTHROPIC_API_KEY) return { summary: cached?.text || null, at: cached?.at || null };
  const transcript = file.map((t) => `## ${t.party?.name || '?'} (${t.party?.kind || ''}) — ${t.subject || 'conversation'} via ${t.channel || '?'}\n` + t.messages.map((m) => `${m.at} ${m.from}${m.pending ? ' [approved, not yet sent]' : ''}: ${m.text}`).join('\n')).join('\n\n');
  const cust = (o.customer as unknown as { name: string } | null)?.name, fac = (o.factory as unknown as { name: string } | null)?.name;
  const r = await anthropic().messages.create({ model: SMALL_MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: `You brief a merchandiser on one purchase order from its full communication file: factory, mill, forwarder, lab, and each function at the customer (design, buying, logistics, compliance). Write plain English, no markdown, no headings. First a two-sentence status. Then one line per party that matters, in the form "Party: what they owe or what we owe, by when". Finish with "Next: " and the single most important action and its date. Use dates and PO numbers exactly as given. Never invent.`, messages: [{ role: 'user', content: `PO ${o.po} ${o.style} ${o.description}, ${o.qty} pcs, customer ${cust}, factory ${fac}. Today ${new Date().toISOString().slice(0, 10)}.\n\n${transcript}` }] });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  await recordUsage(tenantId, { tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens, cost: costOf(SMALL_MODEL, r.usage.input_tokens, r.usage.output_tokens) });
  if (!text) return { summary: cached?.text || null, at: cached?.at || null };
  const at = new Date().toISOString();
  await sb.from('orders').update({ meta: { ...((o.meta as object) || {}), summary: { text, at, count: n } } }).eq('id', orderId);
  return { summary: text, at };
}
