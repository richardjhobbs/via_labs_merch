// The safety net for what no connector captures (personal Zalo, WeChat or WhatsApp, a phone call):
// silence becomes an alert. Runs hourly from /api/jobs/drain for every company.
//
//  silence      a milestone owned by the factory, mill or customer is due within 3 days or overdue (up to 14 days)
//               and nothing has come in from that party for 5 days, and nobody has updated the milestone.
//  send_failed  an approved reply could not be sent on its connected channel.
//
// Each alert is raised once per key, emailed to the person responsible (the order's owner, or whoever approved
// the reply), escalated by email to owners and managers after 24 hours, and resolved by itself when the gap
// closes: a message from the party, a milestone update, the reply sent, the order closed.
import type { SupabaseClient } from '@supabase/supabase-js';
import { listOrders } from '@/lib/orders';
import { LABELS, isoOf, today, type MilestoneKey } from '@/lib/core/path';
import { brandedHtml, sendMail } from '@/lib/mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';
const SILENT_DAYS = 5, AHEAD = 3, BEHIND = 14, ESCALATE_HOURS = 24;
const DAY = 86_400_000;

type NewAlert = { kind: 'silence' | 'unsent' | 'send_failed'; key: string; order_id: string | null; party_id: string | null; message_id: string | null; milestone: string | null; due_date: string | null; assignee_user_id: string | null; detail: Record<string, unknown> };

export async function runAlerts(sb: Client, tenantId: string) {
  const now = Date.now(), T = today();
  const out = { raised: 0, resolved: 0, notified: 0, escalated: 0 };
  const [{ data: tenant }, orders, { data: owners }, { data: heard }, { data: touched }, { data: unsent }, { data: open }] = await Promise.all([
    sb.from('tenants').select('slug, name').eq('id', tenantId).single(),
    listOrders(tenantId, { status: 'open' }, sb),
    sb.from('orders').select('id, owner_user_id').eq('tenant_id', tenantId).eq('status', 'open'),
    sb.from('messages').select('party_id, received_at').eq('tenant_id', tenantId).eq('direction', 'in').not('party_id', 'is', null).gte('received_at', new Date(now - 30 * DAY).toISOString()),
    sb.from('milestones').select('order_id, key, updated_at').eq('tenant_id', tenantId).gte('updated_at', new Date(now - 30 * DAY).toISOString()),
    sb.from('messages').select('id, created_at, sent_at, party_id, order_id, channel_id, raw').eq('tenant_id', tenantId).eq('direction', 'out').is('sent_at', null).not('raw->>draft_id', 'is', null),
    sb.from('alerts').select('id, kind, key, order_id, party_id, message_id, milestone, due_date, created_at, assignee_user_id, notified_at, escalated_at, detail').eq('tenant_id', tenantId).eq('status', 'open'),
  ]);
  const lastHeard = new Map<string, number>();
  for (const m of heard || []) { const t = Date.parse(m.received_at); if (t > (lastHeard.get(m.party_id) || 0)) lastHeard.set(m.party_id, t); }
  const lastTouched = new Map<string, number>();
  for (const m of touched || []) { const k = `${m.order_id}:${m.key}`, t = Date.parse(m.updated_at); if (t > (lastTouched.get(k) || 0)) lastTouched.set(k, t); }
  const ownerOf = new Map((owners || []).map((o) => [o.id, o.owner_user_id as string | null]));

  // 1. what should be open now
  const want: NewAlert[] = [];
  for (const o of orders) {
    const seen = new Set<string>();   // one silence alert per order and party: the most urgent milestone
    for (const m of Object.values(o.health.p).sort((x, y) => (x.expected ?? x.f) - (y.expected ?? y.f))) {
      if (m.status === 'done') continue;
      const due = m.expected ?? m.f;
      if (due - T > AHEAD || T - due > BEHIND) continue;
      const party = m.owner === 'factory' ? o.factory : m.owner === 'mill' ? o.mill : m.owner === 'customer' ? o.customer : null;
      if (!party || seen.has(party.id)) continue;
      const since = now - SILENT_DAYS * DAY;
      if ((lastHeard.get(party.id) || 0) > since || (lastTouched.get(`${o.id}:${m.key}`) || 0) > since) continue;
      const days = lastHeard.get(party.id) ? Math.floor((now - lastHeard.get(party.id)!) / DAY) : null;
      seen.add(party.id);
      want.push({ kind: 'silence', key: `silence:${o.id}:${m.key}:${isoOf(due)}`, order_id: o.id, party_id: party.id, message_id: null, milestone: m.key, due_date: isoOf(due), assignee_user_id: ownerOf.get(o.id) || null, detail: { po: o.po, party: party.name, label: LABELS[m.key as MilestoneKey], days_silent: days } });
    }
  }
  const draftIds = (unsent || []).map((m) => (m.raw as { draft_id?: string })?.draft_id).filter(Boolean) as string[];
  const { data: drafts } = draftIds.length ? await sb.from('drafts').select('id, decided_by, title').in('id', draftIds) : { data: [] };
  const draftOf = new Map((drafts || []).map((d) => [d.id, d]));
  const poOf = new Map(orders.map((o) => [o.id, o.po]));
  const partyName = new Map(orders.flatMap((o) => [o.customer, o.factory, o.mill]).filter(Boolean).map((p) => [p!.id, p!.name]));
  for (const m of unsent || []) {
    const raw = (m.raw || {}) as { draft_id?: string; send?: string; send_error?: string };
    const d = raw.draft_id ? draftOf.get(raw.draft_id) : null;
    const base = { order_id: m.order_id, party_id: m.party_id, message_id: m.id, milestone: null, due_date: null, assignee_user_id: d?.decided_by || ownerOf.get(m.order_id || '') || null };
    const detail = { po: poOf.get(m.order_id || '') || null, party: partyName.get(m.party_id || '') || null, title: d?.title || null };
    if (raw.send === 'failed') want.push({ kind: 'send_failed', key: `send_failed:${m.id}`, ...base, detail: { ...detail, error: raw.send_error || null } });
  }

  // 2. close what no longer applies (the party wrote, the milestone moved, the reply went, the order closed)
  const wantKeys = new Set(want.map((w) => w.key));
  for (const a of open || []) {
    if (wantKeys.has(a.key)) continue;
    const heardAfter = a.party_id && (lastHeard.get(a.party_id) || 0) > Date.parse(a.created_at);
    const resolution = a.kind === 'silence' ? (heardAfter ? 'heard' : 'updated') : 'sent';
    await sb.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution }).eq('id', a.id);
    out.resolved++;
  }

  // 3. raise the new ones (unique on tenant + key, so a second pass is a no-op)
  const have = new Set((open || []).map((a) => a.key));
  const fresh = want.filter((w) => !have.has(w.key));
  if (fresh.length) {
    const { data: inserted } = await sb.from('alerts').upsert(fresh.map((w) => ({ ...w, tenant_id: tenantId })), { onConflict: 'tenant_id,key', ignoreDuplicates: true }).select('id, kind, detail, assignee_user_id, due_date, milestone');
    out.raised = inserted?.length || 0;
  }

  // 4. email: the person responsible once, then owners and managers after 24 hours
  const { data: pending } = await sb.from('alerts').select('id, kind, detail, assignee_user_id, due_date, created_at, notified_at, escalated_at').eq('tenant_id', tenantId).eq('status', 'open');
  const toNotify = (pending || []).filter((a) => !a.notified_at);
  const toEscalate = (pending || []).filter((a) => !a.escalated_at && now - Date.parse(a.created_at) > ESCALATE_HOURS * 3_600_000);
  if (toNotify.length || toEscalate.length) {
    const { data: members } = await sb.from('memberships').select('user_id, role').eq('tenant_id', tenantId);
    const managers = (members || []).filter((m) => ['owner', 'manager'].includes(m.role)).map((m) => m.user_id);
    const emailOf = async (id: string) => (await sb.auth.admin.getUserById(id)).data?.user?.email || null;
    const link = `${APP}/app/${tenant?.slug}`;
    const byPerson = new Map<string, typeof toNotify>();
    for (const a of toNotify) for (const u of a.assignee_user_id ? [a.assignee_user_id] : managers) byPerson.set(u, [...(byPerson.get(u) || []), a]);
    for (const [u, list] of byPerson) {
      const to = await emailOf(u); if (!to) continue;
      await sendMail({ to, subject: `VIA Merch: ${list.length} thing${list.length > 1 ? 's' : ''} to check for ${tenant?.name}`, text: cap(list).join('\n') + `\n\n${link}`, html: brandedHtml({ title: 'Something should have arrived and hasn\'t', paragraphs: [...cap(list), 'If you heard on Zalo, WeChat, WhatsApp or by phone, forward it to your VIA address or update the date. Otherwise ask VIA to chase.'], cta: { label: 'Open My day', url: link } }) }).catch(() => null);
      out.notified += list.length;
    }
    await Promise.all(toNotify.map((a) => sb.from('alerts').update({ notified_at: new Date().toISOString() }).eq('id', a.id)));
    if (toEscalate.length) {
      for (const u of managers) {
        const to = await emailOf(u); if (!to) continue;
        await sendMail({ to, subject: `VIA Merch: ${toEscalate.length} open for more than a day at ${tenant?.name}`, text: cap(toEscalate).join('\n') + `\n\n${link}`, html: brandedHtml({ title: 'Still open after 24 hours', paragraphs: cap(toEscalate), cta: { label: 'Open My day', url: link } }) }).catch(() => null);
      }
      await Promise.all(toEscalate.map((a) => sb.from('alerts').update({ escalated_at: new Date().toISOString() }).eq('id', a.id)));
      out.escalated += toEscalate.length;
    }
  }
  return out;
}

const cap = (list: { kind: string; detail: unknown; due_date: string | null }[]) => [...list.slice(0, 12).map(lineOf), ...(list.length > 12 ? [`And ${list.length - 12} more on My day.`] : [])];

function lineOf(a: { kind: string; detail: unknown; due_date: string | null }) {
  const d = (a.detail || {}) as { po?: string; party?: string; label?: string; days_silent?: number | null; title?: string; error?: string };
  if (a.kind === 'silence') return `PO ${d.po}: ${d.label} is due ${a.due_date} and nothing has come in from ${d.party}${d.days_silent != null ? ` for ${d.days_silent} days` : ''}.`;
  if (a.kind === 'unsent') return `PO ${d.po || '-'}: the approved reply to ${d.party || 'the party'} has not been sent yet.`;
  return `PO ${d.po || '-'}: the reply to ${d.party || 'the party'} could not be sent${d.error ? ` (${d.error})` : ''}.`;
}

// Hourly, for every company, within the drain's time budget.
export async function runAllAlerts(sb: Client, deadline: number) {
  const { data: tenants } = await sb.from('tenants').select('id');
  const total = { raised: 0, resolved: 0, notified: 0, escalated: 0 };
  for (const t of tenants || []) {
    if (Date.now() > deadline - 6000) break;
    const r = await runAlerts(sb, t.id);
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
  }
  return total;
}
