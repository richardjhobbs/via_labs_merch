// Layered agents, phase 3: what the manager agent (Mira) watches across desks. Pure functions, tested in
// manager-rules.test.ts. A capacity conflict is two or more open orders at the same factory whose ex-factory
// dates fall within a week of each other in the coming weeks, at least one of them already off plan, and
// owned by different desks (or sitting directly under Mira, where no desk can settle it). Those are the
// clashes a desk cannot decide alone, because protecting one order's slot costs the other desk.

export type ConflictOrder = {
  id: string; po: string; factoryId: string | null; factoryName: string | null;
  parentId: string | null; parentIsManager: boolean;
  exf: number | null; // forecast ex-factory, as a day number
  state: 'red' | 'amber' | 'green';
  instore: string | null; value: number; customer: string | null;
};
export type Conflict = { key: string; factoryId: string; factoryName: string; orders: ConflictOrder[] };

export function capacityConflicts(orders: ConflictOrder[], today: number, opts: { horizon?: number; gap?: number } = {}): Conflict[] {
  const horizon = opts.horizon ?? 28, gap = opts.gap ?? 7;
  const live = orders.filter((o) => o.factoryId && o.exf != null && o.exf >= today - 3 && o.exf <= today + horizon);
  const byFactory = new Map<string, ConflictOrder[]>();
  for (const o of live) byFactory.set(o.factoryId!, [...(byFactory.get(o.factoryId!) || []), o]);
  const out: Conflict[] = [];
  for (const [factoryId, list] of byFactory) {
    if (list.length < 2) continue;
    // join orders that clash: close dates, different owners, at least one off plan
    const parent = new Map(list.map((o) => [o.id, o.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    const clash = (a: ConflictOrder, b: ConflictOrder) => Math.abs(a.exf! - b.exf!) <= gap && (a.state !== 'green' || b.state !== 'green') && (a.parentId !== b.parentId || (a.parentIsManager && b.parentIsManager));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (clash(list.at(i)!, list.at(j)!)) parent.set(find(list.at(i)!.id), find(list.at(j)!.id));
    const groups = new Map<string, ConflictOrder[]>();
    for (const o of list) { const r = find(o.id); groups.set(r, [...(groups.get(r) || []), o]); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const sorted = [...g].sort((a, b) => a.po.localeCompare(b.po));
      out.push({ key: `${factoryId}:${sorted.map((o) => o.id).join(',')}`, factoryId, factoryName: g[0].factoryName || '?', orders: sorted });
    }
  }
  return out;
}

// The order Mira would put them in before reading anything else: earliest in-store date first, then the
// order already furthest off plan, then the larger value. Mira's decision may differ; this is the default.
export function defaultPriority(c: Conflict): string[] {
  const rank = { red: 0, amber: 1, green: 2 } as const;
  return [...c.orders].sort((a, b) => (a.instore || '9999').localeCompare(b.instore || '9999') || rank[a.state] - rank[b.state] || b.value - a.value).map((o) => o.po);
}
