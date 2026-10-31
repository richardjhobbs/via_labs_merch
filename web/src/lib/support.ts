// Support access: VIA staff can open a company's records only under a grant an owner or manager made
// (72 hours, revocable, on the ledger). merch.has_support_access() enforces it in the database for
// RLS reads; these helpers let the app show state and gate the few service-role reads in the console.
import { supabaseAdmin } from './supabase/server';

export const SUPPORT_HOURS = 72;

export type SupportGrant = {
  id: string; tenant_id: string; status: 'requested' | 'granted' | 'declined' | 'revoked'; reason: string;
  requested_by: string | null; requested_by_email: string | null; requested_at: string;
  decided_by: string | null; decided_by_name: string | null; decided_at: string | null;
  expires_at: string | null; opened_at: string | null; ended_by: string | null; ended_at: string | null;
};

export async function activeSupportGrant(tenantId: string): Promise<SupportGrant | null> {
  const { data } = await supabaseAdmin().from('support_access').select('*').eq('tenant_id', tenantId).eq('status', 'granted')
    .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle();
  return (data as SupportGrant | null) || null;
}

export async function pendingSupportRequest(tenantId: string): Promise<SupportGrant | null> {
  const { data } = await supabaseAdmin().from('support_access').select('*').eq('tenant_id', tenantId).eq('status', 'requested')
    .order('requested_at', { ascending: false }).limit(1).maybeSingle();
  return (data as SupportGrant | null) || null;
}

export async function supportHistory(tenantId: string, limit = 10): Promise<SupportGrant[]> {
  const { data } = await supabaseAdmin().from('support_access').select('*').eq('tenant_id', tenantId).order('requested_at', { ascending: false }).limit(limit);
  return (data as SupportGrant[] | null) || [];
}

export const isActive = (g: SupportGrant | null | undefined) => !!g && g.status === 'granted' && !!g.expires_at && new Date(g.expires_at).getTime() > Date.now();
