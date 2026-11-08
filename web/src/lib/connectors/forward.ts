// Forwarding address: the route in for chats that have no API for personal accounts (Zalo, WeChat,
// WhatsApp on a personal phone, Line, Telegram, SMS). Each member gets their own address
// fw-<token>@<MERCH_INBOUND_DOMAIN>; whatever they forward to it from their phone (share to email)
// goes through the same inbound pipeline as a connected mailbox. Stored as a channel of kind
// email_inbound with the address as its account, owned by the member.
//
// Receiving runs on Resend: the domain's MX points at Resend, and Resend posts email.received to
// /api/webhooks/resend-inbound, signed with RESEND_WEBHOOK_SECRET. Resend delivers every received
// email of the account to every subscribed endpoint, so the handler ignores, without fetching or storing,
// anything not addressed to a live forwarding address, and accepts mail only from the member's own
// sign-in email or one of their connected mailboxes.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const inboundDomain = () => (process.env.MERCH_INBOUND_DOMAIN || '').toLowerCase().trim();
export function forwardConfigured() { return !!process.env.RESEND_API_KEY && !!process.env.RESEND_WEBHOOK_SECRET && !!inboundDomain(); }

// 12 characters from an alphabet without look-alikes, so the address can be read out or typed
export function newForwardAddress() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = randomBytes(12);
  return `fw-${Array.from(b, (x) => A[x % A.length]).join('')}@${inboundDomain()}`;
}

// Svix signature check (Resend webhooks): HMAC-SHA256 of "id.timestamp.body" with the base64 secret after "whsec_".
export function verifySvix(body: string, h: { id: string | null; ts: string | null; sig: string | null }, secretOverride?: string | null) {
  const secret = (secretOverride ?? process.env.RESEND_WEBHOOK_SECRET ?? '').trim().replace(/^["']|["']$/g, '');
  if (!secret || !h.id || !h.ts || !h.sig) return false;
  // Resend replays keep the original signature and timestamp, so allow a day; each email id is stored once
  if (Math.abs(Date.now() / 1000 - Number(h.ts)) > 86_400) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');   // same scheme for svix-* and the Standard Webhooks webhook-* headers
  const want = createHmac('sha256', key).update(`${h.id}.${h.ts}.${body}`).digest();
  return h.sig.split(' ').some((part) => {
    const [v, s] = part.split(',');
    if (v !== 'v1' || !s) return false;
    const got = Buffer.from(s, 'base64');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export async function receivedEmail(id: string) {
  const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!r.ok) throw new Error(`Resend receiving ${r.status}`);
  return r.json() as Promise<{ id: string; from: string; to: string[]; subject?: string | null; text?: string | null; html?: string | null; created_at?: string; attachments?: { id: string; filename: string; content_type?: string; size?: number }[] }>;
}

export const addrOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] || v).trim().toLowerCase();

export function htmlToText(html: string) {
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

// Which chat app a forward came from, when the share text shows it; only used to label the message.
export function appOf(text: string, subject: string) {
  const s = `${subject}\n${text}`.toLowerCase();
  return /zalo/.test(s) ? 'zalo' : /wechat|微信/.test(s) ? 'wechat' : /whatsapp/.test(s) ? 'whatsapp' : /\bline\b/.test(s) ? 'line' : /telegram/.test(s) ? 'telegram' : null;
}

// The addresses a member may forward from: their sign-in email and their connected mailboxes.
export async function allowedSenders(sb: Client, tenantId: string, userId: string) {
  const [{ data: u }, { data: boxes }] = await Promise.all([
    sb.auth.admin.getUserById(userId),
    sb.from('channels').select('account').eq('tenant_id', tenantId).eq('owner_user_id', userId).in('kind', ['email_gmail', 'email_m365']).eq('status', 'connected'),
  ]);
  return new Set([u?.user?.email, ...(boxes || []).map((b) => b.account)].filter(Boolean).map((x) => String(x).toLowerCase()));
}

// The signing secret as Resend holds it for this endpoint, read with the full-access key. Used when the stored
// RESEND_WEBHOOK_SECRET does not match (mistyped, or the secret was rotated), and cached for the instance.
let liveSecret: { value: string | null; at: number } | null = null;
export async function liveSigningSecret(endpoint: string) {
  if (liveSecret && Date.now() - liveSecret.at < 10 * 60_000) return liveSecret.value;
  try {
    const r = await fetch('https://api.resend.com/webhooks', { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    const j = await r.json() as { data?: { id: string; endpoint: string }[] };
    const mine = (j.data || []).find((w) => w.endpoint === endpoint);
    let value: string | null = null;
    if (mine) {
      const d = await (await fetch(`https://api.resend.com/webhooks/${mine.id}`, { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` } })).json() as { signing_secret?: string; secret?: string };
      value = d.signing_secret || d.secret || null;
    }
    liveSecret = { value, at: Date.now() };
    return value;
  } catch { return null; }
}
