// Gmail connector: OAuth sign-in, the minute sync and sending approved replies.
// Runtime half of the 'gmail' manifest in catalog.ts.
//
// - A merchandiser connects their own mailbox (merch.channels, kind email_gmail, owner_user_id).
// - Only mail that arrives after connecting is read (no historic import), and only from known
//   customers and suppliers (contact emails and their company domains) or under one chosen label.
//   Anything else is never fetched in full and never stored.
// - A reply goes out only after a person approved it, or the stream's gate approved it (L2+ uncapped),
//   from the mailbox the original arrived in, threaded under it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { seal, open, hasTokenKey } from '@/lib/crypto';
import { ingestInbound } from '@/lib/agents/inbound';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailConfig = { connector: 'gmail'; history_id?: string; filter?: 'known' | 'label'; label?: string | null; label_id?: string | null; connected_by?: string };
type Auth = { refresh_token: string; access_token?: string; expires_at?: number };
export type Channel = { id: string; tenant_id: string; kind: string; status: string; account: string | null; owner_user_id: string | null; auth_enc: string | null; config: GmailConfig; last_sync_at: string | null };

export class ReauthError extends Error {}

export function googleConfigured() { return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && hasTokenKey(); }

export function authUrl(o: { state: string; challenge: string; redirectUri: string; loginHint?: string }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: o.redirectUri, response_type: 'code', scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state: o.state, code_challenge: o.challenge, code_challenge_method: 'S256', ...(o.loginHint ? { login_hint: o.loginHint } : {}) }).toString();
  return u.toString();
}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (j.error === 'invalid_grant') throw new ReauthError(j.error_description || 'invalid_grant'); throw new Error(`Google token: ${j.error || r.status} ${j.error_description || ''}`.trim()); }
  return j as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
}

export async function revoke(stored: string | null) {
  const a = open<Auth>(stored);
  if (a?.refresh_token) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: a.refresh_token }) }).catch(() => null);
}

export function sealAuth(t: { refresh_token: string; access_token?: string; expires_in?: number }) {
  return seal({ refresh_token: t.refresh_token, access_token: t.access_token, expires_at: t.expires_in ? Date.now() + (t.expires_in - 60) * 1000 : 0 } satisfies Auth);
}

// A valid access token for the channel, refreshed and re-sealed when it has expired.
async function accessToken(sb: Client, ch: Channel) {
  const a = open<Auth>(ch.auth_enc);
  if (!a?.refresh_token) throw new ReauthError('no token stored');
  if (a.access_token && (a.expires_at || 0) > Date.now()) return a.access_token;
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: a.refresh_token });
  const enc = sealAuth({ refresh_token: t.refresh_token || a.refresh_token, access_token: t.access_token, expires_in: t.expires_in });
  await sb.from('channels').update({ auth_enc: enc }).eq('id', ch.id);
  ch.auth_enc = enc;
  return t.access_token;
}

export async function gmail<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ReauthError('Gmail refused the token');
  if (!r.ok) { const e = new Error(`Gmail ${r.status}: ${j?.error?.message || r.statusText}`) as Error & { status?: number }; e.status = r.status; throw e; }
  return j as T;
}

export async function profile(token: string) { return gmail<{ emailAddress: string; historyId: string }>(token, '/profile'); }

export async function findLabelId(sb: Client, ch: Channel, name: string) {
  const token = await accessToken(sb, ch);
  const { labels } = await gmail<{ labels: { id: string; name: string }[] }>(token, '/labels');
  return (labels || []).find((l) => l.name.toLowerCase() === name.trim().toLowerCase())?.id || null;
}

// ------------------------------------------------------------------ inbound

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'qq.com', '163.com', '126.com', 'sina.com', 'yeah.net', 'foxmail.com', 'aliyun.com', 'naver.com', 'yandex.com', 'gmx.de', 'web.de', 'mail.ru', 'rediffmail.com']);

type Header = { name: string; value: string };
type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: Header[] };
type GMsg = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: Part };

const hdr = (p: Part | undefined, n: string) => p?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
const addrOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] || v).trim().toLowerCase();
const nameOf = (v: string) => v.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || null;
const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

export function bodyText(p: Part | undefined): string {
  if (!p) return '';
  const walk = (x: Part, mime: string): string | null => {
    if (x.mimeType === mime && x.body?.data && !x.filename) return b64(x.body.data);
    for (const c of x.parts || []) { const r = walk(c, mime); if (r) return r; }
    return null;
  };
  const plain = walk(p, 'text/plain');
  if (plain) return plain;
  const html = walk(p, 'text/html');
  if (!html) return '';
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

// Keep the new part of a reply: cut at the quoted chain.
export function newPart(text: string) {
  const re = /^(On .{4,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+|发件人[:：].+|_{10,})\s*$/m;
  const m = text.match(re);
  const cut = m && m.index !== undefined && m.index > 40 ? text.slice(0, m.index) : text;
  return cut.replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12_000);
}

function attachmentsOf(p: Part | undefined, out: { name: string; mime: string; bytes: number }[] = []) {
  if (!p) return out;
  if (p.filename && p.body?.attachmentId) out.push({ name: p.filename, mime: p.mimeType || '', bytes: p.body.size || 0 });
  for (const c of p.parts || []) attachmentsOf(c, out);
  return out;
}

async function knownSenders(sb: Client, tenantId: string) {
  const { data } = await sb.from('contacts').select('id, party_id, email').eq('tenant_id', tenantId).not('email', 'is', null);
  const byEmail = new Map<string, { party_id: string; contact_id: string }>();
  const byDomain = new Map<string, Set<string>>();
  for (const c of data || []) {
    const e = String(c.email).trim().toLowerCase(); if (!e.includes('@')) continue;
    byEmail.set(e, { party_id: c.party_id, contact_id: c.id });
    const d = e.split('@')[1]; if (!FREE_MAIL.has(d)) { if (!byDomain.has(d)) byDomain.set(d, new Set()); byDomain.get(d)!.add(c.party_id); }
  }
  return (addr: string): { party_id: string | null; known: boolean } => {
    const hit = byEmail.get(addr); if (hit) return { party_id: hit.party_id, known: true };
    const parties = byDomain.get(addr.split('@')[1] || '');
    if (parties) return { party_id: parties.size === 1 ? [...parties][0] : null, known: true };
    return { party_id: null, known: false };
  };
}

// One pass over a mailbox: new messages since the stored history id, filtered, into the inbound pipeline.
export async function syncGmail(sb: Client, ch: Channel, deadline: number) {
  const out = { fetched: 0, ingested: 0, skipped: 0 };
  try {
    const token = await accessToken(sb, ch);
    const cfg = ch.config || ({ connector: 'gmail' } as GmailConfig);
    if (!cfg.history_id) { const p = await profile(token); await saveConfig(sb, ch, { history_id: p.historyId }); return out; }
    const labelId = cfg.filter === 'label' && cfg.label_id ? cfg.label_id : 'INBOX';

    // collect new message ids in history order, up to a cap
    type H = { id: string; messagesAdded?: { message: { id: string; labelIds?: string[] } }[] };
    const ids: { id: string; hid: string }[] = [];
    let pageToken: string | undefined, latest = cfg.history_id, complete = true;
    try {
      do {
        const q = new URLSearchParams({ startHistoryId: cfg.history_id, historyTypes: 'messageAdded', labelId, maxResults: '100', ...(pageToken ? { pageToken } : {}) });
        const r = await gmail<{ history?: H[]; historyId: string; nextPageToken?: string }>(token, `/history?${q}`);
        for (const h of r.history || []) for (const a of h.messagesAdded || []) if (!ids.some((x) => x.id === a.message.id)) ids.push({ id: a.message.id, hid: h.id });
        latest = r.historyId; pageToken = r.nextPageToken;
      } while (pageToken && ids.length < 40);
      if (pageToken) complete = false;
    } catch (e) {
      // history id too old (Gmail keeps about a week): start again from now
      if ((e as { status?: number }).status === 404) { const p = await profile(token); await saveConfig(sb, ch, { history_id: p.historyId }); return out; }
      throw e;
    }

    const known = cfg.filter === 'label' ? null : await knownSenders(sb, ch.tenant_id);
    const { data: seen } = ids.length ? await sb.from('messages').select('external_id').eq('channel_id', ch.id).in('external_id', ids.map((x) => x.id)) : { data: [] };
    const done = new Set((seen || []).map((s) => s.external_id));
    let lastDone: string | null = null;
    for (const { id, hid } of ids) {
      if (Date.now() > deadline - 3000) { complete = false; break; }
      if (done.has(id)) { lastDone = hid; continue; }
      out.fetched++;
      const meta = await gmail<GMsg>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To`).catch((e) => { if ((e as { status?: number }).status === 404) return null; throw e; });
      const labels = meta?.labelIds || [];
      const from = addrOf(hdr(meta?.payload, 'From'));
      const match = known ? known(from) : { party_id: null, known: true };
      if (!meta || labels.some((l) => ['SENT', 'DRAFT', 'SPAM', 'TRASH'].includes(l)) || from === (ch.account || '').toLowerCase() || !match.known) { out.skipped++; lastDone = hid; continue; }

      const m = await gmail<GMsg>(token, `/messages/${id}?format=full`);
      const p = m.payload;
      const text = newPart(bodyText(p));
      const subject = hdr(p, 'Subject') || null;
      const attachments = attachmentsOf(p);
      try {
        await ingestInbound({ tenantId: ch.tenant_id, channelKind: 'email_gmail', channelId: ch.id, from, senderName: nameOf(hdr(p, 'From')), partyId: match.party_id, subject, text: text || (attachments.length ? `(no text; attachments: ${attachments.map((a) => a.name).join(', ')})` : '(empty message)'), externalId: m.id,
          raw: { gmail: { id: m.id, thread_id: m.threadId, message_id: hdr(p, 'Message-ID') || hdr(p, 'Message-Id'), references: hdr(p, 'References'), reply_to: addrOf(hdr(p, 'Reply-To')) || null, to: hdr(p, 'To'), cc: hdr(p, 'Cc'), date: hdr(p, 'Date') }, attachments } });
        out.ingested++;
      } catch (e) { if (!/duplicate key/i.test(e instanceof Error ? e.message : '')) throw e; }
      lastDone = hid;
    }
    const next = complete ? latest : lastDone;
    await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null, config: { ...cfg, ...(next ? { history_id: next } : {}) } }).eq('id', ch.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ReauthError) await sb.from('channels').update({ status: 'reauth', error: msg, last_sync_at: new Date().toISOString() }).eq('id', ch.id);
    else await sb.from('channels').update({ error: msg.slice(0, 300), last_sync_at: new Date().toISOString() }).eq('id', ch.id);
    throw e;
  }
  return out;
}

async function saveConfig(sb: Client, ch: Channel, patch: Partial<GmailConfig>) {
  ch.config = { ...(ch.config || { connector: 'gmail' }), ...patch };
  await sb.from('channels').update({ config: ch.config, last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
}

// ------------------------------------------------------------------ outbound

const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type Reply = { to: string; subject: string | null; message_id: string | null; references: string | null; thread_id: string | null };

export async function sendReply(sb: Client, ch: Channel, r: Reply, body: string) {
  const token = await accessToken(sb, ch);
  const subject = r.subject ? (/^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`) : 'Re:';
  const head = [`From: ${ch.account}`, `To: ${r.to}`, `Subject: ${mimeWord(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'];
  if (r.message_id) { head.push(`In-Reply-To: ${r.message_id}`); head.push(`References: ${[r.references, r.message_id].filter(Boolean).join(' ')}`); }
  const raw = head.join('\r\n') + '\r\n\r\n' + (Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');
  return gmail<{ id: string; threadId: string }>(token, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(Buffer.from(raw, 'utf8')), ...(r.thread_id ? { threadId: r.thread_id } : {}) }) });
}

// Approved replies waiting on a Gmail channel go out here, oldest first.
export async function sendPending(sb: Client, deadline: number) {
  const out = { sent: 0, failed: 0 };
  const { data: rows } = await sb.from('messages').select('id, tenant_id, channel_id, thread_id, order_id, stream, text, sender_name, raw').eq('direction', 'out').is('sent_at', null).not('channel_id', 'is', null).eq('raw->>send', 'pending').order('created_at').limit(5);
  for (const m of rows || []) {
    if (Date.now() > deadline - 5000) break;
    const raw = (m.raw || {}) as { reply?: Reply; draft_id?: string; attempts?: number };
    const { data: ch } = await sb.from('channels').select('id, tenant_id, kind, status, account, owner_user_id, auth_enc, config, last_sync_at').eq('id', m.channel_id).maybeSingle();
    const fail = async (why: string, final: boolean) => {
      const attempts = (raw.attempts || 0) + 1, give = final || attempts >= 3;
      await sb.from('messages').update({ raw: { ...raw, attempts, send: give ? 'failed' : 'pending', send_error: why.slice(0, 300) } }).eq('id', m.id);
      if (give) { out.failed++; await sb.rpc('ledger_append', { p_tenant: m.tenant_id, p_channel: 'Email', p_actor: ch?.account || 'Gmail', p_actor_user: null, p_counterparty: raw.reply?.to || null, p_stream: m.stream, p_order: m.order_id, p_what: `Send failed: ${why.slice(0, 160)}`, p_gate: 'NOT SENT', p_gated: true, p_ref: { message_id: m.id, draft_id: raw.draft_id || null } }); }
    };
    if (!ch || ch.kind !== 'email_gmail') { await fail('the mailbox is no longer connected', true); continue; }
    if (ch.status !== 'connected') { await fail(`the mailbox ${ch.account} needs signing in again`, false); continue; }
    if (!raw.reply?.to) { await fail('no address to reply to', true); continue; }
    try {
      const s = await sendReply(sb, ch as Channel, raw.reply, m.text);
      const at = new Date().toISOString();
      await sb.from('messages').update({ sent_at: at, external_id: s.id, from_addr: ch.account, to_addr: [raw.reply.to], raw: { ...raw, send: 'sent', gmail: { id: s.id, thread_id: s.threadId } } }).eq('id', m.id);
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
