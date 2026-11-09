// Who may decide a draft. Pure functions, no database, so the rules can be tested on their own
// (authority.test.ts). An agent may approve and send a draft only when the stream is not capped, the company
// gate for the stream is L2 or higher, and the agent's own ceiling for the stream is L2 or higher. Whichever
// of gate and ceiling is lower wins. A missing ceiling means L1 (draft only). Anything no agent may approve
// goes to the person of the lowest layer that has one, and rises a layer when left open too long.

export type Layer = 'order' | 'desk' | 'manager';
export type Gate = { level: number; locked: number | null };
export type ChainLink = { agentId: string; name: string; layer: Layer; ceilings: Record<string, number> | null; personUserId: string | null };

const MAX_CEILING: Record<Layer, number> = { order: 3, desk: 3, manager: 3 };

export function ceilingOf(link: Pick<ChainLink, 'layer' | 'ceilings'>, stream: string) {
  const c = link.ceilings?.[stream];
  return typeof c === 'number' && c >= 0 ? Math.min(c, MAX_CEILING[link.layer]) : 1;
}

// The level an agent may act at on a stream: the lower of the company gate (and its cap) and its own ceiling.
export function effectiveLevel(gate: Gate, link: Pick<ChainLink, 'layer' | 'ceilings'>, stream: string) {
  return Math.min(gate.level, gate.locked ?? 3, ceilingOf(link, stream));
}

// A capped stream (price, claims, order confirmation, sample decisions) is always a person's decision.
export function mayApprove(gate: Gate, link: Pick<ChainLink, 'layer' | 'ceilings'>, stream: string) {
  if (gate.locked != null) return false;
  return effectiveLevel(gate, link, stream) >= 2;
}

// Walk the chain from the order agent up: the first agent allowed to approve does; otherwise the decision
// waits for the person of the lowest layer that has one (a layer with no person is skipped).
export function decide(chain: ChainLink[], gate: Gate, stream: string): { approver: ChainLink | null; waitingAt: ChainLink | null } {
  const approver = chain.find((l) => mayApprove(gate, l, stream)) || null;
  if (approver) return { approver, waitingAt: null };
  return { approver: null, waitingAt: chain.find((l) => l.personUserId) || chain.at(-1) || null };
}

// The next layer up, when a decision has waited too long at `current`.
export function nextUp(chain: ChainLink[], current: Layer): ChainLink | null {
  const i = chain.findIndex((l) => l.layer === current);
  if (i < 0) return null;
  return chain.slice(i + 1).find((l) => l.personUserId || l.layer === 'manager') || null;
}

// Which desk an order belongs to: a hand-picked list wins, then customer, supplier and category rules,
// in the order the desks were created. No match: the order sits directly under the manager agent.
export type DeskRule = { by: 'customer' | 'supplier' | 'category' | 'list'; ids?: string[]; categories?: string[]; order_ids?: string[] };
export type OrderKey = { id: string; customer_id: string | null; factory_id: string | null; mill_id: string | null; category: string | null };
export function deskFor<T extends { id: string; desk_rule: DeskRule | null }>(desks: T[], o: OrderKey): T | null {
  const hit = (d: T, by: DeskRule['by']) => {
    const r = d.desk_rule;
    if (!r || r.by !== by) return false;
    if (by === 'list') return (r.order_ids || []).includes(o.id);
    if (by === 'customer') return !!o.customer_id && (r.ids || []).includes(o.customer_id);
    if (by === 'supplier') return (r.ids || []).some((x) => x === o.factory_id || x === o.mill_id);
    return !!o.category && (r.categories || []).some((c) => c.trim().toLowerCase() === o.category!.trim().toLowerCase());
  };
  for (const by of ['list', 'customer', 'supplier', 'category'] as const) { const d = desks.find((x) => hit(x, by)); if (d) return d; }
  return null;
}
