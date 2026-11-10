import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursOf, isWorkingTime, local, localDay, morningDue, workingMinutesBetween } from './work-hours';

const HK = hoursOf('Asia/Hong_Kong', { hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } });
const at = (iso: string) => new Date(iso);

test('the wall clock follows the zone', () => {
  // Monday 10 Nov 2026 02:00 UTC is 10:00 in Hong Kong
  assert.deepEqual(local(at('2026-11-10T02:00:00Z'), 'Asia/Hong_Kong'), { ymd: '2026-11-10', dow: 2, minutes: 600, hour: 10 });
  assert.equal(localDay(at('2026-11-09T17:30:00Z'), 'Asia/Hong_Kong'), '2026-11-10', 'already tomorrow in Hong Kong');
  assert.equal(localDay(at('2026-11-09T17:30:00Z'), 'America/New_York'), '2026-11-09');
});

test('working time: days and hours in the company zone', () => {
  assert.equal(isWorkingTime(at('2026-11-10T02:00:00Z'), HK), true, 'Tuesday 10:00 HK');
  assert.equal(isWorkingTime(at('2026-11-10T11:00:00Z'), HK), false, 'Tuesday 19:00 HK');
  assert.equal(isWorkingTime(at('2026-11-14T02:00:00Z'), HK), false, 'Saturday 10:00 HK');
  assert.equal(isWorkingTime(at('2026-11-10T00:59:00Z'), HK), false, '08:59 HK');
  assert.equal(isWorkingTime(at('2026-11-10T01:00:00Z'), HK), true, '09:00 HK');
});

test('a shift past midnight', () => {
  const night = hoursOf('UTC', { hours: { days: [1, 2, 3, 4, 5, 6, 7], start: '22:00', end: '06:00' } });
  assert.equal(isWorkingTime(at('2026-11-10T23:00:00Z'), night), true);
  assert.equal(isWorkingTime(at('2026-11-10T03:00:00Z'), night), true);
  assert.equal(isWorkingTime(at('2026-11-10T12:00:00Z'), night), false);
});

test('24 working hours is not 24 clock hours: a Friday evening decision is not due on Saturday', () => {
  const friEvening = at('2026-11-13T09:00:00Z'); // Friday 17:00 HK, one working hour left that day
  assert.equal(workingMinutesBetween(friEvening, at('2026-11-14T09:00:00Z'), HK), 60, 'by Saturday 17:00 only 1 h counted');
  assert.equal(workingMinutesBetween(friEvening, at('2026-11-16T09:00:00Z'), HK), 60 + 8 * 60, 'by Monday 17:00, 9 h');
});

test('bad settings fall back to the defaults; a bad zone falls back to UTC', () => {
  const h = hoursOf('Not/AZone', { hours: { days: [9], start: '25:00', end: 'x' } });
  assert.equal(h.tz, 'UTC');
  assert.deepEqual(h.days, [1, 2, 3, 4, 5]);
  assert.equal(h.start, '08:00');
});

test('the morning brief arrives at 07:00 in the person\'s own zone, on the company\'s working days', () => {
  // 23:30 UTC Monday = 07:30 Tuesday in Hong Kong, 06:30 Tuesday in Hanoi
  assert.equal(morningDue(at('2026-11-09T23:30:00Z'), 'Asia/Hong_Kong', HK), true);
  assert.equal(morningDue(at('2026-11-09T23:30:00Z'), 'Asia/Ho_Chi_Minh', HK), false);
  assert.equal(morningDue(at('2026-11-14T00:30:00Z'), 'Asia/Hong_Kong', HK), false, 'Saturday');
});
