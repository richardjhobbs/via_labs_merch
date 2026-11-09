// Meta WhatsApp Cloud API webhook for clients' own WhatsApp Business numbers.
// GET: Meta's subscription check (hub.verify_token must match a connected number's verify token).
// POST: messages to a connected number, signed with that client's Meta app secret, into the inbound pipeline.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ingestInbound } from '@/lib/agents/inbound';
import { CHANNEL_COLS, type Channel } from '@/lib/connectors/mail';
import { inboundOf, partyByPhone, verifyMeta, waAuth } from '@/lib/connectors/whatsapp';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get('hub.mode') !== 'subscribe' || !q.get('hub.verify_token')) return new NextResponse('bad request', { status: 400 });
  const { data } = await supabaseAdmin().from('channels').select('id').eq('kind', 'whatsapp').contains('config', { verify_token: q.get('hub.verify_token') }).limit(1).maybeSingle();
  return data ? new NextResponse(q.get('hub.challenge') || '', { status: 200 }) : new NextResponse('forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const items = inboundOf(payload);
  if (!items.length) return NextResponse.json({ ok: true, ignored: 'no messages' });   // delivery statuses and the like
  const sb = supabaseAdmin();
  const sig = req.headers.get('x-hub-signature-256');
  const verified = new Map<string, Channel | null>();
  let n = 0;
  for (const m of items) {
    if (!verified.has(m.phone_number_id)) {
      const { data } = await sb.from('channels').select(CHANNEL_COLS).eq('kind', 'whatsapp').eq('account', m.phone_number_id).eq('status', 'connected').limit(1).maybeSingle();
      const ch = data as Channel | null;
      verified.set(m.phone_number_id, ch && verifyMeta(body, sig, waAuth(ch)?.app_secret || '') ? ch : null);
    }
    const ch = verified.get(m.phone_number_id);
    if (!ch) continue;   // not a connected number, or not signed by its app
    const partyId = await partyByPhone(sb, ch.tenant_id, m.from);
    const text = m.text || (m.attachments.length ? `(${m.attachments.map((a) => a.name).join(', ')} with no text)` : `(${m.type} message)`);
    try {
      await ingestInbound({ tenantId: ch.tenant_id, channelKind: 'whatsapp', channelId: ch.id, from: `+${m.from}`, senderName: m.name, partyId, text, externalId: m.id, raw: { whatsapp: { from: m.from, id: m.id, phone_number_id: m.phone_number_id }, attachments: m.attachments } });
      n++;
    } catch (e) { if (!/duplicate key/i.test(e instanceof Error ? e.message : '')) throw e; }
    await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
  }
  return NextResponse.json({ ok: true, ingested: n });
}
