// Shared mail-channel plumbing for Gmail and Microsoft 365: sealed tokens, the known-sender filter,
// trimming the quoted chain, and sending approved replies from the mailbox the original came in on.
import type { SupabaseClient } from '@supabase/supabase-js';
import { seal, open } from '@/lib/crypto';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Auth = { refresh_token: string; access_token?: string; expires_at?: number };
export type MailConfig = { connector: 'gmail' | 'm365' | 'gdrive' | 'forward'; filter?: 'known' | 'label'; label?: string | null; label_id?: string | null; connected_by?: string; [k: string]: unknown };
export type Channel = { id: string; tenant_id: string; kind: string; status: string; account: string | null; owner_user_id: string | null; auth_enc: string | null; config: MailConfig; last_sync_at: string | null };
// thread_id: Gmail thread id; provider_id: the original message's id in the provider (Graph reply target)
export type Reply = { to: string; subject: string | null; message_id: string | null; references: string | null; thread_id: string | null; provider_id?: string | null };
export const MAIL_KINDS = ['email_gmail', 'email_m365'] as const;
export const CHANNEL_COLS = 'id, tenant_id, kind, status, account, owner_user_id, auth_enc, config, last_sync_at';

export class ReauthError extends Error {}

export function sealAuth(t: { refresh_token: string; access_token?: string; expires_in?: number }) {
  return seal({ refresh_token: t.refresh_token, access_token: t.access_token, expires_at: t.expires_in ? Date.now() + (t.expires_in - 60) * 1000 : 0 } satisfies Auth);
}

// A valid access token for the channel, refreshed and re-sealed when it has expired.
// Microsoft rotates the refresh token on every refresh, so the new one is always kept.
export async function channelToken(sb: Client, ch: Channel, refresh: (rt: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string }>) {
  const a = open<Auth>(ch.auth_enc);
  if (!a?.refresh_token) throw new ReauthError('no token stored');
  if (a.access_token && (a.expires_at || 0) > Date.now()) return a.access_token;
  const t = await refresh(a.refresh_token);
  const enc = sealAuth({ refresh_token: t.refresh_token || a.refresh_token, access_token: t.access_token, expires_in: t.expires_in });
  await sb.from('channels').update({ auth_enc: enc }).eq('id', ch.id);
  ch.auth_enc = enc;
  return t.access_token;
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'qq.com', '163.com', '126.com', 'sina.com', 'yeah.net', 'foxmail.com', 'aliyun.com', 'naver.com', 'yandex.com', 'gmx.de', 'web.de', 'mail.ru', 'rediffmail.com']);


// Contact emails and company domains (free-mail domains excluded) for the company, or for one party.
// Used to filter what comes in and to bound what the agent may search for.
export async function senderList(sb: Client, tenantId: string, partyId?: string | null) {
  let q = sb.from('contacts').select('id, party_id, email, parties!inner(archived_at)').eq('tenant_id', tenantId).not('email', 'is', null).is('parties.archived_at', null);   // archived parties no longer let mail in
  if (partyId) q = q.eq('party_id', partyId);
  const { data } = await q;
  const byEmail = new Map<string, { party_id: string; contact_id: string }>();
  const byDomain = new Map<string, Set<string>>();
  for (const c of data || []) {
    const e = String(c.email).trim().toLowerCase(); if (!e.includes('@')) continue;
    byEmail.set(e, { party_id: c.party_id, contact_id: c.id });
    const d = e.split('@')[1]; if (!FREE_MAIL.has(d)) { if (!byDomain.has(d)) byDomain.set(d, new Set()); byDomain.get(d)!.add(c.party_id); }
  }
  const match = (addr: string): { party_id: string | null; known: boolean } => {
    const a = addr.trim().toLowerCase();
    const hit = byEmail.get(a); if (hit) return { party_id: hit.party_id, known: true };
    const parties = byDomain.get(a.split('@')[1] || '');
    if (parties) return { party_id: parties.size === 1 ? [...parties][0] : null, known: true };
    return { party_id: null, known: false };
  };
  // search terms: domains cover everyone at a company, so only list emails whose domain is free mail
  const terms = [...byDomain.keys(), ...[...byEmail.keys()].filter((e) => !byDomain.has(e.split('@')[1]))];
  return { match, terms };
}

export async function knownSenders(sb: Client, tenantId: string) { return (await senderList(sb, tenantId)).match; }

export const addresses = (v: string) => (v.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((a) => a.toLowerCase());

export type FoundMail = { mailbox: string; date: string; from: string; to: string; subject: string; text: string; attachments: string[] };
export type SearchInput = { terms: string[]; words?: string; after?: string; before?: string; max: number };

// One pass over a mailbox: new messages since the stored history id, filtered, into the inbound pipeline.
// Keep the new part of a reply: cut at the quoted chain.
export function newPart(text: string) {
  const re = /^(On .{4,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+|发件人[:：].+|_{10,})\s*$/m;
  const m = text.match(re);
  const cut = m && m.index !== undefined && m.index > 40 ? text.slice(0, m.index) : text;
  return cut.replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12_000);
}

