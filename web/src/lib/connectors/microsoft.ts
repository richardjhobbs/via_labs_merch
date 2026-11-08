// Microsoft 365 connector (Outlook, work or personal): OAuth sign-in, the minute sync and replies.
// Runtime half of the 'm365' manifest in catalog.ts. Same rules as Gmail (lib/connectors/mail.ts):
// own mailbox only, new mail from the moment of connecting, known senders or one chosen folder,
// replies only after approval, from the same mailbox, in the same conversation.
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasTokenKey } from '@/lib/crypto';
import { ingestInbound } from '@/lib/agents/inbound';
import { ReauthError, channelToken, knownSenders, newPart, type Channel, type MailConfig, type Reply, type FoundMail, type SearchInput } from './mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const MS_SCOPES = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.Send'];
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
// since: receivedDateTime of the last message looked at; at_since: ids already looked at with that exact time
export type OutlookConfig = MailConfig & { connector: 'm365'; since?: string; at_since?: string[] };

export function microsoftConfigured() { return !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET && hasTokenKey(); }

export function authUrl(o: { state: string; challenge: string; redirectUri: string; loginHint?: string }) {
  const u = new URL(`${AUTH}/authorize`);
  u.search = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: 'code', redirect_uri: o.redirectUri, response_mode: 'query', scope: MS_SCOPES.join(' '), state: o.state, code_challenge: o.challenge, code_challenge_method: 'S256', prompt: 'select_account', ...(o.loginHint ? { login_hint: o.loginHint } : {}) }).toString();
  return u.toString();
}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch(`${AUTH}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: MS_SCOPES.join(' '), ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (j.error === 'invalid_grant' || j.error === 'interaction_required') throw new ReauthError(String(j.error_description || j.error).split('\n')[0]); throw new Error(`Microsoft token: ${j.error || r.status} ${String(j.error_description || '').split('\n')[0]}`.trim()); }
  return j as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export const exchangeCode = (code: string, verifier: string, redirectUri: string) => tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
const accessToken = (sb: Client, ch: Channel) => channelToken(sb, ch, (refresh_token) => tokenCall({ grant_type: 'refresh_token', refresh_token }));

// Immutable ids, so a message keeps its id when someone files it in another folder.
export async function graph<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(path.startsWith('https://') ? path : GRAPH + path, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'IdType="ImmutableId", outlook.body-content-type="text"', ...(init.headers || {}) } });
  if (r.status === 202 || r.status === 204) return {} as T;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ReauthError('Microsoft refused the token');
  if (!r.ok) { const e = new Error(`Microsoft Graph ${r.status}: ${j?.error?.message || r.statusText}`) as Error & { status?: number }; e.status = r.status; throw e; }
  return j as T;
}

export async function profile(token: string) {
  const p = await graph<{ mail: string | null; userPrincipalName: string }>(token, '?$select=mail,userPrincipalName');
  return { account: (p.mail || p.userPrincipalName).toLowerCase() };
}

// A folder by display name: top level first, then under the Inbox.
export async function findFolderId(sb: Client, ch: Channel, name: string) {
  const token = await accessToken(sb, ch);
  const q = `?$filter=${encodeURIComponent(`displayName eq '${name.trim().replace(/'/g, "''")}'`)}&$select=id,displayName`;
  for (const base of ['/mailFolders', '/mailFolders/inbox/childFolders']) {
    const r = await graph<{ value: { id: string }[] }>(token, base + q);
    if (r.value?.[0]) return r.value[0].id;
  }
  return null;
}

type Addr = { emailAddress?: { address?: string; name?: string } };
type GraphMsg = { id: string; receivedDateTime: string; subject?: string; from?: Addr; replyTo?: Addr[]; internetMessageId?: string; conversationId?: string; hasAttachments?: boolean; isDraft?: boolean; body?: { content?: string }; uniqueBody?: { content?: string }; toRecipients?: Addr[] };
const addr = (a?: Addr) => (a?.emailAddress?.address || '').trim().toLowerCase();

export async function syncOutlook(sb: Client, ch: Channel, deadline: number) {
  const out = { fetched: 0, ingested: 0, skipped: 0 };
  try {
    const token = await accessToken(sb, ch);
    const cfg = (ch.config || { connector: 'm365' }) as OutlookConfig;
    if (!cfg.since) { await save(sb, ch, { since: new Date().toISOString(), at_since: [] }); return out; }
    const folder = cfg.filter === 'label' && cfg.label_id ? cfg.label_id : 'inbox';
    const q = `$filter=${encodeURIComponent(`receivedDateTime ge ${cfg.since}`)}&$orderby=${encodeURIComponent('receivedDateTime asc')}&$top=25&$select=id,receivedDateTime,subject,from,replyTo,internetMessageId,conversationId,hasAttachments,isDraft`;
    const r = await graph<{ value: GraphMsg[] }>(token, `/mailFolders/${folder}/messages?${q}`);
    const known = await knownSenders(sb, ch.tenant_id);
    const list = r.value || [];
    const { data: seen } = list.length ? await sb.from('messages').select('external_id').eq('channel_id', ch.id).in('external_id', list.map((m) => m.id)) : { data: [] };
    const done = new Set([...(seen || []).map((s) => s.external_id as string), ...(cfg.at_since || [])]);
    let since = cfg.since, atSince = [...(cfg.at_since || [])];
    const mark = (m: GraphMsg) => { if (m.receivedDateTime !== since) { since = m.receivedDateTime; atSince = []; } atSince.push(m.id); };
    for (const m of list) {
      if (Date.now() > deadline - 3000) break;
      if (done.has(m.id)) { mark(m); continue; }
      out.fetched++;
      const from = addr(m.from);
      const match = cfg.filter === 'label' ? { party_id: known(from).party_id, known: true } : known(from);
      if (m.isDraft || !from || from === (ch.account || '').toLowerCase() || !match.known) { out.skipped++; mark(m); continue; }
      const full = await graph<GraphMsg>(token, `/messages/${m.id}?$select=uniqueBody,body,toRecipients`);
      const text = newPart(full.uniqueBody?.content?.trim() || full.body?.content || '');
      const attachments = m.hasAttachments ? ((await graph<{ value: { name: string; contentType: string; size: number }[] }>(token, `/messages/${m.id}/attachments?$select=name,contentType,size`).catch(() => ({ value: [] }))).value || []).map((a) => ({ name: a.name, mime: a.contentType, bytes: a.size })) : [];
      try {
        await ingestInbound({ tenantId: ch.tenant_id, channelKind: 'email_m365', channelId: ch.id, from, senderName: m.from?.emailAddress?.name || null, partyId: match.party_id, subject: m.subject || null, text: text || (attachments.length ? `(no text; attachments: ${attachments.map((a) => a.name).join(', ')})` : '(empty message)'), externalId: m.id,
          raw: { m365: { id: m.id, conversation_id: m.conversationId || null, message_id: m.internetMessageId || null, reply_to: addr(m.replyTo?.[0]) || null, to: (full.toRecipients || []).map(addr).join(', '), date: m.receivedDateTime }, attachments } });
        out.ingested++;
      } catch (e) { if (!/duplicate key/i.test(e instanceof Error ? e.message : '')) throw e; }
      mark(m);
    }
    await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null, config: { ...cfg, since, at_since: atSince.slice(-50) } }).eq('id', ch.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('channels').update(e instanceof ReauthError ? { status: 'reauth', error: msg, last_sync_at: new Date().toISOString() } : { error: msg.slice(0, 300), last_sync_at: new Date().toISOString() }).eq('id', ch.id);
    throw e;
  }
  return out;
}

async function save(sb: Client, ch: Channel, patch: Partial<OutlookConfig>) {
  ch.config = { ...((ch.config || { connector: 'm365' }) as OutlookConfig), ...patch };
  await sb.from('channels').update({ config: ch.config, last_sync_at: new Date().toISOString(), error: null }).eq('id', ch.id);
}

// Reply in the same conversation: create the reply draft (Outlook threads and addresses it), put our
// plain-text body in place of the quoted original, send. The sent message keeps the draft's immutable id.
export async function sendReply(sb: Client, ch: Channel, r: Reply, body: string) {
  if (!r.provider_id) throw new Error('no original message to reply to');
  const token = await accessToken(sb, ch);
  const d = await graph<{ id: string; conversationId?: string }>(token, `/messages/${r.provider_id}/createReply`, { method: 'POST', body: '{}' });
  const patch: Record<string, unknown> = { body: { contentType: 'Text', content: body } };
  if (r.to) patch.toRecipients = [{ emailAddress: { address: r.to } }];
  await graph(token, `/messages/${d.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  await graph(token, `/messages/${d.id}/send`, { method: 'POST', body: '{}' });
  return { id: d.id, threadId: d.conversationId || r.thread_id || '' };
}

// ------------------------------------------------------------------ search (older mail, on demand)

// Outlook search (KQL) over the member's own mailbox, bounded to the given correspondents. Nothing is stored.
export async function searchOutlook(sb: Client, ch: Channel, s: SearchInput, allowed: (addr: string) => boolean): Promise<FoundMail[]> {
  const token = await accessToken(sb, ch);
  const who = s.terms.slice(0, 30).map((t) => `participants:${t}`).join(' OR ');
  const clean = (s.words || '').replace(/["():]/g, ' ').trim();
  const kql = [`(${who})`, clean ? `(${clean})` : '', s.after ? `received>=${s.after}` : '', s.before ? `received<${s.before}` : ''].filter(Boolean).join(' AND ');
  const r = await graph<{ value: GraphMsg[] }>(token, `/messages?$search=${encodeURIComponent(`"${kql}"`)}&$top=${s.max * 2}&$select=id,receivedDateTime,subject,from,toRecipients,ccRecipients,hasAttachments,body`);
  const out: FoundMail[] = [];
  for (const m of r.value || []) {
    if (out.length >= s.max) break;
    const people = [m.from, ...(m.toRecipients || []), ...((m as { ccRecipients?: Addr[] }).ccRecipients || [])].map(addr).filter(Boolean);
    if (!people.some(allowed)) continue;
    const attachments = m.hasAttachments ? ((await graph<{ value: { name: string }[] }>(token, `/messages/${m.id}/attachments?$select=name`).catch(() => ({ value: [] }))).value || []).map((a) => a.name) : [];
    out.push({ mailbox: ch.account || '', date: m.receivedDateTime.slice(0, 16).replace('T', ' '), from: addr(m.from), to: (m.toRecipients || []).map(addr).join(', '), subject: m.subject || '', text: newPart(m.body?.content || '').slice(0, 2500), attachments });
  }
  return out;
}
