import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskerOf, maskDeep, seesTeam, membersPrivate } from './private-members-core';

test('masks whole names only, longest first', () => {
  const m = maskerOf(['Bernd Sauer', 'Tom Becker', 'Tom', 'Al'])!;
  assert.equal(m('APPROVED 10:12 · Bernd Sauer'), 'APPROVED 10:12 · A colleague');
  assert.equal(m('Mira (for Tom Becker)'), 'Mira (for A colleague)');
  assert.equal(m('Tomato order for Alex'), 'Tomato order for Alex'); // no partial words, "Al" too short
  assert.equal(m('{"actor":"Tom"}'), '{"actor":"A colleague"}');
});

test('nothing to hide gives no masker', () => assert.equal(maskerOf(['', '  ']), null));

test('maskDeep walks objects and arrays', () => {
  const m = maskerOf(['Priya Nair'])!;
  assert.deepEqual(maskDeep({ a: ['Priya Nair said'], n: 3, b: { c: 'Priya Nair' } }, m), { a: ['A colleague said'], n: 3, b: { c: 'A colleague' } });
});

test('only owners and VIA support see the team when private', () => {
  const s = { private_members: true };
  assert.equal(membersPrivate(s), true);
  assert.equal(seesTeam('owner', s), true);
  assert.equal(seesTeam('manager', s), false);
  assert.equal(seesTeam('viewer', s), false);
  assert.equal(seesTeam('manager', s, 'admin'), true);
  assert.equal(seesTeam('manager', {}), true);
});
