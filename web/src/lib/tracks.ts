// Two tracks in one workspace (docs/development-merchandising.md): 'production' is everything from the PO on,
// 'development' is briefs, tech packs, materials and sample rounds before a PO exists. Separation is at the
// level of streams, gates, queue, briefing, agent and navigation; storage, parties, connectors and the
// ledger are shared. The company's switch is tenants.settings.tracks.development (VIA console); a person's
// tracks are memberships.tracks; the one on screen is the merch_track_<slug> cookie, set by the switch.
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export const TRACKS = ['production', 'development'] as const;
export type Track = (typeof TRACKS)[number];
export const isTrack = (v: unknown): v is Track => v === 'production' || v === 'development';

// Production streams (unchanged) and development streams (gates seeded in migration 0016).
export const PROD_STREAMS = ['General enquiries', 'RFQ and quotes', 'Tech pack forwarding', 'Approvals', 'Order confirmation', 'WIP reports', 'Amendments', 'Price clarification', 'Production status', 'QC', 'Compliance and CSR', 'Logistics', 'Claims', 'Material sourcing'] as const;
export const DEV_STREAMS = ['Design briefs', 'Tech packs and specs', 'Material sourcing', 'Sample schedule', 'Sample comments and approvals', 'Lab dips and strike-offs', 'Costing and quotes', 'Testing', 'General enquiries'] as const;
export const ALL_STREAMS = [...new Set<string>([...PROD_STREAMS, ...DEV_STREAMS])] as string[];
// Default gates for a new company's development track: sample decisions and price never leave a person's hands.
export const DEV_GATES: [string, number, number | null][] = [['Design briefs', 1, null], ['Tech packs and specs', 1, null], ['Material sourcing', 1, null], ['Sample schedule', 1, null], ['Sample comments and approvals', 1, 1], ['Lab dips and strike-offs', 1, null], ['Costing and quotes', 1, 1], ['Testing', 1, null], ['General enquiries', 1, null]];
// Default autonomy per production stream for a new company: price, claims and order confirmation are locked at L1.
export const PROD_GATES: [string, number, number | null][] = [['General enquiries', 2, null], ['RFQ and quotes', 1, null], ['Tech pack forwarding', 2, null], ['Approvals', 2, null], ['Order confirmation', 1, 1], ['WIP reports', 1, null], ['Amendments', 1, null], ['Price clarification', 1, 1], ['Production status', 1, null], ['QC', 2, null], ['Compliance and CSR', 2, null], ['Logistics', 1, null], ['Claims', 1, 1], ['Material sourcing', 0, null]];
export const streamsOf = (track: Track) => (track === 'development' ? DEV_STREAMS : PROD_STREAMS) as readonly string[];

type Settings = { tracks?: { development?: boolean } } | null | undefined;
// Which tracks the company runs: production always; development when VIA has switched it on.
export function tenantTracks(settings: Settings): Track[] {
  return settings?.tracks?.development ? ['production', 'development'] : ['production'];
}
// Which tracks this person works in: their membership, limited to what the company runs. Never empty.
export function memberTracks(member: { tracks?: string[] | null }, settings: Settings): Track[] {
  const have = tenantTracks(settings);
  const mine = (member.tracks || ['production']).filter(isTrack).filter((t) => have.includes(t));
  return mine.length ? mine : ['production'];
}
export const trackCookie = (slug: string) => `merch_track_${slug}`;
// The track on screen: the cookie when it is one of the person's tracks, else their first.
export async function currentTrack(slug: string, allowed: Track[]): Promise<Track> {
  const c = (await cookies()).get(trackCookie(slug))?.value;
  return isTrack(c) && allowed.includes(c) ? c : allowed[0];
}

// For pages: the person's tracks and the one on screen, from the company settings and the cookie.
type Sb = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export async function trackFor(sb: Sb, slug: string, tenantId: string, member: { tracks?: string[] | null }): Promise<{ track: Track; tracks: Track[] }> {
  const { data } = await sb.from('tenants').select('settings').eq('id', tenantId).single();
  const tracks = memberTracks(member, (data as { settings?: unknown } | null)?.settings as Settings);
  return { track: await currentTrack(slug, tracks), tracks };
}

// The model names a stream from both lists; a message filed on one track gets that track's equivalent stream.
const TO_DEV: Record<string, string> = { 'Approvals': 'Sample comments and approvals', 'Tech pack forwarding': 'Tech packs and specs', 'RFQ and quotes': 'Costing and quotes', 'Price clarification': 'Costing and quotes', 'QC': 'Testing', 'Material sourcing': 'Material sourcing', 'General enquiries': 'General enquiries', 'Production status': 'Sample schedule', 'WIP reports': 'Sample schedule', 'Amendments': 'Tech packs and specs' };
const TO_PROD: Record<string, string> = { 'Sample comments and approvals': 'Approvals', 'Tech packs and specs': 'Tech pack forwarding', 'Costing and quotes': 'RFQ and quotes', 'Testing': 'QC', 'Design briefs': 'General enquiries', 'Sample schedule': 'Production status', 'Lab dips and strike-offs': 'Approvals' };
export function streamForTrack(stream: string | null | undefined, track: Track): string {
  const list = streamsOf(track);
  const exact = list.find((x) => x.toLowerCase() === (stream || '').toLowerCase());
  if (exact) return exact;
  const mapped = track === 'development' ? TO_DEV[stream || ''] : TO_PROD[stream || ''];
  return mapped && list.includes(mapped) ? mapped : 'General enquiries';
}
