import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOrder, type PoMatch } from './orders';

const m = (id: string, name: string | null, short: string | null = null): PoMatch => ({ id, po: '1', customer: name ? { id: `c-${id}`, name, short } : null, factory: null });

test('one order with the PO is picked without a customer', () => {
  assert.deepEqual(pickOrder([m('a', 'Roaming Stogie')], '1'), { id: 'a' });
});

test('a PO two customers share needs the customer', () => {
  const L = [m('a', 'Roaming Stogie', 'RS'), m('b', 'Northline')];
  assert.match((pickOrder(L, '1') as { error: string }).error, /more than one customer.*Roaming Stogie, Northline/);
  assert.deepEqual(pickOrder(L, '1', 'northline'), { id: 'b' });
  assert.deepEqual(pickOrder(L, '1', 'RS'), { id: 'a' });
  assert.match((pickOrder(L, '1', 'Acme') as { error: string }).error, /not on file for Acme/);
});

test('no order gives a plain error', () => {
  assert.match((pickOrder([], '9') as { error: string }).error, /No PO 9/);
});
