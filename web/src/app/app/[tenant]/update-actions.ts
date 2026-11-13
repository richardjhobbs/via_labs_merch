'use server';
// Dismissing an update from the workspace notification marks it read for this person.
import { requireTenant } from '@/lib/tenant';
import { markRead } from '@/lib/helpdesk/updates';

export async function dismissUpdates(slug: string, ids: string[]) {
  const me = await requireTenant(slug, { partner: true });
  await markRead(me.tenant.id, me.user.id, ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50));
}
