// Working hours and time zones. Pure functions, tested in work-hours.test.ts.
// A company works on certain days between a start and an end time in its own time zone
// (tenants.settings.hours, tenants.tz); a person may live in another zone (memberships.tz).
// Background agent work runs only in working time, the spending day starts at the company's midnight,
// "open for 24 hours" counts working hours only, and each person's morning brief arrives at 07:00 their time.

export type Hours = { tz: string; days: number[]; start: string; end: string }; // days: Monday = 1 ... Sunday = 7
export const DEFAULT_HOURS = { days: [1, 2, 3, 4, 5], start: '08:00', end: '19:00' };

export function hoursOf(tz: string | null | undefined, settings: unknown): Hours {
  const h = ((settings as { hours?: Partial<Hours> } | null)?.hours || {}) as Partial<Hours>;
  const ok = (s: unknown) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const days = Array.isArray(h.days) && h.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) && h.days.length ? [...new Set(h.days)].sort() : DEFAULT_HOURS.days;
  return { tz: validTz(tz) ? tz! : 'UTC', days, start: ok(h.start) ? h.start! : DEFAULT_HOURS.start, end: ok(h.end) ? h.end! : DEFAULT_HOURS.end };
}

export function validTz(tz: string | null | undefined) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// The wall clock in a zone: date, ISO weekday and minutes after midnight.
export function local(at: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
  return { ymd: `${p.year}-${p.month}-${p.day}`, dow, minutes: Number(p.hour) * 60 + Number(p.minute), hour: Number(p.hour) };
}

export const localDay = (at: Date, tz: string) => local(at, tz).ymd;

export function isWorkingDay(at: Date, h: Hours) { return h.days.includes(local(at, h.tz).dow); }

export function isWorkingTime(at: Date, h: Hours) {
  const l = local(at, h.tz);
  if (!h.days.includes(l.dow)) return false;
  const s = mins(h.start), e = mins(h.end);
  return e > s ? l.minutes >= s && l.minutes < e : l.minutes >= s || l.minutes < e; // an end before the start runs past midnight
}

// Working minutes between two instants, counted in 15-minute steps (at most 60 days).
export function workingMinutesBetween(from: Date, to: Date, h: Hours) {
  if (to <= from) return 0;
  const step = 15 * 60_000, end = Math.min(to.getTime(), from.getTime() + 60 * 864e5);
  let n = 0;
  for (let t = from.getTime(); t < end; t += step) if (isWorkingTime(new Date(t), h)) n += 15;
  return n;
}

// Has the person's local morning (07:00 by default) arrived today, on a working day of the company?
export function morningDue(at: Date, personTz: string, companyHours: Hours, hour = 7) {
  const l = local(at, personTz);
  return l.hour >= hour && companyHours.days.includes(l.dow);
}
