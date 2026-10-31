// Who is signed in, which tenants they belong to, and whether they run the VIA admin console.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer, supabaseAdmin } from './supabase/server';
import { activeSupportGrant } from './support';

export type Role = 'owner' | 'manager' | 'merchandiser' | 'qc' | 'compliance' | 'logistics' | 'viewer';
export type Membership = { id: string; tenant_id: string; role: Role; display_name: string | null; initials: string | null; title: string | null; locale: string | null; scopes: { parties?: string[] }; tenants: { id: string; slug: string; name: string; kind: string; locale: string; tz: string; currency: string } };

// cache(): layout and page both call this; one lookup per request.
export const me = cache(async function me() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: memberships }, { data: admin }] = await Promise.all([
    sb.from('memberships').select('id, tenant_id, role, display_name, initials, title, locale, scopes, tenants(id, slug, name, kind, locale, tz, currency)').eq('user_id', user.id),
    sb.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);
  return { user, memberships: (memberships || []) as unknown as Membership[], isAdmin: !!admin };
});

export async function requireMe() {
  const m = await me();
  if (!m) redirect('/login');
  return m;
}

export async function requireTenant(slug: string) {
  const m = await requireMe();
  const membership = m.memberships.find((x) => x.tenants.slug === slug);
  // VIA staff who are not members open a workspace only under support access the company granted
  // (merch.support_access, 72 hours, revocable). The database policies enforce the same rule for reads;
  // this keeps the app honest too, and records the first opening on the company's ledger.
  if (m.isAdmin && !membership) {
    const sb = await supabaseServer();
    const { data: t } = await sb.from('tenants').select('id, slug, name, kind, locale, tz, currency').eq('slug', slug).maybeSingle();
    if (!t) redirect('/app');
    const grant = await activeSupportGrant(t.id);
    if (!grant) redirect(`/admin/tenants/${t.id}?error=${encodeURIComponent('This company has not granted support access. Request it below; an owner or manager decides.')}`);
    if (!grant.opened_at) {
      const admin = supabaseAdmin();
      await admin.from('support_access').update({ opened_at: new Date().toISOString() }).eq('id', grant.id);
      await admin.rpc('ledger_append', { p_tenant: t.id, p_channel: 'Console', p_actor: `VIA Labs (${m.user.email})`, p_actor_user: m.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `VIA Labs opened the workspace under support access (until ${new Date(grant.expires_at!).toLocaleString('en-GB')}): ${grant.reason}`, p_gate: 'ADMIN', p_gated: true, p_ref: { support_access: grant.id } });
    }
    const asId = (await cookies()).get(`merch_viewas_${slug}`)?.value;
    if (asId) {
      const { data: row } = await sb.from('memberships').select('id, tenant_id, role, display_name, initials, title, locale, scopes, tenants(id, slug, name, kind, locale, tz, currency)').eq('id', asId).maybeSingle();
      const mm = row as unknown as Membership | null;
      if (mm && mm.tenants.slug === slug) return { ...m, membership: { ...mm, display_name: `${mm.display_name || 'member'} (viewed by VIA Labs)` }, tenant: mm.tenants, viewingAs: mm.id, support: grant };
    }
    return { ...m, membership: { id: 'admin', tenant_id: t.id, role: 'manager' as Role, display_name: 'VIA Labs', initials: 'VIA', title: 'VIA Labs', locale: null, scopes: {}, tenants: t } as Membership, tenant: t, viewingAs: null as string | null, support: grant };
  }
  if (!membership) redirect('/app');
  return { ...m, membership, tenant: membership.tenants, viewingAs: null as string | null, support: null as Awaited<ReturnType<typeof activeSupportGrant>> };
}

// Which customers a person sees: null means all (owners, managers, unscoped members).
export function scopeOf(m: Pick<Membership, 'role' | 'scopes'>): string[] | null {
  if (['owner', 'manager'].includes(m.role)) return null;
  const p = m.scopes?.parties;
  return p && p.length ? p : null;
}

export async function requireAdmin() {
  const m = await requireMe();
  if (!m.isAdmin) redirect('/app');
  return m;
}
