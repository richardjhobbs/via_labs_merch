import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capAllows, lessonsForPrompt, type Lesson } from './learning-rules';

const L = (p: Partial<Lesson> & { id: string }): Lesson => ({ scope: 'customer', scope_id: 'nl', text: 'Send test reports before the shipping sample.', status: 'confirmed', created_at: '2026-11-10T00:00:00Z', ...p });
const names = (_s: Lesson['scope'], id: string | null) => (id === 'nl' ? 'Northline' : null);

test('a confirmed lesson reaches the agents, named by its customer', () => {
  const out = lessonsForPrompt([L({ id: '1' })], names);
  assert.match(out, /Northline: Send test reports before the shipping sample\./);
});

test('proposed, rejected and retired lessons never reach the agents', () => {
  for (const status of ['proposed', 'rejected', 'retired']) assert.equal(lessonsForPrompt([L({ id: '1', status })], names), '');
  const out = lessonsForPrompt([L({ id: '1' }), L({ id: '2', status: 'rejected', text: 'Never ship by air.' })], names);
  assert.doesNotMatch(out, /Never ship by air/);
});

test('company lessons come first, the list is capped', () => {
  const many = Array.from({ length: 50 }, (_, i) => L({ id: `c${i}`, text: `rule ${i}` }));
  const out = lessonsForPrompt([...many, L({ id: 'co', scope: 'company', scope_id: null, text: 'Write in British English.' })], names, 40);
  assert.equal(out.split('\n').length, 40);
  assert.match(out.split('\n')[0], /^- All work: Write in British English\./);
});

test('past the daily cap only chat, inbound replies and event briefs run', () => {
  assert.equal(capAllows('sweep', 5, 5), false);
  assert.equal(capAllows('morning', 6, 5), false);
  assert.equal(capAllows('compliance', 5.01, 5), false);
  assert.equal(capAllows('chat', 50, 5), true);
  assert.equal(capAllows('inbound', 50, 5), true);
  assert.equal(capAllows('event_brief', 50, 5), true);
  assert.equal(capAllows('sweep', 4.99, 5), true);
  assert.equal(capAllows('sweep', 999, null), true, 'no cap set');
  assert.equal(capAllows('sweep', 999, 0), true, 'zero means no cap');
});
