// Private member lists (founder, 24 Nov 2026; migration 0038). With tenants.settings.private_members on, only
// owners (and VIA Labs under support access) see who else is on the account. Everyone else, managers included,
// sees only themselves: the database returns only their own membership, invite and token rows, the team pages
// and pickers are hidden, and other members' names in any text the app or the agent shows them read "A colleague".
// Pure helpers, no database: imported by lib/supabase/server.ts as well.
export const COLLEAGUE = 'A colleague';

export const membersPrivate = (settings: unknown) => !!(settings as { private_members?: boolean } | null)?.private_members;

// role 'owner' always sees the team; the VIA Labs support membership has id 'admin'
export const seesTeam = (role: string | null | undefined, settings: unknown, membershipId?: string) =>
  membershipId === 'admin' || role === 'owner' || !membersPrivate(settings);

export type Masker = (s: string) => string;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build the replacer from the names to hide (longest first, whole words, at least 3 characters).
export function maskerOf(names: string[]): Masker | null {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (s: string) => s.replace(re, COLLEAGUE);
}

// Mask every string inside a JSON-like value.
export function maskDeep<T>(v: T, mask: Masker): T {
  if (typeof v === 'string') return mask(v) as T;
  if (Array.isArray(v)) return v.map((x) => maskDeep(x, mask)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskDeep(x, mask)])) as T;
  return v;
}
