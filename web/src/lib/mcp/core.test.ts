import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedTools, canWrite, grantTracks, hashMatches, mintToken, parseToken, trackForCall, NEVER } from './core';

test('token mints, parses and verifies by hash only', () => {
  const t = mintToken();
  assert.match(t.token, /^vm_[A-Za-z0-9]{44}$/);
  assert.equal(parseToken(t.token)?.prefix, t.prefix);
  assert.ok(hashMatches(t.token, t.hash));
  assert.ok(!hashMatches(t.token.slice(0, -1) + (t.token.endsWith('a') ? 'b' : 'a'), t.hash));
  assert.equal(parseToken('vm_short'), null);
  assert.equal(parseToken(` ${t.token} `)?.token, t.token);
});

test('viewer token reads production only, no team, no writes even if asked', () => {
  const tools = allowedTools({ role: 'viewer', tracks: ['production'], writes: true, esg: false });
  assert.ok(tools.includes('get_order'));
  assert.ok(!tools.includes('get_team'));
  assert.ok(!tools.includes('queue_draft'));
  assert.ok(!tools.includes('search_styles'));
  assert.ok(!tools.includes('get_compliance'));
  assert.ok(!canWrite('viewer'));
});

test('manager token with writes, both tracks and ESG gets the full list but never the forbidden tools', () => {
  const tools = allowedTools({ role: 'manager', tracks: ['production', 'development'], writes: true, esg: true });
  for (const n of ['get_team', 'queue_draft', 'set_milestone', 'record_sample_event', 'record_compliance_value', 'get_samples', 'get_compliance']) assert.ok(tools.includes(n), n);
  for (const n of NEVER) assert.ok(!tools.includes(n), n);
});

test('merchandiser read-only token has no writes', () => {
  const tools = allowedTools({ role: 'merchandiser', tracks: ['production', 'development'], writes: false, esg: true });
  assert.ok(!tools.some((t) => ['queue_draft', 'set_milestone', 'record_sample_event', 'record_compliance_value'].includes(t)));
});

test('tracks on a token stay inside the membership', () => {
  assert.deepEqual(grantTracks(['development'], ['production']), ['production']);
  assert.deepEqual(grantTracks(['development', 'production'], ['production', 'development']), ['production', 'development']);
  assert.deepEqual(grantTracks([], ['development', 'production']), ['development']);
});

test('a call lands on the track it belongs to', () => {
  const both: ('production' | 'development')[] = ['production', 'development'];
  assert.equal(trackForCall('get_samples', {}, both), 'development');
  assert.equal(trackForCall('get_samples', {}, ['production']), 'production');
  assert.equal(trackForCall('queue_draft', { style: 'ST-1', party: 'Mill' }, both), 'development');
  assert.equal(trackForCall('queue_draft', { po: '48812', party: 'Factory' }, both), 'production');
  assert.equal(trackForCall('queue_draft', { po: '48812', track: 'development' }, both), 'development');
  assert.equal(trackForCall('queue_draft', { track: 'development' }, ['production']), 'production');
  assert.equal(trackForCall('set_milestone', {}, ['development', 'production']), 'production');
});
