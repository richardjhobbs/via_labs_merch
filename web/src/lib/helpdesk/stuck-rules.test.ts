import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stuckReason, type StuckRow } from './stuck-rules';

const now = Date.parse('2026-11-16T10:00:00Z');
const ago = (m: number) => new Date(now - m * 60_000).toISOString();
const row = (x: Partial<StuckRow>): StuckRow => ({ id: 'p', number: 1, title: 't', status: 'greenlit', risk_flags: [], merged_sha: null, decided_at: ago(1), updated_at: ago(1), plan: null, stuck_reason: null, ...x });

test('greenlit and moving is not stuck', () => assert.equal(stuckReason(row({}), now), null));
test('greenlit 16 minutes with no claim is stuck', () => assert.match(stuckReason(row({ decided_at: ago(16) }), now)!, /did not start/));
test('building briefly is not stuck; 91 minutes without a merge is', () => {
  assert.equal(stuckReason(row({ status: 'building', updated_at: ago(30) }), now), null);
  assert.match(stuckReason(row({ status: 'building', updated_at: ago(91) }), now)!, /without a merged/);
});
test('a stop flag is stuck at once', () => assert.match(stuckReason(row({ status: 'pr_open', risk_flags: ['needs the founder', 'other'] }), now)!, /needs the founder\./));
test('merged and waiting for the deploy: fine for 25 minutes, then stuck', () => {
  assert.equal(stuckReason(row({ status: 'pr_open', merged_sha: 'abcdef1234', updated_at: ago(10) }), now), null);
  assert.match(stuckReason(row({ status: 'pr_open', merged_sha: 'abcdef1234', updated_at: ago(26) }), now)!, /abcdef1/);
});
