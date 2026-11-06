// Google sends the member back here. Exchange the code, seal the refresh token, save the channel,
// start reading from now (the current history id), and write the connection on the ledger.
import { NextResponse, type NextRequest } from 'next/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { exchangeCode, profile, sealAuth, GMAIL_SCOPES, type GmailConfig } from '@/lib/connectors/google';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let saved: { state: string; verifier: string; slug: string } | null = null;
  try { saved = JSON.parse(req.cookies.get('merch_goauth')?.value || 'null'); } catch {}
  const slug = saved?.slug || '';
  const back = (p: string) => { const r = NextResponse.redirect(new URL(slug ? `/app/${slug}/connections?${p}` : '/app', req.nextUrl.origin)); r.cookies.set('merch_goauth', '', { path: '/api/connect/google', maxAge: 0 }); return r; };
  if (!saved || !q.get('state') || q.get('state') !== saved.state) return back('gerror=state');
  if (q.get('error')) return back('gerror=denied');
  const me = await requireTenant(slug);
  if (me.membership.id === 'admin') return back('gerror=support');
  if (me.membership.role === 'viewer') return back('gerror=viewer');

  try {
    const redirectUri = new URL('/api/connect/google/callback', req.nextUrl.origin).toString();
    const t = await exchangeCode(q.get('code') || '', saved.verifier, redirectUri);
    const granted = (t.scope || '').split(' ');
    if (!GMAIL_SCOPES.every((s) => granted.includes(s))) return back('gerror=scopes');
    if (!t.refresh_token) return back('gerror=refresh');
    const p = await profile(t.access_token);
    const account = p.emailAddress.toLowerCase();
    const sb = supabaseAdmin();
    const { data: existing } = await sb.from('channels').select('id, config').eq('tenant_id', me.tenant.id).eq('kind', 'email_gmail').ilike('account', account).maybeSingle();
    const prev = (existing?.config || {}) as GmailConfig;
    const config: GmailConfig = { connector: 'gmail', filter: prev.filter || 'known', label: prev.label || null, label_id: prev.label_id || null, history_id: p.historyId, connected_by: me.membership.display_name || me.user.email || undefined };
    const row = { tenant_id: me.tenant.id, kind: 'email_gmail', name: account, account, owner_user_id: me.user.id, status: 'connected', scope: 'Read new mail from known senders; send after approval', auth_enc: sealAuth({ ...t, refresh_token: t.refresh_token }), config, error: null, last_sync_at: new Date().toISOString() };
    const { error } = existing ? await sb.from('channels').update(row).eq('id', existing.id) : await sb.from('channels').insert(row);
    if (error) throw new Error(error.message);
    const who = me.membership.display_name || me.user.email || 'member';
    await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: me.user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `${existing ? 'Reconnected' : 'Connected'} Gmail ${account}: reads new mail from ${config.filter === 'label' ? `the label ${config.label}` : 'known customers and suppliers'}, sends only approved replies`, p_gate: 'SETUP', p_gated: true, p_ref: {} });
    return back(`gconnected=${encodeURIComponent(account)}`);
  } catch (e) {
    return back(`gerror=failed&gmsg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 160))}`);
  }
}
