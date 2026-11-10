// MCP tokens against the database: authenticate a request, issue, revoke, list. Service role throughout, after
// the checks here, because members cannot write merch.mcp_tokens. Every issue and revoke is a ledger row.
import { supabaseAdmin } from '@/lib/supabase/server';
import { esgEnabled } from '@/lib/esg-shared';
import { memberTracks, type Track } from '@/lib/tracks';
import { scopeOf } from '@/lib/tenant';
import { canIssue, canWrite, expiryFrom, grantTracks, hashMatches, mintToken, parseToken, CALLS_PER_MINUTE } from './core';

export type McpToken = {
  id: string; tenant_id: string; membership_id: string; user_id: string; name: string; prefix: string; hash: string;
  tracks: string[]; writes: boolean; expires_at: string; last_used_at: string | null; last_client: string | null; calls: number;
  revoked_at: string | null; revoked_by: string | null; created_at: string;
};

export type McpAuth = {
  token: McpToken;
  tenant: { id: string; name: string; settings: unknown };
  member: { id: string; role: string; display_name: string | null; scopes: { parties?: string[] }; tracks: string[]; user_id: string };
  tracks: Track[]; writes: boolean; esg: boolean; scope: string[] | null;
};

export const MAX_ACTIVE = 5;
export const isLive = (t: Pick<McpToken, 'revoked_at' | 'expires_at'>) => !t.revoked_at && new Date(t.expires_at).getTime() > Date.now();

// Bearer header to a verified grant, or null. Constant-time hash compare; no detail leaves on failure.
export async function authenticate(header: string | null): Promise<McpAuth | null> {
  const m = (header || '').match(/^Bearer\s+(\S+)$/i);
  const p = parseToken(m?.[1]);
  if (!p) return null;
  const sb = supabaseAdmin();
  const { data: token } = await sb.from('mcp_tokens').select('*').eq('prefix', p.prefix).maybeSingle();
  if (!token || !hashMatches(p.token, token.hash) || !isLive(token)) return null;
  const [{ data: member }, { data: tenant }] = await Promise.all([
    sb.from('memberships').select('id, role, display_name, scopes, tracks, user_id').eq('id', token.membership_id).maybeSingle(),
    sb.from('tenants').select('id, name, settings').eq('id', token.tenant_id).maybeSingle(),
  ]);
  if (!member || !tenant || member.user_id !== token.user_id || !canIssue(member.role)) return null;
  const tracks = grantTracks(token.tracks, memberTracks(member, tenant.settings as never));
  return { token: token as McpToken, tenant, member, tracks, writes: !!token.writes && canWrite(member.role), esg: esgEnabled(tenant.settings), scope: scopeOf(member as never) };
}

// Calls in the last minute on this token, from the run log (one agent_runs row per tools/call).
export async function overLimit(tokenId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabaseAdmin().from('agent_runs').select('id', { count: 'exact', head: true }).eq('trigger', 'mcp').eq('input->>token', tokenId).gte('created_at', since);
  return (count || 0) >= CALLS_PER_MINUTE;
}

export async function touch(a: McpAuth, client?: string | null) {
  await supabaseAdmin().from('mcp_tokens').update({ last_used_at: new Date().toISOString(), calls: a.token.calls + 1, ...(client ? { last_client: client.slice(0, 80) } : {}) }).eq('id', a.token.id);
}

type Issuer = { tenantId: string; membershipId: string; userId: string; role: string; actor: string; memberTracks: Track[] };

export async function issueToken(by: Issuer, input: { name: string; tracks: string[]; writes: boolean }) {
  if (!canIssue(by.role)) return { error: 'role' as const };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: 'name' as const };
  const sb = supabaseAdmin();
  const { data: live } = await sb.from('mcp_tokens').select('id, revoked_at, expires_at').eq('membership_id', by.membershipId);
  if ((live || []).filter(isLive).length >= MAX_ACTIVE) return { error: 'limit' as const };
  const tracks = grantTracks(input.tracks, by.memberTracks), writes = input.writes && canWrite(by.role);
  const t = mintToken(), expires = expiryFrom();
  const { data: row, error } = await sb.from('mcp_tokens').insert({ tenant_id: by.tenantId, membership_id: by.membershipId, user_id: by.userId, name, prefix: t.prefix, hash: t.hash, tracks, writes, expires_at: expires.toISOString() }).select('id').single();
  if (error || !row) return { error: error?.message || 'insert failed' };
  await sb.rpc('ledger_append', { p_tenant: by.tenantId, p_channel: 'Workspace', p_actor: by.actor, p_actor_user: by.userId, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Issued MCP token "${name}" (${tracks.join(', ')}${writes ? ', reads and queues' : ', read only'}), expires ${expires.toISOString().slice(0, 10)}`, p_gate: 'Logged', p_gated: false, p_ref: { mcp_token: row.id } });
  return { token: t.token, id: row.id, expires: expires.toISOString() };
}

// The owner of the token, or an owner or manager of the company, may revoke it.
export async function revokeToken(by: { tenantId: string; userId: string; role: string; actor: string }, id: string) {
  const sb = supabaseAdmin();
  const { data: t } = await sb.from('mcp_tokens').select('id, name, user_id, revoked_at').eq('tenant_id', by.tenantId).eq('id', id).maybeSingle();
  if (!t) return { error: 'missing' as const };
  if (t.user_id !== by.userId && !['owner', 'manager'].includes(by.role)) return { error: 'role' as const };
  if (t.revoked_at) return { ok: true };
  const { error } = await sb.from('mcp_tokens').update({ revoked_at: new Date().toISOString(), revoked_by: by.userId }).eq('id', id);
  if (error) return { error: error.message };
  await sb.rpc('ledger_append', { p_tenant: by.tenantId, p_channel: 'Workspace', p_actor: by.actor, p_actor_user: by.userId, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Revoked MCP token "${t.name}"${t.user_id !== by.userId ? ' of another member' : ''}`, p_gate: 'Logged', p_gated: false, p_ref: { mcp_token: id } });
  return { ok: true };
}
