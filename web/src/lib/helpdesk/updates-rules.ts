// Who an announcement is for. Pure, so it is tested without a database (updates-rules.test.ts).
import type { TenantSettings } from '@/lib/features';

export type Audience =
  | { kind: 'all' }
  | { kind: 'addon'; key: string }
  | { kind: 'track'; key: string }
  | { kind: 'feature'; key: string }
  | { kind: 'tenants'; ids: string[] };

// yes: shown as theirs. locked: shown as available on request (the company does not hold the add-on, track
// or feature). hidden: not shown at all (written for other companies; partners see general updates only).
export type Visibility = 'yes' | 'locked' | 'hidden';

export function visibility(a: Audience | null | undefined, tenantId: string, s: TenantSettings | null | undefined, partner = false): Visibility {
  if (!a || a.kind === 'all') return 'yes';
  if (partner) return 'hidden';
  if (a.kind === 'tenants') return (a.ids || []).includes(tenantId) ? 'yes' : 'hidden';
  if (a.kind === 'addon') return s?.addons?.[a.key] ? 'yes' : 'locked';
  if (a.kind === 'track') return a.key === 'production' || s?.tracks?.[a.key] ? 'yes' : 'locked';
  if (a.kind === 'feature') return s?.features?.[a.key] ? 'yes' : 'locked';
  return 'hidden';
}

export function parseAudience(kind: string, tenantIds: string[]): Audience {
  if (kind === 'tenants') return { kind: 'tenants', ids: tenantIds.filter((x) => /^[0-9a-f-]{36}$/i.test(x)) };
  const [k, key] = kind.split(':');
  if ((k === 'addon' || k === 'track' || k === 'feature') && key) return { kind: k, key };
  return { kind: 'all' };
}
