// Updates on the support desk: what VIA Labs published, filtered to what this company may see.
// Members never read merch.announcements directly; this runs under the service role after supportMe().
import { isQuiet } from '@/lib/testers';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { TenantSettings } from '@/lib/features';
import { visibility, type Audience } from './updates-rules';
import { sendMail, brandedHtml } from '@/lib/mail';
import { LOCALES } from '@/i18n/locales';

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

// On publish: one email to each owner and manager of every company the update is theirs for (not the ones
// that would see it as available on request), in the person's language, with a link to the full text.
export async function emailUpdate(id: string): Promise<number> {
  const sb = supabaseAdmin();
  const { data: a } = await sb.from('announcements').select('id, title, body, translations, audience, status').eq('id', id).maybeSingle();
  if (!a || a.status !== 'published') return 0;
  const [{ data: tenants }, { data: leads }] = await Promise.all([
    sb.from('tenants').select('id, slug, locale, settings'),
    sb.from('memberships').select('tenant_id, user_id, locale').in('role', ['owner', 'manager']),
  ]);
  const base = (process.env.NEXT_PUBLIC_SUPPORT_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz').replace(/\/$/, '');
  const tr = (a.translations || {}) as Record<string, { title?: string; body?: string }>;
  let sent = 0;
  for (const t of tenants || []) {
    if (isQuiet(t.settings) || visibility(a.audience as Audience, t.id, t.settings as TenantSettings) !== 'yes') continue;
    for (const m of (leads || []).filter((x) => x.tenant_id === t.id && x.user_id)) {
      const to = (await sb.auth.admin.getUserById(m.user_id as string)).data?.user?.email;
      if (!to) continue;
      const l = (LOCALES as readonly string[]).includes(m.locale || '') ? (m.locale as string) : (LOCALES as readonly string[]).includes(t.locale || '') ? t.locale : 'en';
      const title = tr[l]?.title || a.title, body = tr[l]?.body || a.body;
      const label = ((await import(`../../../messages/${l}.json`)).default as { help: { readMore: string } }).help.readMore;
      const url = `${base}/support/${t.slug}/updates`;
      const ok = await sendMail({ to, subject: `VIA Merch: ${title}`, text: `${body}\n\n${url}`, html: brandedHtml({ title, paragraphs: body.split(/\n\s*\n/).slice(0, 6), cta: { label, url } }) }).then(() => true).catch(() => false);
      if (ok) sent++;
    }
  }
  await sb.from('announcements').update({ emailed_at: new Date().toISOString(), emailed_count: sent }).eq('id', id);
  return sent;
}
