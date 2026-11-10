import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignable, canEdit, canRemove, canSetRole } from './team';

test('managers hand out every role but owner; others none', () => {
  assert.ok(assignable('owner').includes('owner'));
  assert.ok(!assignable('manager').includes('owner'));
  assert.ok(assignable('manager').includes('manager'));
  assert.deepEqual(assignable('merchandiser'), []);
});

test('a manager cannot touch an owner; nobody touches partners here', () => {
  assert.equal(canEdit('manager', 'owner', false), false);
  assert.equal(canEdit('owner', 'manager', false), true);
  assert.equal(canEdit('owner', 'partner', false), false);
  assert.equal(canEdit('merchandiser', 'viewer', false), false);
});

test('nobody changes their own role, and the last owner stays', () => {
  assert.equal(canSetRole('owner', 'owner', 'manager', true, 2), false);
  assert.equal(canSetRole('owner', 'owner', 'owner', true, 1), true);
  assert.equal(canSetRole('owner', 'owner', 'manager', false, 1), false);
  assert.equal(canSetRole('owner', 'owner', 'manager', false, 2), true);
  assert.equal(canSetRole('manager', 'merchandiser', 'owner', false, 1), false);
  assert.equal(canSetRole('manager', 'merchandiser', 'qc', false, 1), true);
});

test('removing: not yourself, not the last owner, a manager never removes an owner', () => {
  assert.equal(canRemove('owner', 'owner', true, 3), false);
  assert.equal(canRemove('owner', 'owner', false, 1), false);
  assert.equal(canRemove('owner', 'owner', false, 2), true);
  assert.equal(canRemove('manager', 'owner', false, 3), false);
  assert.equal(canRemove('manager', 'viewer', false, 1), true);
});
