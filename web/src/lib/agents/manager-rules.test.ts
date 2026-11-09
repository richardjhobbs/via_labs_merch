import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityConflicts, defaultPriority, type ConflictOrder } from './manager-rules';

const T = 20000;
const o = (p: Partial<ConflictOrder> & { id: string }): ConflictOrder => ({ po: p.id, factoryId: 'f1', factoryName: 'Huaxin', parentId: 'desk-a', parentIsManager: false, exf: T + 10, state: 'green', instore: '2027-01-20', value: 10000, customer: 'Northline', ...p });

test('two desks, same factory, ex-factory within a week, one off plan: a conflict for Mira', () => {
  const c = capacityConflicts([o({ id: 'A', state: 'red' }), o({ id: 'B', parentId: 'desk-b', exf: T + 14 })], T);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].orders.map((x) => x.id), ['A', 'B']);
});

test('a clash inside one desk is that desk\'s to decide; across desks it is Mira\'s', () => {
  const same = capacityConflicts([o({ id: 'A', state: 'red' }), o({ id: 'B' })], T);
  assert.equal(same.length, 1);
  assert.equal(same[0].deskId, 'desk-a');
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red' }), o({ id: 'B', parentId: 'desk-b' })], T)[0].deskId, null);
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red', parentId: 'mira', parentIsManager: true }), o({ id: 'B', parentId: 'mira', parentIsManager: true })], T)[0].deskId, null, 'no desk: Mira');
});

test('orders sitting directly under Mira with no desk are hers', () => {
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red', parentId: 'mira', parentIsManager: true }), o({ id: 'B', parentId: 'mira', parentIsManager: true })], T).length, 1);
});

test('all on plan, different factories, dates far apart or outside the horizon: no conflict', () => {
  assert.equal(capacityConflicts([o({ id: 'A' }), o({ id: 'B', parentId: 'desk-b' })], T).length, 0, 'both on plan');
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red' }), o({ id: 'B', parentId: 'desk-b', factoryId: 'f2' })], T).length, 0, 'different factories');
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red' }), o({ id: 'B', parentId: 'desk-b', exf: T + 25 })], T).length, 0, 'more than a week apart');
  assert.equal(capacityConflicts([o({ id: 'A', state: 'red', exf: T + 60 }), o({ id: 'B', parentId: 'desk-b', exf: T + 61 })], T).length, 0, 'beyond the horizon');
});

test('a chain of clashes becomes one conflict with a stable key', () => {
  const list = [o({ id: 'A', state: 'red', exf: T + 5 }), o({ id: 'B', parentId: 'desk-b', exf: T + 10 }), o({ id: 'C', parentId: 'desk-c', exf: T + 15, state: 'amber' })];
  const c = capacityConflicts(list, T);
  assert.equal(c.length, 1);
  assert.equal(c[0].orders.length, 3);
  assert.equal(capacityConflicts([...list].reverse(), T)[0].key, c[0].key);
});

test('default priority: earliest in-store, then furthest off plan, then larger value', () => {
  const c = capacityConflicts([o({ id: 'A', instore: '2027-02-01', state: 'red' }), o({ id: 'B', parentId: 'desk-b', instore: '2027-01-15' })], T)[0];
  assert.deepEqual(defaultPriority(c), ['B', 'A']);
  const d = capacityConflicts([o({ id: 'A', state: 'amber' }), o({ id: 'B', parentId: 'desk-b', state: 'red' })], T)[0];
  assert.deepEqual(defaultPriority(d), ['B', 'A']);
});
