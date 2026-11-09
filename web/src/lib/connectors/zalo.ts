// Zalo Official Account. The client owns the OA (on a Zalo tier with API access) and verifies it in Vietnam;
// VIA has one Zalo developer app (ZALO_APP_ID, ZALO_APP_SECRET, ZALO_OA_SECRET_KEY) that each client's OA
// admin authorises once ("Connect Zalo OA" on Connections, Zalo's OAuth v4 with PKCE). Zalo then posts the
// OA's events to /api/webhooks/zalo; replies go out through the OA's customer-service message API after
// approval. Zalo allows free replies within its window after the user last wrote; outside it the send fails
// and an alert says so. Personal Zalo accounts have no API and are never connected.
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasTokenKey } from '@/lib/crypto';
import { ReauthError, channelToken, type Channel, type Reply } from './mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OAUTH = 'https://oauth.zaloapp.com/v4/oa';
const API = 'https://openapi.zalo.me';
export type ZaloConfig = { connector: 'zalo'; oa_name?: string; connected_by?: string };

export function zaloConfigured() { return !!process.env.ZALO_APP_ID && !!process.env.ZALO_APP_SECRET && !!process.env.ZALO_OA_SECRET_KEY && hasTokenKey(); }

export function authUrl(o: { state: string; challenge: string; redirectUri: string }) {
  const u = new URL(`${OAUTH}/permission`);
  u.search = new URLSearchParams({ app_id: process.env.ZALO_APP_ID!, redirect_uri: o.redirectUri, code_challenge: o.challenge, state: o.state }).toString();
  return u.toString();
}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch(`${OAUTH}/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', secret_key: process.env.ZALO_APP_SECRET! }, body: new URLSearchParams({ app_id: process.env.ZALO_APP_ID!, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const msg = String(j.error_description || j.error_name || j.error || r.status); if (/refresh|invalid|expired/i.test(msg)) throw new ReauthError(msg); throw new Error(`Zalo token: ${msg}`); }
  // Zalo returns expires_in as a string
  return { access_token: String(j.access_token), refresh_token: j.refresh_token ? String(j.refresh_token) : undefined, expires_in: Number(j.expires_in) || 3600 };
}

export const exchangeCode = (code: string, verifier: string) => tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier });
// Zalo refresh tokens are single use; channelToken keeps the new one every time
export const zaloToken = (sb: Client, ch: Channel) => channelToken(sb, ch, (refresh_token) => tokenCall({ grant_type: 'refresh_token', refresh_token }));

export async function zaloApi<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + path, { ...init, headers: { access_token: token, 'content-type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (typeof j.error === 'number' && j.error !== 0)) { const e = new Error(`Zalo ${j.error ?? r.status}: ${j.message || r.statusText}`) as Error & { code?: number }; e.code = j.error; throw e; }
  return j as T;
}

export async function oaInfo(token: string) {
  const j = await zaloApi<{ data?: { oa_id?: string | number; name?: string } }>(token, '/v2.0/oa/getoa');
  return { oa_id: String(j.data?.oa_id || ''), name: j.data?.name || '' };
}

export async function userName(token: string, userId: string) {
  try { const j = await zaloApi<{ data?: { display_name?: string } }>(token, `/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`); return j.data?.display_name || null; } catch { return null; }
}

// X-ZEvent-Signature: "mac=" + sha256(app_id + raw body + timestamp + OA secret key)
export function verifyZalo(body: string, header: string | null, appId: string, timestamp: string) {
  if (!header || !process.env.ZALO_OA_SECRET_KEY) return false;
  const want = createHash('sha256').update(`${appId}${body}${timestamp}${process.env.ZALO_OA_SECRET_KEY}`).digest('hex');
  return header.replace(/^mac=/, '').toLowerCase() === want;
}

export const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };

export async function sendZalo(sb: Client, ch: Channel, r: Reply, body: string) {
  const token = await zaloToken(sb, ch);
  try {
    const j = await zaloApi<{ data?: { message_id?: string } }>(token, '/v3.0/oa/message/cs', { method: 'POST', body: JSON.stringify({ recipient: { user_id: r.to }, message: { text: body } }) });
    return { id: String(j.data?.message_id || ''), threadId: r.to };
  } catch (e) {
    const code = (e as { code?: number }).code;
    // -230 / -232: the user has not written recently enough for a free reply
    if (code === -230 || code === -232) throw new Error('outside Zalo\'s reply window since they last wrote; send this one from the phone');
    throw e;
  }
}
