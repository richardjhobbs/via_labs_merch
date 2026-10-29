// Invite link: if signed in with the invited email, attach the membership; else send to login.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin, currentUser } from '@/lib/supabase/server';

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = supabaseAdmin();
  const { data: inv } = await sb.from('invites').select('*, tenants(name, slug)').eq('token', token).maybeSingle();
  if (!inv) return <Shell><h1>Invite not found</h1><p className="muted">Ask your manager for a new one.</p></Shell>;
  if (inv.accepted_at) redirect(`/app/${inv.tenants.slug}`);
  if (new Date(inv.expires_at) < new Date()) return <Shell><h1>Invite expired</h1><p className="muted">Ask your manager for a new one.</p></Shell>;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  if ((user.email || '').toLowerCase() !== inv.email.toLowerCase()) return <Shell><h1>Wrong account</h1><p className="muted">This invite is for {inv.email}. You are signed in as {user.email}.</p><form action="/auth/signout" method="post" className="mt-3"><button className="btn">Sign out</button></form></Shell>;
  const initials = (inv.display_name || inv.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('');
  await sb.from('memberships').upsert({ tenant_id: inv.tenant_id, user_id: user.id, role: inv.role, display_name: inv.display_name, initials }, { onConflict: 'tenant_id,user_id' });
  await sb.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  await sb.rpc('ledger_append', { p_tenant: inv.tenant_id, p_channel: 'Console', p_actor: inv.display_name || inv.email, p_actor_user: user.id, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Accepted invite as ${inv.role}`, p_gate: 'Logged', p_gated: false, p_ref: {} });
  redirect(`/app/${inv.tenants.slug}`);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--paper)' }}><div className="card" style={{ maxWidth: 420 }}>{children}<p className="mt-4"><Link href="/">VIA Merch</Link></p></div></main>;
}
