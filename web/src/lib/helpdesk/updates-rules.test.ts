import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibility, parseAudience } from './updates-rules';

const T = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';

test('an update for everyone is shown to every company and to partners', () => {
  assert.equal(visibility({ kind: 'all' }, T, {}), 'yes');
  assert.equal(visibility({ kind: 'all' }, T, {}, true), 'yes');
  assert.equal(visibility(null, T, null), 'yes');
});

test('an add-on update is theirs with the add-on, on request without it', () => {
  assert.equal(visibility({ kind: 'addon', key: 'esg' }, T, { addons: { esg: true } }), 'yes');
  assert.equal(visibility({ kind: 'addon', key: 'esg' }, T, { addons: { esg: false } }), 'locked');
  assert.equal(visibility({ kind: 'addon', key: 'esg' }, T, {}), 'locked');
});

test('a track update: production is everyone, development needs the switch', () => {
  assert.equal(visibility({ kind: 'track', key: 'production' }, T, {}), 'yes');
  assert.equal(visibility({ kind: 'track', key: 'development' }, T, {}), 'locked');
  assert.equal(visibility({ kind: 'track', key: 'development' }, T, { tracks: { development: true } }), 'yes');
});

test('a feature update follows the company feature switch', () => {
  assert.equal(visibility({ kind: 'feature', key: 'x' }, T, { features: { x: true } }), 'yes');
  assert.equal(visibility({ kind: 'feature', key: 'x' }, T, { features: { y: true } }), 'locked');
});

test('an update for named companies is hidden from everyone else', () => {
  assert.equal(visibility({ kind: 'tenants', ids: [T] }, T, {}), 'yes');
  assert.equal(visibility({ kind: 'tenants', ids: [OTHER] }, T, {}), 'hidden');
});

test('partners see general updates only', () => {
  assert.equal(visibility({ kind: 'addon', key: 'esg' }, T, { addons: { esg: true } }, true), 'hidden');
  assert.equal(visibility({ kind: 'tenants', ids: [T] }, T, {}, true), 'hidden');
});

test('parseAudience reads the console form and falls back to everyone', () => {
  assert.deepEqual(parseAudience('addon:esg', []), { kind: 'addon', key: 'esg' });
  assert.deepEqual(parseAudience('tenants', [T, 'nope']), { kind: 'tenants', ids: [T] });
  assert.deepEqual(parseAudience('whatever', []), { kind: 'all' });
});
