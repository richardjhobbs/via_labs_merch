// The critical path, ported from the demo's store.js. Dates are ISO day strings.
// Forecast for each milestone = actual, else the reported expected date, else the
// later of plan and (each upstream forecast + the planned gap). An open milestone
// whose plan has passed cannot happen before today. A day's jitter upstream is
// absorbed by normal slack; more than that cascades downstream.
export const MILESTONES = ['fabric', 'labdip', 'fit', 'pp', 'cut', 'inline', 'final', 'exf', 'etd', 'eta'] as const;
export type MilestoneKey = (typeof MILESTONES)[number];
export const LABELS: Record<MilestoneKey, string> = { fabric: 'Fabric in', labdip: 'Lab dip', fit: 'Fit', pp: 'PP sample', cut: 'Cut', inline: 'Inline QC', final: 'Final QC', exf: 'Ex-factory', etd: 'ETD', eta: 'ETA' };
export const OWNERS: Record<MilestoneKey, string> = { fabric: 'mill', labdip: 'customer', fit: 'customer', pp: 'customer', cut: 'factory', inline: 'qc', final: 'qc', exf: 'factory', etd: 'forwarder', eta: 'forwarder' };
// planned gaps in days relative to ETD (the demo's GAP); eta = etd + transit
export const GAP: Record<Exclude<MilestoneKey, 'eta'>, number> = { fabric: -48, labdip: -55, fit: -50, pp: -38, cut: -32, inline: -18, final: -6, exf: -4, etd: 0 };
export const TRANSIT: Record<string, number> = { CN: 30, VN: 32, BD: 38, IN: 34, PK: 33, TR: 8, PT: 4, KH: 30, LK: 32, MA: 6, GT: 18 };
const DEPS: Record<MilestoneKey, MilestoneKey[]> = { fabric: [], labdip: [], fit: [], pp: ['fabric', 'labdip', 'fit'], cut: ['pp', 'fabric'], inline: ['cut'], final: ['inline'], exf: ['final'], etd: ['exf'], eta: ['etd'] };

export type MilestoneRow = { key: MilestoneKey; plan_date: string; expected_date?: string | null; actual_date?: string | null; owner_kind?: string | null };
export type MilestoneStatus = 'done' | 'late' | 'risk' | 'due' | 'pending';
export type PathPoint = { key: MilestoneKey; plan: number; f: number; actual?: number; expected?: number; status: MilestoneStatus; slip: number; owner: string };

export const dayOf = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 864e5);
export const isoOf = (day: number) => new Date(day * 864e5).toISOString().slice(0, 10);
export const today = () => Math.floor(Date.now() / 864e5);

export function computePath(rows: MilestoneRow[], T = today()): Record<MilestoneKey, PathPoint> {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r])) as Record<MilestoneKey, MilestoneRow>;
  const out = {} as Record<MilestoneKey, PathPoint>;
  for (const k of MILESTONES) {
    const m = byKey[k];
    if (!m) continue;
    const plan = dayOf(m.plan_date), actual = m.actual_date ? dayOf(m.actual_date) : undefined, expected = m.expected_date ? dayOf(m.expected_date) : undefined;
    let f: number;
    if (actual !== undefined) f = actual;
    else if (expected !== undefined) f = expected;
    else {
      f = Math.max(plan, T);
      for (const d of DEPS[k]) { const up = out[d]; if (!up) continue; const sl = up.f - up.plan; if (sl > 1) f = Math.max(f, plan + sl); }
    }
    const done = actual !== undefined && actual <= T;
    const status: MilestoneStatus = done ? 'done' : plan < T ? 'late' : f > plan ? 'risk' : plan - T <= 7 ? 'due' : 'pending';
    out[k] = { key: k, plan, f, actual, expected, status, slip: f - plan, owner: m.owner_kind || OWNERS[k] };
  }
  return out;
}

export type Health = { p: Record<MilestoneKey, PathPoint>; late: number; risk: number; etdSlip: number; state: 'red' | 'amber' | 'green' };
export function orderHealth(rows: MilestoneRow[], T = today()): Health {
  const p = computePath(rows, T), pts = Object.values(p);
  const late = pts.filter((m) => m.status === 'late').length, risk = pts.filter((m) => m.status === 'risk').length;
  const etdSlip = p.etd?.slip ?? 0;
  return { p, late, risk, etdSlip, state: etdSlip > 0 || late ? 'red' : risk ? 'amber' : 'green' };
}

// Plan dates for a new order from its ETD and the factory's country
export function planFromEtd(etdIso: string, factoryCountry?: string | null): Record<MilestoneKey, string> {
  const etd = dayOf(etdIso), transit = TRANSIT[factoryCountry || ''] ?? 30;
  const out = {} as Record<MilestoneKey, string>;
  for (const k of MILESTONES) out[k] = isoOf(k === 'eta' ? etd + transit : etd + GAP[k as Exclude<MilestoneKey, 'eta'>]);
  return out;
}

// The demo's exception for a slipped ETD: the chain and the cost of each option
export const AIR_PREMIUM_USD = 0.78;
export function slipException(po: string, qty: number, fob: number, h: Health) {
  const p = h.p;
  const root = Object.values(p).find((m) => m.status === 'late' || (m.slip > 0 && m.actual === undefined && m.expected !== undefined));
  if (!root || h.etdSlip <= 0) return null;
  const air = Math.round(qty * AIR_PREMIUM_USD * Math.min(1, h.etdSlip / 7));
  const chain = [{ cls: 'root', t: `${LABELS[root.key]} ${isoOf(root.plan)} → ${isoOf(root.f)}` }];
  for (const k of ['pp', 'cut', 'exf'] as const) if (p[k] && p[k].slip > 0 && k !== root.key) chain.push({ cls: '', t: `${LABELS[k]} ${isoOf(p[k].plan)} → ${isoOf(p[k].f)}` });
  chain.push({ cls: 'risk', t: `ETD ${isoOf(p.etd.plan)} at risk, ${h.etdSlip} day${h.etdSlip > 1 ? 's' : ''} short` });
  chain.push({ cls: 'cost', t: `Airfreight exposure USD ${air.toLocaleString('en-GB')}` });
  return { id: 'EX-' + po, sev: h.etdSlip >= 3 ? 'crit' : 'warn', kind: 'Delay', po, title: `${LABELS[root.key]} ${root.owner === 'customer' ? 'late on the customer side' : 'slipped'} on ${po}`, chain,
    opts: [['Hold ETD, require recovery plan', 'Factory absorbs recovery; no cost to the customer'], ['Split shipment: 2/3 sea, 1/3 air', `Margin takes about USD ${Math.round(air / 1.6).toLocaleString('en-GB')}`], ['Ask the customer for an ETD extension', `Late-delivery chargeback risk 2% = USD ${Math.round(qty * fob * 0.02).toLocaleString('en-GB')}`]] };
}
