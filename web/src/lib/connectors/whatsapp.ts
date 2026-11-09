// WhatsApp Business (Meta Cloud API). The client owns the WhatsApp Business account and number; VIA connects
// to it. Pilot setup per client: an owner or manager enters the number's Phone number ID, a permanent
// (system user) access token and the Meta app secret on Connections; in their Meta app they point the
// WhatsApp webhook at /api/webhooks/whatsapp with the verify token VIA shows. Embedded Signup (one click)
// comes once VIA Labs is a Meta Tech Provider.
//
// A company number is the company's own channel: every inbound message is stored and linked to a party by
// the sender's phone where a contact has it. Replies go out only after approval, inside WhatsApp's 24-hour
// customer service window (outside it Meta needs an approved template, so the send fails and an alert says so).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from '@/lib/crypto';
import type { Channel, Reply } from './mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GRAPH = 'https://graph.facebook.com/v21.0';
export type WaAuth = { token: string; app_secret: string };
export type WaConfig = { connector: 'whatsapp'; display?: string; verified_name?: string; verify_token: string; waba_id?: string | null; connected_by?: string };

export const newVerifyToken = () => `via-${randomBytes(12).toString('hex')}`;

// Check the credentials before saving: the number's display name proves the token can use it.
export async function checkNumber(phoneNumberId: string, token: string) {
  const r = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Meta ${r.status}`);
  return { display: String(j.display_phone_number || ''), verified_name: String(j.verified_name || '') };
}

// X-Hub-Signature-256: sha256=HMAC(app secret, raw body)
export function verifyMeta(body: string, header: string | null, appSecret: string) {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  const want = createHmac('sha256', appSecret).update(body).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export const waAuth = (ch: Channel) => open<WaAuth>(ch.auth_enc);

type WaMsg = { from: string; id: string; timestamp: string; type: string; text?: { body: string }; image?: { caption?: string; mime_type?: string }; document?: { filename?: string; caption?: string }; audio?: { mime_type?: string }; video?: { caption?: string }; location?: { name?: string; address?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } };
export type WaInbound = { phone_number_id: string; from: string; name: string | null; id: string; text: string; attachments: { name: string; mime: string }[]; type: string };

// Flatten Meta's webhook body into the messages it carries (statuses and other changes are ignored).
export function inboundOf(payload: unknown): WaInbound[] {
  const out: WaInbound[] = [];
  const p = payload as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: WaMsg[] } }[] }[] };
  for (const e of p.entry || []) for (const c of e.changes || []) {
    const v = c.value; const pid = v?.metadata?.phone_number_id;
    if (!pid) continue;
    for (const m of v?.messages || []) {
      const name = v?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name || null;
      const caption = m.image?.caption || m.video?.caption || m.document?.caption || '';
      const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title
        || (m.location ? `(location) ${[m.location.name, m.location.address].filter(Boolean).join(', ')}` : '') || caption;
      const attachments = m.image ? [{ name: 'photo', mime: m.image.mime_type || 'image' }] : m.document ? [{ name: m.document.filename || 'document', mime: 'document' }] : m.audio ? [{ name: 'voice note', mime: m.audio.mime_type || 'audio' }] : m.video ? [{ name: 'video', mime: 'video' }] : [];
      out.push({ phone_number_id: pid, from: m.from, name, id: m.id, text, attachments, type: m.type });
    }
  }
  return out;
}

// Match the sender's number to a contact (contacts.phone, any formatting) and so to a party.
export async function partyByPhone(sb: Client, tenantId: string, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  const { data } = await sb.from('contacts').select('party_id, phone, parties!inner(archived_at)').eq('tenant_id', tenantId).not('phone', 'is', null).is('parties.archived_at', null);
  return (data || []).find((c) => String(c.phone).replace(/\D/g, '').endsWith(digits.slice(-9)))?.party_id as string | undefined || null;
}

export async function sendWhatsApp(_sb: Client, ch: Channel, r: Reply, body: string) {
  const a = waAuth(ch);
  if (!a?.token) throw new Error('the WhatsApp number has no access token');
  const res = await fetch(`${GRAPH}/${encodeURIComponent(ch.account || '')}/messages`, { method: 'POST', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: r.to, type: 'text', text: { body, preview_url: false }, ...(r.provider_id ? { context: { message_id: r.provider_id } } : {}) }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = j?.error?.code;
    // 131047: more than 24 hours since the customer last wrote; Meta requires an approved template
    throw new Error(code === 131047 ? 'more than 24 hours since they last wrote; WhatsApp only allows a template message now, so send this one from the phone' : j?.error?.message || `Meta ${res.status}`);
  }
  return { id: String(j?.messages?.[0]?.id || ''), threadId: r.to };
}
