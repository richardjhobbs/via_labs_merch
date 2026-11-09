// The provider sends the member back here. Exchange the code, seal the refresh token, save the channel,
// start reading from now, and write the connection on the ledger.
import { NextResponse, type NextRequest } from 'next/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sealAuth, type MailConfig } from '@/lib/connectors/mail';
import { providerOf } from '../providers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  let saved: { state: string; verifier: string; slug: string; want?: string | null } | null = null;
  try { saved = JSON.parse(req.cookies.get('merch_oauth')?.value || 'null'); } catch {}
  const p = providerOf(provider, saved?.want);
  const slug = saved?.slug || '';
  const back = (s: string) => { const r = NextResponse.redirect(new URL(slug ? `/app/${slug}/connections?${s}&gp=${saved?.want === 'drive' ? 'drive' : provider}` : '/app', req.nextUrl.origin)); r.cookies.set('merch_oauth', '', { path: `/api/connect/${provider}`, maxAge: 0 }); return r; };
  if (!p || !saved || !q.get('state') || q.get('state') !== saved.state) return back('gerror=state');
  if (q.get('error')) {
    // Microsoft: the company's admin has to approve the app before members can connect
    const d = `${q.get('error')} ${q.get('error_description') || ''}`;
    return back(/AADSTS(90094|65001|90095)|consent_required|admin/i.test(d) ? 'gerror=adminConsent' : 'gerror=denied');
  }
  const me = await requireTenant(slug);
  if (me.membership.id === 'admin') return back('gerror=support');
  if (me.membership.role === 'viewer') return back('gerror=viewer');

  try {
    const redirectUri = new URL(`/api/connect/${provider}/callback`, req.nextUrl.origin).toString();
    const t = await p.exchange(q.get('code') || '', saved.verifier, redirectUri);
    const granted = (t.scope || '').toLowerCase().split(' ');
    if (!p.scopes.every((s) => granted.some((g) => g === s.toLowerCase() || g.endsWith('/' + s.toLowerCase())))) return back('gerror=scopes');
    if (!t.refresh_token) return back('gerror=refresh');
    const { account, cursor } = await p.start(t.access_token);
    const sb = supabaseAdmin();
    const { data: existing } = await sb.from('channels').select('id, config').eq('tenant_id', me.tenant.id).eq('kind', p.kind).ilike('account', account).maybeSingle();
    const prev = (existing?.config || {}) as MailConfig;
    const config: MailConfig = { connector: p.connector, filter: prev.filter || 'known', label: prev.label || null, label_id: prev.label_id || null, ...cursor, connected_by: me.membership.display_name || me.user.email || undefined };
    const row = { tenant_id: me.tenant.id, kind: p.kind, name: account, account, owner_user_id: me.user.id, status: 'connected', scope: p.kind === 'sheets' ? 'Open picked files only' : p.kind === 'zalo' ? 'Messages to the Official Account; replies after approval' : 'Read new mail from known senders; send after approval', auth_enc: sealAuth({ ...t, refresh_token: t.refresh_token }), config, error: null, last_sync_at: new Date().toISOString() };
    const { error } = existing ? await sb.from('channels').update(row).eq('id', existing.id) : await sb.from('channels').insert(row);
    if (error) throw new Error(error.message);
    const who = me.membership.display_name || me.user.email || 'member';
    const where = config.filter === 'label' ? `the ${p.kind === 'email_m365' ? 'folder' : 'label'} ${config.label}` : 'known customers and suppliers';
    await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${existing ? 'Reconnected' : 'Connected'} ${p.label} ${account}: ${p.ledger.replace('{where}', where)}`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
    return back(`gconnected=${encodeURIComponent(account)}`);
  } catch (e) {
    return back(`gerror=failed&gmsg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 160))}`);
  }
}
