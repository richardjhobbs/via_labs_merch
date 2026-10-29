// Who is signed in, which tenants they belong to, and whether they run the VIA admin console.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Role = 'owner' | 'manager' | 'merchandiser' | 'qc' | 'compliance' | 'logistics' | 'viewer';
export type Membership = { id: string; tenant_id: string; role: Role; display_name: string | null; initials: string | null; title: string | null; locale: string | null; tenants: { id: string; slug: string; name: string; kind: string; locale: string; tz: string; currency: string } };

// cache(): layout and page both call this; one lookup per request.
export const me = cache(async function me() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: memberships }, { data: admin }] = await Promise.all([
    sb.from('memberships').select('id, tenant_id, role, display_name, initials, title, locale, tenants(id, slug, name, kind, locale, tz, currency)').eq('user_id', user.id),
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
  if (!membership) {
    if (m.isAdmin) {
      // admins may open any tenant; act as a manager
      const sb = await supabaseServer();
      const { data: t } = await sb.from('tenants').select('id, slug, name, kind, locale, tz, currency').eq('slug', slug).maybeSingle();
      if (!t) redirect('/app');
      return { ...m, membership: { id: 'admin', tenant_id: t.id, role: 'manager' as Role, display_name: 'VIA admin', initials: 'VIA', title: 'VIA Labs', locale: null, tenants: t } as Membership, tenant: t };
    }
    redirect('/app');
  }
  return { ...m, membership, tenant: membership.tenants };
}

export async function requireAdmin() {
  const m = await requireMe();
  if (!m.isAdmin) redirect('/app');
  return m;
}
