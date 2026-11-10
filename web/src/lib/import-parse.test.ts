import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, H, num, toIso } from './import-parse';

test('column names as offices write them', () => {
  for (const k of ['PO', 'PO No.', 'PO#', 'po number', 'Purchase Order', '﻿PO']) assert.equal(H({ [k]: '48900' }, ...COLS.po), '48900', k);
  for (const k of ['ETD', 'Ship Date', 'Ex-Factory', 'ETD date']) assert.equal(H({ [k]: '2026-12-20' }, ...COLS.etd), '2026-12-20', k);
  assert.equal(H({ 'Order Qty': '1200' }, ...COLS.qty), '1200');
  assert.equal(H({ 'FOB Price': '4.5' }, ...COLS.fob), '4.5');
  assert.equal(H({ Notes: 'x' }, ...COLS.po), null);
});

test('numbers in any national format', () => {
  assert.equal(num('1,200'), 1200);
  assert.equal(num('$4.50'), 4.5);
  assert.equal(num('4,50'), 4.5, 'decimal comma');
  assert.equal(num('1.200,50'), 1200.5);
  assert.equal(num('1,200.50'), 1200.5);
  assert.equal(num('12 000'), 12000);
  assert.equal(num(''), null);
  assert.equal(num(3), 3);
});

test('dates in the usual formats; impossible dates refused', () => {
  assert.equal(toIso('2026-12-20'), '2026-12-20');
  assert.equal(toIso('20/12/2026'), '2026-12-20');
  assert.equal(toIso('12/20/2026'), '2026-12-20', 'month first when the day is over 12');
  assert.equal(toIso('05/12/2026'), '2026-12-05', 'ambiguous: day first');
  assert.equal(toIso('20.12.2026'), '2026-12-20');
  assert.equal(toIso('20-Dec-26'), '2026-12-20');
  assert.equal(toIso('20 December 2026'), '2026-12-20');
  assert.equal(toIso('Dec 20, 2026'), '2026-12-20');
  assert.equal(toIso(46376), '2026-12-20', 'spreadsheet date number');
  assert.equal(toIso('31/02/2026'), null);
  assert.equal(toIso('soon'), null);
});
