'use server';
// Dismissing an update from the workspace notification marks it read for this person.
import { requireTenant } from '@/lib/tenant';
import { markRead } from '@/lib/helpdesk/updates';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function dismissUpdates(slug: string, ids: string[]) {
  const me = await requireTenant(slug, { partner: true });
  await markRead(me.tenant.id, me.user.id, ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50));
}

// Dismissing a ticket notice marks the person's own ticket as seen.
export async function dismissTicket(slug: string, id: string) {
  const me = await requireTenant(slug, { partner: true });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await supabaseAdmin().from('support_tickets').update({ person_seen_at: new Date().toISOString() }).eq('id', id).eq('opened_by', me.user.id);
}
