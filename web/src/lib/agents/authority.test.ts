// Run: npm test (node's test runner through tsx). The rules every layer acts under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceilingOf, decide, deskFor, effectiveLevel, mayApprove, nextUp, type ChainLink, type Gate } from './authority';

const S = 'Production status';
const order = (c: Record<string, number> | null = null, person: string | null = 'u-merch'): ChainLink => ({ agentId: 'a-order', name: 'PO 1', layer: 'order', ceilings: c, personUserId: person });
const desk = (c: Record<string, number> | null = null, person: string | null = 'u-senior'): ChainLink => ({ agentId: 'a-desk', name: 'Northline desk', layer: 'desk', ceilings: c, personUserId: person });
const mira = (c: Record<string, number> | null = null): ChainLink => ({ agentId: 'a-mira', name: 'Mira', layer: 'manager', ceilings: c, personUserId: null });
const gate = (level: number, locked: number | null = null): Gate => ({ level, locked });

test('a missing ceiling means L1: draft only', () => {
  assert.equal(ceilingOf(order(), S), 1);
  assert.equal(mayApprove(gate(3), order(), S), false);
  assert.equal(mayApprove(gate(3), desk(), S), false);
  assert.equal(mayApprove(gate(3), mira(), S), false);
});

test('the lower of gate and ceiling wins', () => {
  assert.equal(effectiveLevel(gate(1), desk({ [S]: 3 }), S), 1);
  assert.equal(effectiveLevel(gate(3), desk({ [S]: 2 }), S), 2);
  assert.equal(mayApprove(gate(1), desk({ [S]: 3 }), S), false, 'a high ceiling never beats a low gate');
  assert.equal(mayApprove(gate(2), desk({ [S]: 1 }), S), false, 'a high gate never beats a low ceiling');
  assert.equal(mayApprove(gate(2), desk({ [S]: 2 }), S), true);
});

test('a capped stream is always a person, whatever the gate and ceiling say', () => {
  for (const lvl of [0, 1, 2, 3]) {
    assert.equal(mayApprove(gate(lvl, 1), desk({ [S]: 3 }), S), false);
    assert.equal(mayApprove(gate(lvl, 1), mira({ [S]: 3 }), S), false);
  }
  const r = decide([order({ [S]: 3 }), desk({ [S]: 3 }), mira({ [S]: 3 })], gate(3, 1), S);
  assert.equal(r.approver, null);
  assert.equal(r.waitingAt?.layer, 'order');
});

test('a ceiling on one stream does not reach another', () => {
  assert.equal(mayApprove(gate(3), desk({ Shipping: 3 }), S), false);
});

test('the lowest agent allowed to approve does', () => {
  const r = decide([order(), desk({ [S]: 2 }), mira({ [S]: 3 })], gate(2), S);
  assert.equal(r.approver?.layer, 'desk');
});

test('no agent allowed: the person of the lowest layer that has one decides', () => {
  assert.equal(decide([order(), desk(), mira()], gate(2), S).waitingAt?.personUserId, 'u-merch');
  assert.equal(decide([order(null, null), desk(), mira()], gate(2), S).waitingAt?.personUserId, 'u-senior');
  assert.equal(decide([order(null, null), desk(null, null), mira()], gate(2), S).waitingAt?.layer, 'manager');
  assert.equal(decide([order(null, null), mira()], gate(2), S).waitingAt?.layer, 'manager', 'an order with no desk goes to the manager');
});

test('an open decision rises one layer, skipping layers with no person, ending at the manager', () => {
  const chain = [order(), desk(), mira()];
  assert.equal(nextUp(chain, 'order')?.layer, 'desk');
  assert.equal(nextUp(chain, 'desk')?.layer, 'manager');
  assert.equal(nextUp(chain, 'manager'), null);
  assert.equal(nextUp([order(), desk(null, null), mira()], 'order')?.layer, 'manager');
});

test('ceilings above L3 are held at L3', () => {
  assert.equal(ceilingOf(desk({ [S]: 9 }), S), 3);
});

test('desk assignment: a hand-picked list wins, then customer, supplier, category', () => {
  const o = { id: 'o1', customer_id: 'c1', factory_id: 'f1', mill_id: 'm1', category: 'Knitwear' };
  const byCat = { id: 'd-cat', desk_rule: { by: 'category' as const, categories: ['knitwear'] } };
  const bySup = { id: 'd-sup', desk_rule: { by: 'supplier' as const, ids: ['m1'] } };
  const byCus = { id: 'd-cus', desk_rule: { by: 'customer' as const, ids: ['c1'] } };
  const byList = { id: 'd-list', desk_rule: { by: 'list' as const, order_ids: ['o1'] } };
  assert.equal(deskFor([byCat, bySup, byCus, byList], o)?.id, 'd-list');
  assert.equal(deskFor([byCat, bySup, byCus], o)?.id, 'd-cus');
  assert.equal(deskFor([byCat, bySup], o)?.id, 'd-sup');
  assert.equal(deskFor([byCat], o)?.id, 'd-cat');
  assert.equal(deskFor([{ id: 'x', desk_rule: { by: 'customer' as const, ids: ['other'] } }], o), null);
});
