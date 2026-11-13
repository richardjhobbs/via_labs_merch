// Updates on the support desk: what VIA Labs published, filtered to what this company may see.
// Members never read merch.announcements directly; this runs under the service role after supportMe().
import { supabaseAdmin } from '@/lib/supabase/server';
import type { TenantSettings } from '@/lib/features';
import { visibility, type Audience } from './updates-rules';

export type Update = { id: string; number: number; title: string; body: string; published_at: string; locked: boolean; unread: boolean; audience: Audience['kind'] };

export async function updatesFor(tenantId: string, userId: string, partner: boolean, locale: string, limit = 50): Promise<Update[]> {
  const sb = supabaseAdmin();
  const [{ data: rows }, { data: tenant }, { data: reads }] = await Promise.all([
    sb.from('announcements').select('id, number, title, body, translations, audience, published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(200),
    sb.from('tenants').select('settings').eq('id', tenantId).single(),
    sb.from('announcement_reads').select('announcement_id').eq('user_id', userId),
  ]);
  const seen = new Set((reads || []).map((r) => r.announcement_id));
  const settings = (tenant?.settings || {}) as TenantSettings;
  const out: Update[] = [];
  for (const r of rows || []) {
    const a = r.audience as Audience;
    const v = visibility(a, tenantId, settings, partner);
    if (v === 'hidden') continue;
    const tr = (r.translations as Record<string, { title?: string; body?: string }> | null)?.[locale];
    out.push({ id: r.id, number: r.number, title: tr?.title || r.title, body: tr?.body || r.body, published_at: r.published_at!, locked: v === 'locked', unread: !seen.has(r.id), audience: a?.kind || 'all' });
    if (out.length >= limit) break;
  }
  return out;
}

export async function markRead(tenantId: string, userId: string, ids: string[]) {
  if (!ids.length) return;
  await supabaseAdmin().from('announcement_reads').upsert(ids.map((id) => ({ announcement_id: id, user_id: userId, tenant_id: tenantId })), { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
}
