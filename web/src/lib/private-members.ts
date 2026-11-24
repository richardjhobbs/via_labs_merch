// Database side of private member lists; the rules and pure helpers are in private-members-core.ts.
import { cache } from 'react';
import { supabaseAdmin } from './supabase/server';
import { membersPrivate, maskerOf, type Masker } from './private-members-core';
export * from './private-members-core';

export const tenantSettings = cache(async (tenantId: string) => {
  const { data } = await supabaseAdmin().from('tenants').select('settings').eq('id', tenantId).maybeSingle();
  return (data?.settings || {}) as Record<string, unknown>;
});

// The masker for one person in one company, or null when they may see everyone.
export const maskerFor = cache(async (tenantId: string, userId: string | null | undefined): Promise<Masker | null> => {
  if (!membersPrivate(await tenantSettings(tenantId))) return null;
  const sb = supabaseAdmin();
  const [{ data: members }, { data: invites }] = await Promise.all([
    sb.from('memberships').select('user_id, role, display_name').eq('tenant_id', tenantId),
    sb.from('invites').select('display_name').eq('tenant_id', tenantId).is('accepted_at', null),
  ]);
  const mine = (members || []).find((m) => m.user_id === userId);
  if (mine?.role === 'owner') return null;
  const own = (mine?.display_name || '').trim();
  const others = [...(members || []).filter((m) => m.user_id !== userId).map((m) => m.display_name || ''), ...(invites || []).map((i) => i.display_name || '')];
  return maskerOf(others.filter((n) => n.trim() !== own));
});

