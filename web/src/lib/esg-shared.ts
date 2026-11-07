// ESG and compliance: the shared, pure part (constants, periods, states), safe for client components.
import { dayOf, isoOf, today } from '@/lib/core/path';

export const DISCIPLINES = ['energy', 'emissions', 'water', 'chemicals', 'waste', 'health_safety', 'labour', 'community', 'governance', 'traceability', 'other'] as const;
export const FREQUENCIES = ['once', 'monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const MEASURES = ['number', 'yes_no', 'evidence', 'text'] as const;
export const PROGRAMME_KINDS = ['loan', 'customer', 'certification', 'regulation', 'internal'] as const;
export const OWNER_ROLES = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const HORIZON_DAYS = 120;            // tasks exist this far ahead of their due date

// Who may set up programmes and requirements, and accept what was reported.
export const canLead = (role: string) => ['owner', 'manager', 'compliance'].includes(role);
export const canApproveReport = (role: string) => ['owner', 'manager'].includes(role);
export const esgEnabled = (settings: unknown) => !!(settings as { addons?: { esg?: boolean } } | null)?.addons?.esg;

const MONTHS: Record<Frequency, number> = { once: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

// Last day of the month n months after the month of `iso` when `iso` is a month end, else the same day of month.
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm is 1-based here
  const monthEnd = d === last(y, m);
  const total = y * 12 + (m - 1) + n, ny = Math.floor(total / 12), nm = total % 12 + 1;
  const day = monthEnd ? last(ny, nm) : Math.min(d, last(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function periodLabel(freq: Frequency, periodEnd: string): string {
  const [y, m] = periodEnd.split('-').map(Number);
  if (freq === 'once') return 'One-off';
  if (freq === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  if (freq === 'quarterly') return `Q${Math.ceil(m / 3)} ${y}`;
  if (freq === 'semiannual') return `H${m <= 6 ? 1 : 2} ${y}`;
  return `FY ${y}`;
}

export type Period = { period_end: string; due_date: string; period_label: string };

// Every reporting period of a requirement whose report falls due on or before `until`, from the first one,
// stopping after the programme ends (the last period that ends on or before ends_on is still reported).
export function periodsOf(r: { frequency: Frequency; first_period_end: string; due_days: number }, until: string, endsOn?: string | null): Period[] {
  const out: Period[] = [];
  const step = MONTHS[r.frequency];
  for (let i = 0; i < 400; i++) {
    const end = step ? addMonths(r.first_period_end, step * i) : r.first_period_end;
    if (endsOn && end > endsOn && i > 0) break;
    const due = isoOf(dayOf(end) + r.due_days);
    if (due > until) break;
    out.push({ period_end: end, due_date: due, period_label: periodLabel(r.frequency, end) });
    if (!step) break;
  }
  return out;
}

export type TaskState = 'done' | 'review' | 'overdue' | 'due' | 'upcoming' | 'returned' | 'waived';
export function taskState(t: { status: string; due_date: string }, leadDays: number, T = today()): TaskState {
  if (t.status === 'accepted') return 'done';
  if (t.status === 'waived') return 'waived';
  if (t.status === 'submitted') return 'review';
  const left = dayOf(t.due_date) - T;
  if (left < 0) return 'overdue';
  if (t.status === 'returned') return 'returned';
  return left <= leadDays ? 'due' : 'upcoming';
}
export const STATE_PILL: Record<TaskState, string> = { done: 'ok', review: 'agent', overdue: 'crit', due: 'warn', upcoming: '', returned: 'crit', waived: '' };

// Reminder stage for an open task: 1 inside the lead window, 2 within a week, 3 due tomorrow or overdue.
export function reminderStage(dueIso: string, leadDays: number, T = today()): 0 | 1 | 2 | 3 {
  const left = dayOf(dueIso) - T;
  if (left <= 1) return 3;
  if (left <= 7) return 2;
  if (left <= leadDays) return 1;
  return 0;
}

// Does a task belong on this person's list: assigned to them, or unassigned and for their role.
export function isMine(t: { assignee_user_id: string | null; owner_role: string }, userId: string, role: string) {
  if (t.assignee_user_id) return t.assignee_user_id === userId;
  return t.owner_role === role;
}


// A sensible first period end when a document does not give one: the first calendar quarter (or month,
// half, year) end on or after the programme start, or today; a one-off falls on the programme end or 90 days out.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function defaultPeriodEnd(freq: Frequency, startsOn: string | null, endsOn: string | null, T = today()): string {
  if (freq === 'once') return endsOn && ISO.test(endsOn) ? endsOn : isoOf(T + 90);
  const start = startsOn && ISO.test(startsOn) && dayOf(startsOn) > T ? startsOn : isoOf(T);
  const [y, m] = start.split('-').map(Number);
  const endMonth = Math.ceil(m / MONTHS[freq]) * MONTHS[freq];
  const yy = y + Math.floor((endMonth - 1) / 12), mm = ((endMonth - 1) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`;
}
