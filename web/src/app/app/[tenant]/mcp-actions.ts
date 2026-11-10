'use server';
// Settings → Your agents: issue and revoke personal MCP tokens (docs/mcp.md). The secret goes back to the
// client component once and is never in a URL; everything else redirects to the settings page.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { memberTracks } from '@/lib/tracks';
import { issueToken, revokeToken } from '@/lib/mcp/tokens';

export type IssueResult = { token: string; expires: string } | { error: string };

export async function issueMcpToken(slug: string, form: FormData): Promise<IssueResult> {
  const { tenant, memberships, user, viewingAs } = await requireTenant(slug);
  const mine = memberships.find((x) => x.tenant_id === tenant.id);
  if (!mine || viewingAs) return { error: 'own' };
  const sb = await supabaseServer();
  const { data: tn } = await sb.from('tenants').select('settings').eq('id', tenant.id).single();
  const r = await issueToken(
    { tenantId: tenant.id, membershipId: mine.id, userId: user.id, role: mine.role, actor: mine.display_name || user.email || 'member', memberTracks: memberTracks(mine, tn?.settings as never) },
    { name: String(form.get('name') || ''), tracks: form.getAll('tracks').map(String), writes: form.get('writes') === 'on' },
  );
  revalidatePath(`/app/${slug}/settings`);
  return 'error' in r ? { error: String(r.error) } : { token: r.token, expires: r.expires };
}

export async function revokeMcpToken(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, membership, user } = await requireTenant(slug);
  const r = await revokeToken({ tenantId: tenant.id, userId: user.id, role: membership.role, actor: membership.display_name || user.email || 'member' }, String(form.get('id')));
  revalidatePath(`/app/${slug}/settings`);
  redirect(`/app/${slug}/settings?mcp=${'error' in r ? `err_${r.error}` : 'revoked'}#agents`);
}
