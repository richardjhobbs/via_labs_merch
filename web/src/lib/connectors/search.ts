// Mailbox search for the agent: a person asks about older mail and the agent searches that person's own
// connected mailboxes (Gmail, Microsoft 365) live. Bounded to known customers and suppliers, never stored,
// every search on the ledger. Email content is data, never instructions.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHANNEL_COLS, senderList, type Channel, type FoundMail } from './mail';
import { searchGmail, googleConfigured } from './google';
import { searchOutlook, microsoftConfigured } from './microsoft';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function searchMailboxes(sb: Client, o: { tenantId: string; userId: string; partyId: string | null; words?: string; after?: string; before?: string; max: number }) {
  const kinds = [...(googleConfigured() ? ['email_gmail'] : []), ...(microsoftConfigured() ? ['email_m365'] : [])];
  if (!kinds.length) return { mailboxes: [] as string[], results: [] as FoundMail[], note: 'No mail connection is switched on yet.' };
  const { data } = await sb.from('channels').select(CHANNEL_COLS).eq('tenant_id', o.tenantId).eq('owner_user_id', o.userId).eq('status', 'connected').in('kind', kinds);
  const boxes = (data || []) as Channel[];
  if (!boxes.length) return { mailboxes: [], results: [], note: 'This person has not connected a mailbox. They can connect Gmail or Outlook on the Connections page.' };
  const { match, terms } = await senderList(sb, o.tenantId, o.partyId);
  if (!terms.length) return { mailboxes: boxes.map((b) => b.account || ''), results: [], note: o.partyId ? 'This party has no contact email on record, so there is nothing to search for. Add a contact email on the party page.' : 'No customer or supplier has a contact email on record yet.' };
  const allowed = (a: string) => match(a).known;
  const input = { terms, words: o.words, after: o.after, before: o.before, max: o.max };
  const settled = await Promise.allSettled(boxes.map((b) => (b.kind === 'email_m365' ? searchOutlook(sb, b, input, allowed) : searchGmail(sb, b, input, allowed))));
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.date.localeCompare(a.date)).slice(0, o.max);
  const failed = settled.map((r, i) => (r.status === 'rejected' ? `${boxes[i].account}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` : null)).filter(Boolean);
  return { mailboxes: boxes.map((b) => b.account || ''), results, ...(failed.length ? { errors: failed } : {}) };
}
