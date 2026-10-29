'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';

// Raising or lowering a stream's autonomy. Managers and owners only; the database refuses a level above the cap.
export async function setGate(form: FormData) {
  const slug = String(form.get('tenant')), stream = String(form.get('stream')), level = Number(form.get('level'));
  const { tenant, membership, user } = await requireTenant(slug);
  if (!['owner', 'manager'].includes(membership.role)) redirect(`/app/${slug}/ledger?error=manager`);
  if (!(level >= 0 && level <= 3)) redirect(`/app/${slug}/ledger?error=level`);
  const sb = await supabaseServer();
  const { data: before } = await sb.from('gates').select('level, locked').eq('tenant_id', tenant.id).eq('stream', stream).maybeSingle();
  if (!before || before.level === level) redirect(`/app/${slug}/ledger`);
  const { error } = await sb.from('gates').update({ level, set_by: user.id, updated_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('stream', stream);
  if (error) redirect(`/app/${slug}/ledger?error=${encodeURIComponent(error.message)}`);
  const who = membership.display_name || user.email || 'manager';
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: who, p_actor_user: user.id, p_counterparty: null, p_stream: stream, p_order: null, p_what: `Autonomy for ${stream} ${level > before.level ? 'raised' : 'lowered'} L${before.level} → L${level}`, p_gate: `MANAGER · ${who}`, p_gated: true, p_ref: { from: before.level, to: level } });
  revalidatePath(`/app/${slug}/ledger`);
  redirect(`/app/${slug}/ledger?saved=1`);
}
