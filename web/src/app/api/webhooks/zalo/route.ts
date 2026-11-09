// Zalo OA webhook (events for every OA that authorised VIA's Zalo app). Only messages a user sends to a
// connected OA are taken; the signature is checked with VIA's OA secret key before anything is read.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ingestInbound } from '@/lib/agents/inbound';
import { CHANNEL_COLS, type Channel } from '@/lib/connectors/mail';
import { userName, verifyZalo, zaloConfigured, zaloToken } from '@/lib/connectors/zalo';

export const maxDuration = 30;

type ZEvent = { app_id?: string; event_name?: string; timestamp?: string | number; sender?: { id?: string }; recipient?: { id?: string }; message?: { msg_id?: string; text?: string; attachments?: { type?: string; payload?: { url?: string; name?: string; description?: string } }[] } };

export async function POST(req: NextRequest) {
  if (!zaloConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const body = await req.text();
  let e: ZEvent;
  try { e = JSON.parse(body); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (String(e.app_id) !== process.env.ZALO_APP_ID || !verifyZalo(body, req.headers.get('x-zevent-signature'), String(e.app_id), String(e.timestamp ?? ''))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  if (!e.event_name?.startsWith('user_send_') || !e.sender?.id || !e.recipient?.id) return NextResponse.json({ ok: true, ignored: e.event_name });
  const sb = supabaseAdmin();
  const { data } = await sb.from('channels').select(CHANNEL_COLS).eq('kind', 'zalo').eq('account', String(e.recipient.id)).eq('status', 'connected').limit(1).maybeSingle();
  const ch = data as Channel | null;
  if (!ch) return NextResponse.json({ ok: true, ignored: 'oa not connected' });
  const att = (e.message?.attachments || []).map((a) => ({ name: a.payload?.name || a.type || 'file', mime: a.type || '' }));
  const text = e.message?.text || a2t(e.message?.attachments) || `(${e.event_name.replace('user_send_', '')} with no text)`;
  // a contact can carry the Zalo user id in chat_ids.zalo; otherwise the agent works out the party from the text
  const { data: contact } = await sb.from('contacts').select('party_id').eq('tenant_id', ch.tenant_id).eq('chat_ids->>zalo', String(e.sender.id)).limit(1).maybeSingle();
  let name: string | null = null;
  try { name = await userName(await zaloToken(sb, ch), String(e.sender.id)); } catch { /* the message still goes in */ }
  try {
    await ingestInbound({ tenantId: ch.tenant_id, channelKind: 'zalo', channelId: ch.id, from: `zalo:${e.sender.id}`, senderName: name, partyId: contact?.party_id || null, text, externalId: e.message?.msg_id || `${e.sender.id}:${e.timestamp}`, raw: { zalo: { user_id: String(e.sender.id), msg_id: e.message?.msg_id || null, oa_id: String(e.recipient.id) }, attachments: att } });
  } catch (err) { if (!/duplicate key/i.test(err instanceof Error ? err.message : '')) throw err; }
  await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
  return NextResponse.json({ ok: true });
}

const a2t = (a?: ZEvent['message'] extends infer M ? M extends { attachments?: infer A } ? A : never : never) => (a || []).map((x) => x.payload?.description || '').filter(Boolean).join('\n');
