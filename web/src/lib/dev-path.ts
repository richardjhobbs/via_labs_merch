// The development schedule: the same forecast rule as the production critical path (core/path.ts), keyed from a
// template instead of a fixed enum. Plan dates come from the customer's target delivery and the template's gaps;
// a reported slip moves every dependent step. The company default lives here; a company or customer template in
// merch.schedule_templates overrides it.
import { dayOf, isoOf, today, type MilestoneStatus } from './core/path';

export type Step = { key: string; label: string; gap: number; deps: string[]; owner: 'customer' | 'factory' | 'mill' | 'us' };
// gaps in days from the bulk target delivery: development ends at adoption, about 100 days before goods are due
export const DEFAULT_STEPS: Step[] = [
  { key: 'brief_in', label: 'Brief received', gap: -200, deps: [], owner: 'customer' },
  { key: 'tech_pack', label: 'Tech pack', gap: -185, deps: ['brief_in'], owner: 'customer' },
  { key: 'materials', label: 'Materials sourced', gap: -165, deps: ['tech_pack'], owner: 'mill' },
  { key: 'proto', label: 'Proto sample', gap: -150, deps: ['tech_pack', 'materials'], owner: 'factory' },
  { key: 'fit_1', label: 'Fit 1 approved', gap: -135, deps: ['proto'], owner: 'customer' },
  { key: 'fit_2', label: 'Fit 2 approved', gap: -120, deps: ['fit_1'], owner: 'customer' },
  { key: 'cost', label: 'Cost agreed', gap: -110, deps: ['materials'], owner: 'us' },
  { key: 'size_set', label: 'Size set approved', gap: -105, deps: ['fit_2'], owner: 'customer' },
  { key: 'adoption', label: 'Adopted (PO)', gap: -100, deps: ['size_set', 'cost'], owner: 'customer' },
];
export const OWNER_LABEL: Record<Step['owner'], string> = { customer: 'customer', factory: 'factory', mill: 'mill', us: 'us' };

export type DevRow = { key: string; label: string | null; plan_date: string; expected_date?: string | null; actual_date?: string | null; owner_kind?: string | null };
export type DevPoint = { key: string; label: string; plan: number; f: number; actual?: number; expected?: number; status: MilestoneStatus; slip: number; owner: string };

export function planFromDelivery(deliveryIso: string, steps: Step[] = DEFAULT_STEPS): { key: string; label: string; owner: string; plan_date: string }[] {
  const d = dayOf(deliveryIso);
  return steps.map((s) => ({ key: s.key, label: s.label, owner: s.owner, plan_date: isoOf(d + s.gap) }));
}

// Forecast per step: actual, else the reported expected date, else the later of plan and each upstream
// forecast plus the planned gap; an open step whose plan has passed cannot happen before today.
export function computeDevPath(rows: DevRow[], steps: Step[] = DEFAULT_STEPS, T = today()): DevPoint[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const stepOf = new Map(steps.map((s) => [s.key, s]));
  const order = [...steps.map((s) => s.key), ...rows.map((r) => r.key).filter((k) => !stepOf.has(k))];
  const out = new Map<string, DevPoint>();
  for (const k of order) {
    const m = byKey.get(k); if (!m) continue;
    const st = stepOf.get(k);
    const plan = dayOf(m.plan_date), actual = m.actual_date ? dayOf(m.actual_date) : undefined, expected = m.expected_date ? dayOf(m.expected_date) : undefined;
    let f: number;
    if (actual !== undefined) f = actual;
    else if (expected !== undefined) f = expected;
    else {
      f = Math.max(plan, T);
      for (const d of st?.deps || []) { const up = out.get(d); if (!up) continue; const sl = up.f - up.plan; if (sl > 1) f = Math.max(f, plan + sl); }
    }
    const done = actual !== undefined && actual <= T;
    const status: MilestoneStatus = done ? 'done' : plan < T ? 'late' : f > plan ? 'risk' : plan - T <= 7 ? 'due' : 'pending';
    out.set(k, { key: k, label: m.label || st?.label || k, plan, f, actual, expected, status, slip: f - plan, owner: m.owner_kind || st?.owner || 'us' });
  }
  return [...out.values()];
}

export function devHealth(points: DevPoint[]) {
  const late = points.filter((p) => p.status === 'late').length, risk = points.filter((p) => p.status === 'risk').length;
  const last = points[points.length - 1];
  const slip = last ? last.slip : 0;
  return { late, risk, slip, state: late || slip > 0 ? 'red' : risk ? 'amber' : 'green' } as const;
}
