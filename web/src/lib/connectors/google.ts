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
import { open, hasTokenKey } from '@/lib/crypto';
import { ingestInbound } from '@/lib/agents/inbound';
import { ReauthError, channelToken, knownSenders, newPart, addresses, type Auth, type Channel, type MailConfig, type Reply, type FoundMail, type SearchInput } from './mail';
export type { Channel } from './mail';

export { sealAuth } from './mail';
type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailConfig = MailConfig & { connector: 'gmail'; history_id?: string };

export function googleConfigured() { return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && hasTokenKey(); }

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Gmail asks for the mail scopes; Drive asks for drive.file alone, as its own grant, so each connection
// holds only the permission it uses.
export function authUrl(o: { state: string; challenge: string; redirectUri: string; loginHint?: string; scopes?: string[] }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: o.redirectUri, response_type: 'code', scope: (o.scopes || GMAIL_SCOPES).join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state: o.state, code_challenge: o.challenge, code_challenge_method: 'S256', ...(o.loginHint ? { login_hint: o.loginHint } : {}) }).toString();
  return u.toString();
}

export async function googleToken(params: Record<string, string>) { return tokenCall(params); }
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

const accessToken = (sb: Client, ch: Channel) => channelToken(sb, ch, (refresh_token) => tokenCall({ grant_type: 'refresh_token', refresh_token }));

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

type Header = { name: string; value: string };
type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: Header[] };
type GMsg = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; payload?: Part };

const hdr = (p: Part | undefined, n: string) => p?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
export const addrOf = (v: string) => (v.match(/<([^>]+)>/)?.[1] || v).trim().toLowerCase();
export const nameOf = (v: string) => v.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || null;
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

function attachmentsOf(p: Part | undefined, out: { name: string; mime: string; bytes: number }[] = []) {
  if (!p) return out;
  if (p.filename && p.body?.attachmentId) out.push({ name: p.filename, mime: p.mimeType || '', bytes: p.body.size || 0 });
  for (const c of p.parts || []) attachmentsOf(c, out);
  return out;
}

export async function syncGmail(sb: Client, ch: Channel, deadline: number) {
  const out = { fetched: 0, ingested: 0, skipped: 0 };
  try {
    const token = await accessToken(sb, ch);
    const cfg = (ch.config || { connector: 'gmail' }) as GmailConfig;
    if (!cfg.history_id) { const p = await profile(token); await saveConfig(sb, ch, { history_id: p.historyId }); return out; }
    const labelId = cfg.filter === 'label' && cfg.label_id ? cfg.label_id : 'INBOX';

    // collect new message ids in history order, up to a cap
    type H = { id: string; messagesAdded?: { message: { id: string; labelIds?: string[] } }[]; labelsAdded?: { message: { id: string }; labelIds?: string[] }[] };
    const byLabel = labelId !== 'INBOX';
    const ids: { id: string; hid: string }[] = [];
    let pageToken: string | undefined, latest = cfg.history_id, complete = true;
    try {
      do {
        // with a chosen label, a message labelled by hand later counts too (labelAdded), not only one labelled on arrival
        const q = new URLSearchParams({ startHistoryId: cfg.history_id, labelId, maxResults: '100', ...(pageToken ? { pageToken } : {}) });
        q.append('historyTypes', 'messageAdded'); if (byLabel) q.append('historyTypes', 'labelAdded');
        const r = await gmail<{ history?: H[]; historyId: string; nextPageToken?: string }>(token, `/history?${q}`);
        for (const h of r.history || []) {
          const added = [...(h.messagesAdded || []).map((a) => a.message.id), ...(h.labelsAdded || []).filter((a) => (a.labelIds || []).includes(labelId)).map((a) => a.message.id)];
          for (const id of added) if (!ids.some((x) => x.id === id)) ids.push({ id, hid: h.id });
        }
        latest = r.historyId; pageToken = r.nextPageToken;
      } while (pageToken && ids.length < 40);
      if (pageToken) complete = false;
    } catch (e) {
      // history id too old (Gmail keeps about a week): start again from now
      if ((e as { status?: number }).status === 404) { const p = await profile(token); await saveConfig(sb, ch, { history_id: p.historyId }); return out; }
      throw e;
    }

    // known senders decide what is read in 'known' mode; in label mode they only link the sender to a party
    const known = await knownSenders(sb, ch.tenant_id);
    const { data: seen } = ids.length ? await sb.from('messages').select('external_id').eq('channel_id', ch.id).in('external_id', ids.map((x) => x.id)) : { data: [] };
    const done = new Set((seen || []).map((s) => s.external_id));
    let lastDone: string | null = null;
    // counts only, never addresses or subjects: skipped mail leaves no trace beyond a reason code
    const reasons: Record<string, number> = {};
    for (const { id, hid } of ids) {
      if (Date.now() > deadline - 3000) { complete = false; break; }
      if (done.has(id)) { lastDone = hid; continue; }
      out.fetched++;
      const meta = await gmail<GMsg>(token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To`).catch((e) => { if ((e as { status?: number }).status === 404) return null; throw e; });
      const labels = meta?.labelIds || [];
      const from = addrOf(hdr(meta?.payload, 'From'));
      const match = byLabel ? { party_id: known(from).party_id, known: true } : known(from);
      const why = !meta ? 'gone' : labels.some((l) => ['SENT', 'DRAFT', 'SPAM', 'TRASH'].includes(l)) ? 'sent_or_spam' : from === (ch.account || '').toLowerCase() ? 'own_address' : !match.known ? 'unknown_sender' : null;
      if (why) { out.skipped++; reasons[why] = (reasons[why] || 0) + 1; lastDone = hid; continue; }

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
    const last_pass = { at: new Date().toISOString(), mode: byLabel ? 'label' : 'known', new: ids.length, already: ids.filter((x) => done.has(x.id)).length, ingested: out.ingested, skipped: reasons };
    await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null, config: { ...cfg, ...(next ? { history_id: next } : {}), ...(ids.length ? { last_pass } : {}) } }).eq('id', ch.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ReauthError) await sb.from('channels').update({ status: 'reauth', error: msg, last_sync_at: new Date().toISOString() }).eq('id', ch.id);
    else await sb.from('channels').update({ error: msg.slice(0, 300), last_sync_at: new Date().toISOString() }).eq('id', ch.id);
    throw e;
  }
  return out;
}

async function saveConfig(sb: Client, ch: Channel, patch: Partial<GmailConfig>) {
  ch.config = { ...((ch.config || { connector: 'gmail' }) as GmailConfig), ...patch };
  await sb.from('channels').update({ config: ch.config, last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
}

// ------------------------------------------------------------------ outbound

const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sendReply(sb: Client, ch: Channel, r: Reply, body: string) {
  const token = await accessToken(sb, ch);
  const subject = r.subject ? (/^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`) : 'Re:';
  const head = [`From: ${ch.account}`, `To: ${r.to}`, `Subject: ${mimeWord(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'];
  if (r.message_id) { head.push(`In-Reply-To: ${r.message_id}`); head.push(`References: ${[r.references, r.message_id].filter(Boolean).join(' ')}`); }
  const raw = head.join('\r\n') + '\r\n\r\n' + (Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');
  return gmail<{ id: string; threadId: string }>(token, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(Buffer.from(raw, 'utf8')), ...(r.thread_id ? { threadId: r.thread_id } : {}) }) });
}


// ------------------------------------------------------------------ search (older mail, on demand)

// Gmail search over the member's own mailbox, bounded to the given correspondents. Nothing is stored.
export async function searchGmail(sb: Client, ch: Channel, s: SearchInput, allowed: (addr: string) => boolean): Promise<FoundMail[]> {
  const token = await accessToken(sb, ch);
  const who = s.terms.slice(0, 30).flatMap((t) => [`from:${t}`, `to:${t}`, `cc:${t}`]).join(' ');
  const clean = (s.words || '').replace(/[{}()"]/g, ' ').trim();
  const q = [`{${who}}`, clean, s.after ? `after:${s.after.replace(/-/g, '/')}` : '', s.before ? `before:${s.before.replace(/-/g, '/')}` : ''].filter(Boolean).join(' ');
  const list = await gmail<{ messages?: { id: string }[] }>(token, `/messages?${new URLSearchParams({ q, maxResults: String(s.max * 2) })}`);
  const out: FoundMail[] = [];
  for (const { id } of list.messages || []) {
    if (out.length >= s.max) break;
    const m = await gmail<GMsg>(token, `/messages/${id}?format=full`);
    const p = m.payload;
    const people = [hdr(p, 'From'), hdr(p, 'To'), hdr(p, 'Cc')].flatMap(addresses);
    if (!people.some(allowed)) continue;
    out.push({ mailbox: ch.account || '', date: new Date(Number(m.internalDate || 0)).toISOString().slice(0, 16).replace('T', ' '), from: hdr(p, 'From'), to: hdr(p, 'To'), subject: hdr(p, 'Subject'), text: newPart(bodyText(p)).slice(0, 2500), attachments: attachmentsOf(p).map((a) => a.name) });
  }
  return out;
}
