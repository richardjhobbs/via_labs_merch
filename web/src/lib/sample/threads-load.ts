// Loads the sample conversations into a company (admin console action). Idempotent: skips when
// sample threads already exist. Re-parents any inbound sample messages into the matching file.
import { supabaseAdmin } from '@/lib/supabase/server';
import { isoOf, today } from '@/lib/core/path';
import { SAMPLE_THREADS, SAMPLE_EXTRA_PARTIES, SAMPLE_CONTACTS } from './threads';

export async function loadSampleThreads(tenantId: string, byEmail: string) {
  const sb = supabaseAdmin();
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).contains('raw', { sample_thread: true });
  if (count) return { ok: false, error: 'Sample conversations are already loaded.' };
  const T = today();
  const { data: parties0 } = await sb.from('parties').select('id, name, lang, meta').eq('tenant_id', tenantId);
  const parties = [...(parties0 || [])];
  for (const x of SAMPLE_EXTRA_PARTIES) {
    if (parties.some((p) => (p.meta as { code?: string })?.code === x.code)) continue;
    const { data: p } = await sb.from('parties').insert({ tenant_id: tenantId, kind: x.kind, name: x.name, short: x.short, country: x.country, lang: x.lang, channel_pref: x.channel, policy: {}, score: {}, meta: { code: x.code, sample: true } }).select('id, name, lang, meta').single();
    if (p) { parties.push(p); await sb.from('contacts').insert({ tenant_id: tenantId, party_id: p.id, name: x.contact, role: x.role, lang: x.lang, is_primary: true }); }
  }
  const idOf = (code: string) => parties.find((p) => (p.meta as { code?: string })?.code === code)?.id || null;
  // customer-side contacts with roles
  for (const [code, list] of Object.entries(SAMPLE_CONTACTS)) {
    const pid = idOf(code); if (!pid) continue;
    const { data: existing } = await sb.from('contacts').select('name').eq('party_id', pid);
    const have = new Set((existing || []).map((c) => c.name));
    const rows = list.filter((c) => !have.has(c.name)).map((c) => ({ tenant_id: tenantId, party_id: pid, name: c.name, role: c.role, email: c.email, lang: code === 'CV' ? 'es' : 'en', is_primary: false }));
    if (rows.length) await sb.from('contacts').insert(rows);
  }
  const { data: contacts } = await sb.from('contacts').select('id, party_id, name').eq('tenant_id', tenantId);
  const { data: orders } = await sb.from('orders').select('id, po').eq('tenant_id', tenantId);

  let threads = 0, messages = 0;
  for (const th of SAMPLE_THREADS) {
    const partyId = idOf(th.party), orderId = orders?.find((o) => o.po === th.po)?.id;
    if (!partyId || !orderId) continue;
    const last = th.msgs.reduce((a, m) => Math.max(a, m.d), -999);
    const { data: t } = await sb.from('threads').insert({ tenant_id: tenantId, party_id: partyId, order_id: orderId, kind: th.kind, subject: th.subject, last_message_at: new Date((T + last) * 864e5 + 9 * 3600e3).toISOString() }).select('id').single();
    if (!t) continue; threads++;
    const rows = th.msgs.map((m, i) => ({ tenant_id: tenantId, thread_id: t.id, direction: m.dir, party_id: partyId, order_id: orderId, contact_id: m.dir === 'in' ? contacts?.find((c) => c.party_id === partyId && c.name === m.from)?.id || null : null, sender_name: m.from, from_addr: m.dir === 'out' ? 'merch@meridian.example' : null, lang: m.dir === 'out' && m.en ? th.lang : m.dir === 'in' ? th.lang : 'en', text: m.text, text_en: m.en || m.text, stream: m.stream || null, received_at: new Date((T + m.d) * 864e5 + (9 + i) * 3600e3).toISOString(), sent_at: m.dir === 'out' ? new Date((T + m.d) * 864e5 + (9 + i) * 3600e3).toISOString() : null, processed_at: new Date((T + m.d) * 864e5 + (9 + i) * 3600e3 + 60e3).toISOString(), raw: { channel: th.kind, sample_thread: true } }));
    const { error } = await sb.from('messages').insert(rows);
    if (!error) messages += rows.length;
  }
  // inbound sample messages that arrived on their own single-message threads join the file
  const { data: loose } = await sb.from('messages').select('id, thread_id, party_id, order_id').eq('tenant_id', tenantId).contains('raw', { sample: true });
  for (const m of loose || []) {
    if (!m.party_id || !m.order_id) continue;
    let q = sb.from('threads').select('id').eq('tenant_id', tenantId).eq('party_id', m.party_id).eq('order_id', m.order_id).order('last_message_at', { ascending: false }).limit(1);
    if (m.thread_id) q = q.neq('id', m.thread_id);
    const { data: home } = await q.maybeSingle();
    if (home) { await sb.from('messages').update({ thread_id: home.id }).eq('id', m.id); await sb.from('threads').update({ last_message_at: new Date().toISOString() }).eq('id', home.id); if (m.thread_id) await sb.from('threads').delete().eq('id', m.thread_id); }
  }
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${byEmail})`, p_actor_user: null, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Sample conversations loaded: ${threads} threads, ${messages} messages`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  return { ok: true, threads, messages, day: isoOf(T) };
}
