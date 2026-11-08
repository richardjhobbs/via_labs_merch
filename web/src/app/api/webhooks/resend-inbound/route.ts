// Resend posts every email received on the account here (email.received). Only mail to a live VIA Merch
// forwarding address, sent from that member's own address, is fetched and handed to the inbound pipeline;
// everything else is acknowledged and dropped without being read or stored.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ingestInbound } from '@/lib/agents/inbound';
import { addrOf, allowedSenders, appOf, forwardConfigured, htmlToText, inboundDomain, liveSigningSecret, receivedEmail, verifySvix } from '@/lib/connectors/forward';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!forwardConfigured()) return NextResponse.json({ ok: false, reason: 'not configured' }, { status: 503 });
  const body = await req.text();
  // Resend sends svix-* headers or, on newer webhooks, the Standard Webhooks names webhook-*; same signature
  const h = (n: string) => req.headers.get(`svix-${n}`) || req.headers.get(`webhook-${n}`);
  const hdrs = { id: h('id'), ts: h('timestamp'), sig: h('signature') };
  // stored secret first; if it does not match, the secret Resend holds for this endpoint right now
  let sigOk = verifySvix(body, hdrs);
  if (!sigOk) { const live = await liveSigningSecret(`${req.nextUrl.origin}/api/webhooks/resend-inbound`); if (live) sigOk = verifySvix(body, hdrs, live); if (sigOk) console.warn('[resend-inbound] RESEND_WEBHOOK_SECRET does not match Resend; verified with the live secret'); }
  if (!sigOk) console.warn('[resend-inbound] signature refused', JSON.stringify({ svix: !!req.headers.get('svix-id'), std: !!req.headers.get('webhook-id'), age_s: Math.round(Date.now() / 1000 - Number(h('timestamp'))), sigs: (h('signature') || '').split(' ').map((x) => x.split(',')[0]), bytes: body.length, secret_len: (process.env.RESEND_WEBHOOK_SECRET || '').length }));
  if (!sigOk) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  let evt: { type?: string; data?: { email_id?: string; to?: string[]; cc?: string[]; from?: string; attachments?: { filename?: string; content_type?: string }[] } };
  try { evt = JSON.parse(body); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (evt.type !== 'email.received' || !evt.data?.email_id) return NextResponse.json({ ok: true, ignored: 'type' });

  const domain = inboundDomain();
  const rcpt = [...(evt.data.to || []), ...(evt.data.cc || [])].map(addrOf).find((a) => a.endsWith(`@${domain}`) && a.startsWith('fw-'));
  if (!rcpt) return NextResponse.json({ ok: true, ignored: 'not ours' });

  const sb = supabaseAdmin();
  const { data: ch } = await sb.from('channels').select('id, tenant_id, owner_user_id, account, status').eq('kind', 'email_inbound').eq('account', rcpt).maybeSingle();
  if (!ch || ch.status !== 'connected' || !ch.owner_user_id) return NextResponse.json({ ok: true, ignored: 'no live address' });

  const from = addrOf(evt.data.from || '');
  const allowed = await allowedSenders(sb, ch.tenant_id, ch.owner_user_id);
  if (!allowed.has(from)) {
    // someone else wrote to the address: record that it happened, never what it said
    await sb.rpc('ledger_append', { p_tenant: ch.tenant_id, p_channel: 'Forward', p_actor: 'Forwarding address', p_actor_user: null, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Mail to the forwarding address from an address that is not the member's own was ignored (${from.split('@')[1] || 'unknown domain'})`, p_gate: 'IGNORED', p_gated: true, p_ref: {} });
    return NextResponse.json({ ok: true, ignored: 'sender' });
  }

  let e: Awaited<ReturnType<typeof receivedEmail>>;
  try { e = await receivedEmail(evt.data.email_id); }
  catch (err) {
    // most often a sending-only RESEND_API_KEY: say so on the Connections card, and fail so Resend retries
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from('channels').update({ error: /401|403/.test(msg) ? 'The mail service key cannot read received mail. VIA Labs needs to switch it to full access.' : msg.slice(0, 300) }).eq('id', ch.id);
    return NextResponse.json({ error: 'could not read the message yet' }, { status: 503 });
  }
  const raw = (e.text && e.text.trim()) || (e.html ? htmlToText(e.html) : '');
  const subject = (e.subject || '').replace(/^(fwd?|fw|tr|wg|转发)\s*:\s*/i, '').trim() || null;
  const attachments = (e.attachments || evt.data.attachments || []).map((a) => ({ name: a.filename || 'file', mime: a.content_type || '' }));
  const app = appOf(raw, subject || '');
  const { data: m } = await sb.from('memberships').select('display_name').eq('tenant_id', ch.tenant_id).eq('user_id', ch.owner_user_id).maybeSingle();
  const who = m?.display_name || from;
  const text = `[Forwarded by ${who}${app ? ` from ${app}` : ' from a chat app'}. The original sender is named in the message below, not in the From line.]\n\n${raw.slice(0, 12_000) || '(no text)'}${attachments.length ? `\n\n[Attached: ${attachments.map((a) => a.name).join(', ')}]` : ''}`;
  try {
    await ingestInbound({ tenantId: ch.tenant_id, channelKind: app || 'forward', channelId: ch.id, from, senderName: `${who} (forwarded)`, partyId: null, subject, text, externalId: e.id, raw: { forward: { by: ch.owner_user_id, app }, attachments } });
  } catch (err) { if (!/duplicate key/i.test(err instanceof Error ? err.message : '')) throw err; }
  await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
  return NextResponse.json({ ok: true });
}
