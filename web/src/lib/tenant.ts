// Who is signed in, which tenants they belong to, and whether they run the VIA admin console.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

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
  // A VIA admin may view the workspace as any member (demo and support); the ledger says so.
  if (m.isAdmin) {
    const asId = (await cookies()).get(`merch_viewas_${slug}`)?.value;
    if (asId) {
      const sb = await supabaseServer();
      const { data: row } = await sb.from('memberships').select('id, tenant_id, role, display_name, initials, title, locale, scopes, tenants(id, slug, name, kind, locale, tz, currency)').eq('id', asId).maybeSingle();
      const mm = row as unknown as Membership | null;
      if (mm && mm.tenants.slug === slug) return { ...m, membership: { ...mm, display_name: `${mm.display_name || 'member'} (viewed by VIA admin)` }, tenant: mm.tenants, viewingAs: mm.id };
    }
  }
  if (!membership) {
    if (m.isAdmin) {
      // admins may open any tenant; act as a manager
      const sb = await supabaseServer();
      const { data: t } = await sb.from('tenants').select('id, slug, name, kind, locale, tz, currency').eq('slug', slug).maybeSingle();
      if (!t) redirect('/app');
      return { ...m, membership: { id: 'admin', tenant_id: t.id, role: 'manager' as Role, display_name: 'VIA admin', initials: 'VIA', title: 'VIA Labs', locale: null, scopes: {}, tenants: t } as Membership, tenant: t, viewingAs: null as string | null };
    }
    redirect('/app');
  }
  return { ...m, membership, tenant: membership.tenants, viewingAs: null as string | null };
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
