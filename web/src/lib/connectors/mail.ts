// Shared mail-channel plumbing for Gmail and Microsoft 365: sealed tokens, the known-sender filter,
// trimming the quoted chain, and sending approved replies from the mailbox the original came in on.
import type { SupabaseClient } from '@supabase/supabase-js';
import { seal, open } from '@/lib/crypto';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Auth = { refresh_token: string; access_token?: string; expires_at?: number };
export type MailConfig = { connector: 'gmail' | 'm365'; filter?: 'known' | 'label'; label?: string | null; label_id?: string | null; connected_by?: string; [k: string]: unknown };
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


export async function knownSenders(sb: Client, tenantId: string) {
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
// Keep the new part of a reply: cut at the quoted chain.
export function newPart(text: string) {
  const re = /^(On .{4,200}wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+|发件人[:：].+|_{10,})\s*$/m;
  const m = text.match(re);
  const cut = m && m.index !== undefined && m.index > 40 ? text.slice(0, m.index) : text;
  return cut.replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12_000);
}

