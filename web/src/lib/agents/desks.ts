// Layered agents, phase 2: desks, routing of drafts through the layers, and open decisions that rise.
// The rules live in authority.ts (pure, tested); this file applies them to the database.
// - routeDraft: a draft an agent queued on a production order is approved by the lowest agent allowed to
//   (gate and ceiling both L2+, stream not capped), else it waits for the person of the lowest layer that has
//   one, with an escalation message to the layer above.
// - recordDecision: a person's approve or reject closes the escalation and sends the decision down.
// - riseStale: hourly, a decision open longer than the company's limit (default 24 h) moves one layer up and
//   that person (or the owners and managers at the top) is emailed.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { recordOutbound } from '@/lib/threads';
import { brandedHtml, sendMail } from '@/lib/mail';
import { decide, effectiveLevel, nextUp, type ChainLink, type Gate, type Layer } from './authority';
import { ensureOrderAgent, parentFor } from './order-agent';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz';

type AgentRow = { id: string; name: string; layer: Layer; ceilings: Record<string, number> | null; person_id: string | null; parent_agent_id: string | null; status: string };

// The order agent and every layer above it, each with the user id of the person it works for.
export async function chainFor(sb: Client, tenantId: string, orderId: string): Promise<ChainLink[]> {
  const orderAgentId = await ensureOrderAgent(sb, tenantId, orderId);
  const links: AgentRow[] = [];
  let id: string | null = orderAgentId;
  for (let i = 0; id && i < 4; i++) {
    const { data }: { data: AgentRow | null } = await sb.from('agents').select('id, name, layer, ceilings, person_id, parent_agent_id, status').eq('id', id).maybeSingle();
    if (!data) break;
    links.push(data); id = data.parent_agent_id;
  }
  const pids = links.map((l) => l.person_id).filter(Boolean) as string[];
  const { data: people } = pids.length ? await sb.from('memberships').select('id, user_id').in('id', pids) : { data: [] };
  const uid = new Map((people || []).map((p) => [p.id as string, p.user_id as string]));
  // a paused agent approves nothing; decisions pass through it to its person or the layer above
  return links.map((l) => ({ agentId: l.id, name: l.name, layer: l.layer, ceilings: l.status === 'paused' ? null : l.ceilings, personUserId: l.person_id ? uid.get(l.person_id) || null : null }));
}

async function gate(sb: Client, tenantId: string, stream: string): Promise<Gate> {
  const { data } = await sb.from('gates').select('level, locked').eq('tenant_id', tenantId).eq('track', 'production').eq('stream', stream).maybeSingle();
  return { level: data?.level ?? 1, locked: data?.locked ?? null };
}

// Put every order agent of a company under the desk its rule now matches (after a desk is added, edited or removed).
export async function reassignOrders(sb: Client, tenantId: string) {
  const { data: agents } = await sb.from('agents').select('id, order_id, parent_agent_id').eq('tenant_id', tenantId).eq('layer', 'order').eq('status', 'active');
  let moved = 0;
  for (const a of agents || []) {
    const p = await parentFor(sb, tenantId, a.order_id as string);
    if (p && p !== a.parent_agent_id) { await sb.from('agents').update({ parent_agent_id: p }).eq('id', a.id); moved++; }
  }
  return moved;
}

export async function routeDraft(tenantId: string, draftId: string) {
  const sb = supabaseAdmin();
  const { data: d } = await sb.from('drafts').select('id, seq, title, body, body_en, lang, stream, status, track, order_id, party_id, source_message_id, style_id').eq('id', draftId).single();
  if (!d || d.status !== 'queued' || d.track === 'development' || !d.order_id) return { routed: false as const };
  const chain = await chainFor(sb, tenantId, d.order_id);
  const g = await gate(sb, tenantId, d.stream);
  const { approver, waitingAt } = decide(chain, g, d.stream);
  const orderAgent = chain[0];
  if (approver) {
    const lvl = effectiveLevel(g, approver, d.stream);
    await sb.from('drafts').update({ status: 'approved', agent_id: orderAgent.agentId, decided_at: new Date().toISOString(), decision_note: `AUTO · ${approver.name} L${lvl}`, waiting_layer: null, waiting_since: null }).eq('id', d.id);
    await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Draft', p_actor: approver.name, p_actor_user: null, p_counterparty: null, p_stream: d.stream, p_order: d.order_id, p_what: `Approved Q-${d.seq} under L${lvl} (gate and ${approver.layer} ceiling): ${d.title}`, p_gate: `AUTO · ${approver.layer} L${lvl}`, p_gated: false, p_ref: { draft_id: d.id, approver_agent: approver.agentId } });
    await recordOutbound(tenantId, { id: d.id, body: d.body, body_en: d.body_en, lang: d.lang, stream: d.stream, party_id: d.party_id, order_id: d.order_id, source_message_id: d.source_message_id, track: d.track, style_id: d.style_id }, approver.name);
    if (approver.agentId !== orderAgent.agentId) await sb.from('agent_messages').insert({ tenant_id: tenantId, from_agent_id: approver.agentId, to_agent_id: orderAgent.agentId, kind: 'decision', order_id: d.order_id, draft_id: d.id, status: 'closed', closed_at: new Date().toISOString(), body: { title: d.title, decision: 'approved', by: approver.name, level: lvl } });
    return { routed: true as const, approvedBy: approver.name, level: lvl };
  }
  const at = waitingAt!;
  await sb.from('drafts').update({ agent_id: orderAgent.agentId, waiting_layer: at.layer, waiting_since: new Date().toISOString(), assignee_user_id: at.personUserId }).eq('id', d.id);
  // the layer above sees every decision waiting under it
  const above = chain[1];
  if (above) await sb.from('agent_messages').insert({ tenant_id: tenantId, from_agent_id: orderAgent.agentId, to_agent_id: above.agentId, kind: 'escalation', order_id: d.order_id, draft_id: d.id, body: { title: d.title, stream: d.stream, why: g.locked != null ? 'capped' : 'above ceiling', waiting_at: at.layer, waiting_for: at.name } });
  return { routed: true as const, waitingAt: at.layer, waitingFor: at.name };
}

// A person approved or rejected: close the open escalation and send the decision down to the order agent.
export async function recordDecision(tenantId: string, draftId: string, status: 'approved' | 'rejected', userId: string, who: string) {
  const sb = supabaseAdmin();
  const { data: d } = await sb.from('drafts').select('id, title, order_id, agent_id').eq('id', draftId).single();
  if (!d?.order_id) return;
  const now = new Date().toISOString();
  await sb.from('agent_messages').update({ status: 'answered', decided_by: userId, closed_at: now }).eq('draft_id', draftId).eq('kind', 'escalation').eq('status', 'open');
  await sb.from('drafts').update({ waiting_layer: null, waiting_since: null }).eq('id', draftId);
  if (d.agent_id) await sb.from('agent_messages').insert({ tenant_id: tenantId, from_agent_id: null, to_agent_id: d.agent_id, kind: 'decision', order_id: d.order_id, draft_id: draftId, status: 'closed', closed_at: now, decided_by: userId, body: { title: d.title, decision: status, by: who } });
}

// Hourly: decisions left open past the limit move one layer up, with an email to whoever now holds them.
export async function riseStale(sb: Client, tenantId: string) {
  const { data: t } = await sb.from('tenants').select('name, slug, settings').eq('id', tenantId).single();
  const hours = Number((t?.settings as { agents?: { escalate_hours?: number } } | null)?.agents?.escalate_hours) || 24;
  const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
  const { data: stale } = await sb.from('drafts').select('id, seq, title, order_id, waiting_layer').eq('tenant_id', tenantId).eq('status', 'queued').not('waiting_layer', 'is', null).lt('waiting_since', cutoff).limit(40);
  const mail = new Map<string, string[]>(); // user id or '*' (owners and managers) -> lines
  let risen = 0;
  for (const d of stale || []) {
    const chain = await chainFor(sb, tenantId, d.order_id as string);
    const cur = chain.find((l) => l.layer === d.waiting_layer);
    const next = nextUp(chain, d.waiting_layer as Layer);
    if (!next || !cur) continue;
    await sb.from('drafts').update({ waiting_layer: next.layer, waiting_since: new Date().toISOString(), assignee_user_id: next.personUserId }).eq('id', d.id);
    await sb.from('agent_messages').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('draft_id', d.id).eq('kind', 'escalation').eq('status', 'open');
    await sb.from('agent_messages').insert({ tenant_id: tenantId, from_agent_id: cur.agentId, to_agent_id: next.agentId, kind: 'escalation', order_id: d.order_id, draft_id: d.id, body: { title: d.title, why: `open more than ${hours} hours`, waiting_at: next.layer, waiting_for: next.name } });
    await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Workspace', p_actor: cur.name, p_actor_user: null, p_counterparty: null, p_stream: null, p_order: d.order_id, p_what: `Q-${d.seq} open more than ${hours} hours at ${cur.name}; moved up to ${next.name}: ${d.title}`, p_gate: 'Logged', p_gated: false, p_ref: { draft_id: d.id } });
    const key = next.personUserId || '*';
    mail.set(key, [...(mail.get(key) || []), `Q-${d.seq}: ${d.title}`]);
    risen++;
  }
  if (mail.size) {
    const admin = supabaseAdmin();
    const { data: tops } = await sb.from('memberships').select('user_id').eq('tenant_id', tenantId).in('role', ['owner', 'manager']);
    const link = `${APP}/app/${t?.slug}/queue`;
    for (const [key, lines] of mail) {
      const uids = key === '*' ? (tops || []).map((x) => x.user_id as string) : [key];
      for (const u of uids) {
        const { data: who } = await admin.auth.admin.getUserById(u);
        const to = who?.user?.email; if (!to) continue;
        const title = `${lines.length} decision${lines.length > 1 ? 's' : ''} now with you at ${t?.name}`;
        await sendMail({ to, subject: `VIA Merch: ${title}`, text: `${lines.join('\n')}\n\nThese waited more than ${hours} hours at the layer below.\n${link}`, html: brandedHtml({ title, paragraphs: [...lines.slice(0, 12), `These waited more than ${hours} hours at the layer below.`], cta: { label: 'Open the approval queue', url: link } }) }).catch(() => null);
      }
    }
  }
  return risen;
}

export async function riseAll(sb: Client, deadline: number) {
  const { data: tenants } = await sb.from('drafts').select('tenant_id').eq('status', 'queued').not('waiting_layer', 'is', null).limit(500);
  let n = 0;
  for (const id of [...new Set((tenants || []).map((x) => x.tenant_id as string))]) { if (Date.now() > deadline - 4000) break; n += await riseStale(sb, id); }
  return n;
}
