// Approved replies waiting on a connected mailbox go out here, oldest first, from the mailbox the
// original came in on. Shared by Gmail and Microsoft 365.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReauthError, CHANNEL_COLS, type Channel, type Reply } from './mail';
import { sendReply as gmailReply } from './google';
import { sendReply as outlookReply } from './microsoft';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function sendPending(sb: Client, deadline: number) {
  const out = { sent: 0, failed: 0 };
  const { data: rows } = await sb.from('messages').select('id, tenant_id, channel_id, thread_id, order_id, stream, text, sender_name, raw').eq('direction', 'out').is('sent_at', null).not('channel_id', 'is', null).eq('raw->>send', 'pending').order('created_at').limit(5);
  for (const m of rows || []) {
    if (Date.now() > deadline - 5000) break;
    const raw = (m.raw || {}) as { reply?: Reply; draft_id?: string; attempts?: number };
    const { data: ch } = await sb.from('channels').select(CHANNEL_COLS).eq('id', m.channel_id).maybeSingle();
    const fail = async (why: string, final: boolean) => {
      const attempts = (raw.attempts || 0) + 1, give = final || attempts >= 3;
      await sb.from('messages').update({ raw: { ...raw, attempts, send: give ? 'failed' : 'pending', send_error: why.slice(0, 300) } }).eq('id', m.id);
      if (give) { out.failed++; await sb.rpc('ledger_append', { p_tenant: m.tenant_id, p_channel: 'Email', p_actor: ch?.account || 'Mailbox', p_actor_user: null, p_counterparty: raw.reply?.to || null, p_stream: m.stream, p_order: m.order_id, p_what: `Send failed: ${why.slice(0, 160)}`, p_gate: 'NOT SENT', p_gated: true, p_ref: { message_id: m.id, draft_id: raw.draft_id || null } }); }
    };
    if (!ch || !['email_gmail', 'email_m365'].includes(ch.kind)) { await fail('the mailbox is no longer connected', true); continue; }
    if (ch.status !== 'connected') { await fail(`the mailbox ${ch.account} needs signing in again`, false); continue; }
    if (!raw.reply?.to) { await fail('no address to reply to', true); continue; }
    try {
      const s = ch.kind === 'email_m365' ? await outlookReply(sb, ch as Channel, raw.reply, m.text) : await gmailReply(sb, ch as Channel, raw.reply, m.text);
      const at = new Date().toISOString();
      await sb.from('messages').update({ sent_at: at, external_id: s.id, from_addr: ch.account, to_addr: [raw.reply.to], raw: { ...raw, send: 'sent', sent: s } }).eq('id', m.id);
      if (raw.draft_id) await sb.from('drafts').update({ status: 'sent' }).eq('id', raw.draft_id);
      await sb.rpc('ledger_append', { p_tenant: m.tenant_id, p_channel: 'Email', p_actor: m.sender_name || ch.account, p_actor_user: null, p_counterparty: raw.reply.to, p_stream: m.stream, p_order: m.order_id, p_what: `Sent from ${ch.account} to ${raw.reply.to}: ${raw.reply.subject || '(no subject)'}`, p_gate: 'SENT', p_gated: true, p_ref: { message_id: m.id, draft_id: raw.draft_id || null } });
      out.sent++;
    } catch (e) {
      if (e instanceof ReauthError) await sb.from('channels').update({ status: 'reauth', error: e.message }).eq('id', ch.id);
      await fail(e instanceof Error ? e.message : String(e), false);
    }
  }
  return out;
}
