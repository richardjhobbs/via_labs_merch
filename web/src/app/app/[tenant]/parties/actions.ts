'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';

const Party = z.object({ name: z.string().min(2).max(120), kind: z.string().max(20), country: z.string().max(2).optional(), city: z.string().max(60).optional(), lang: z.string().max(5).optional(), tier: z.string().optional(), contact_name: z.string().max(80).optional(), contact_email: z.string().max(120).optional(), contact_phone: z.string().max(30).optional() });

export async function addParty(form: FormData) {
  const slug = String(form.get('tenant'));
  const { tenant, membership, user } = await requireTenant(slug);
  const p = Party.safeParse(Object.fromEntries(form));
  if (!p.success || membership.role === 'viewer') redirect(`/app/${slug}/parties?error=${encodeURIComponent('Check the form')}`);
  const d = p.data, sb = await supabaseServer();
  const { data: party, error } = await sb.from('parties').insert({ tenant_id: tenant.id, kind: d.kind, name: d.name, short: d.name.split(/\s+/)[0], country: d.country?.toUpperCase() || null, city: d.city || null, lang: d.lang || 'en', tier: d.tier ? Number(d.tier) : null, meta: { source: 'manual' } }).select('id').single();
  if (error || !party) redirect(`/app/${slug}/parties?error=${encodeURIComponent(error?.message || 'failed')}`);
  if (d.contact_name || d.contact_email || d.contact_phone) await sb.from('contacts').insert({ tenant_id: tenant.id, party_id: party.id, name: d.contact_name || d.contact_email || d.contact_phone || '', email: d.contact_email || null, phone: d.contact_phone || null, lang: d.lang || null, is_primary: true });
  await sb.rpc('ledger_append', { p_tenant: tenant.id, p_channel: 'Console', p_actor: membership.display_name || user.email, p_actor_user: user.id, p_counterparty: d.name, p_stream: 'Setup', p_order: null, p_what: `Added ${d.kind.replace('_', ' ')} ${d.name}`, p_gate: 'Logged', p_gated: false, p_ref: {} });
  revalidatePath(`/app/${slug}/parties`);
  redirect(`/app/${slug}/parties`);
}
