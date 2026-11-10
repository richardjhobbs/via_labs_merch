// MCP server, phase 1 (docs/mcp.md): the pure parts. Token format and hashing, and the allow list that decides
// which of the agent's tools an outside agent may call for a given member and token. No database here, so the
// tests run without env.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Track } from '@/lib/tracks';

export const TOKEN_DAYS = 90;
export const CALLS_PER_MINUTE = 60;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LEN = 12, SECRET_LEN = 32;

function base62(n: number): string {
  const b = randomBytes(n * 2); let s = '';
  for (let i = 0; i < b.length && s.length < n; i++) if (b[i] < 248) s += ALPHABET[b[i] % 62];
  return s.length === n ? s : s + base62(n - s.length);
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// vm_<12 prefix><32 secret>: the prefix finds the row, the hash of the whole string proves the secret.
export function mintToken() {
  const prefix = base62(PREFIX_LEN), token = `vm_${prefix}${base62(SECRET_LEN)}`;
  return { token, prefix, hash: hashToken(token) };
}

export function parseToken(raw: string | null | undefined): { prefix: string; token: string } | null {
  const m = (raw || '').trim().match(/^vm_([A-Za-z0-9]{12})([A-Za-z0-9]{32})$/);
  return m ? { prefix: m[1], token: m[0] } : null;
}

export function hashMatches(token: string, storedHash: string) {
  const a = Buffer.from(hashToken(token), 'hex'), b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Roles that may hold a token with writes. Viewers and the compliance, qc and logistics roles read only; partners
// never issue tokens (they have no workspace).
export const WRITE_ROLES = ['owner', 'manager', 'merchandiser'] as const;
export const canWrite = (role: string | null | undefined) => (WRITE_ROLES as readonly string[]).includes(role || '');
export const canIssue = (role: string | null | undefined) => !!role && role !== 'partner';

// The allow list. A tool not named here is never registered, whatever the token says.
export const READ_ANY = ['get_briefing', 'search_orders', 'get_order', 'get_exceptions', 'get_order_file', 'get_party', 'get_messages', 'get_ledger', 'get_gates', 'get_desk_brief', 'get_company_brief'] as const;
export const READ_TEAM = ['get_team'] as const;                       // owners and managers
export const READ_DEV = ['search_styles', 'get_style', 'get_style_file', 'diff_tech_pack', 'get_samples', 'get_materials', 'get_schedule'] as const;
export const READ_ESG = ['get_compliance'] as const;
export const WRITE_ANY = ['queue_draft', 'set_milestone'] as const;
export const WRITE_DEV = ['record_sample_event'] as const;
export const WRITE_ESG = ['record_compliance_value'] as const;
// Never on MCP: request_approval (sends at L2+), search_mailbox (a person's own mailbox, chat only), navigate (UI).
export const NEVER = ['request_approval', 'search_mailbox', 'navigate'] as const;

export type Grant = { role: string; tracks: Track[]; writes: boolean; esg: boolean };

export function allowedTools(g: Grant): string[] {
  const dev = g.tracks.includes('development');
  const out: string[] = [...READ_ANY];
  if (['owner', 'manager'].includes(g.role)) out.push(...READ_TEAM);
  if (dev) out.push(...READ_DEV);
  if (g.esg) out.push(...READ_ESG);
  if (g.writes && canWrite(g.role)) {
    out.push(...WRITE_ANY);
    if (dev) out.push(...WRITE_DEV);
    if (g.esg) out.push(...WRITE_ESG);
  }
  return out.filter((t) => !(NEVER as readonly string[]).includes(t));
}

// Tracks a token may carry: what the person asked for, inside what the membership and the company allow.
export function grantTracks(asked: string[], member: Track[]): Track[] {
  const t = member.filter((x) => asked.includes(x));
  return t.length ? t : member.slice(0, 1);
}

// Which track a call runs on: the development tools and anything about a style are development; a track the
// client names wins when the token has it; otherwise the token's first track.
export function trackForCall(tool: string, args: Record<string, unknown> | undefined, tracks: Track[]): Track {
  const has = (t: Track) => tracks.includes(t);
  const named = args?.track;
  if ((named === 'development' || named === 'production') && has(named)) return named;
  if ((READ_DEV as readonly string[]).includes(tool) || (WRITE_DEV as readonly string[]).includes(tool)) return has('development') ? 'development' : tracks[0];
  if (tool === 'queue_draft' && typeof args?.style === 'string' && args.style && !args.po && has('development')) return 'development';
  if (['get_desk_brief', 'get_company_brief', 'set_milestone'].includes(tool)) return has('production') ? 'production' : tracks[0];
  return tracks[0];
}

export const expiryFrom = (now = new Date()) => new Date(now.getTime() + TOKEN_DAYS * 864e5);
