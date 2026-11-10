import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer, type McpTool } from './server';

const tool = (name: string, run: (a: Record<string, unknown>) => unknown, props: Record<string, unknown> = {}): McpTool => ({
  name, description: `${name} test`, input_schema: { type: 'object', properties: props },
  parse: (a) => { const o = (a || {}) as Record<string, unknown>; for (const k of Object.keys(props)) if (!(k in o)) throw new Error(`${k} missing`); return o; },
  run: async (a: never) => JSON.stringify(run(a as Record<string, unknown>)),
});

async function connect(host: Parameters<typeof buildServer>[0]) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  const server = buildServer(host);
  await server.connect(s);
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(c);
  return { client, server };
}

test('tools/list shows only the allow list and adds track to queue_draft for two-track tokens', async () => {
  const seen: unknown[] = [];
  const toolsFor = () => [tool('get_order', () => ({ po: '1' }), { po: { type: 'string' } }), tool('queue_draft', (a) => { seen.push(a); return { queued: true }; }, { party: { type: 'string' } }), tool('request_approval', () => ({ sent: true }))];
  let client: string | null = null;
  const h = await connect({ tracks: ['production', 'development'], allowed: ['get_order', 'queue_draft'], toolsFor, onInitialized: (c) => { client = c; } });
  const list = await h.client.listTools();
  assert.deepEqual(list.tools.map((t) => t.name).sort(), ['get_order', 'queue_draft']);
  const qd = list.tools.find((t) => t.name === 'queue_draft')!;
  assert.deepEqual((qd.inputSchema.properties as Record<string, { enum?: string[] }>).track.enum, ['production', 'development']);
  assert.equal(client, 'test-client');
  await h.client.close();
});

test('tools/call runs on the right track, strips track, and refuses tools off the list', async () => {
  const tracks: string[] = [];
  const toolsFor = (track: string) => [tool('queue_draft', (a) => { tracks.push(track); return { args: a }; }, { party: { type: 'string' } }), tool('request_approval', () => ({ sent: true }))];
  const h = await connect({ tracks: ['production', 'development'], allowed: ['queue_draft'], toolsFor: toolsFor as never });
  const r = await h.client.callTool({ name: 'queue_draft', arguments: { party: 'Mill', style: 'ST-9', track: 'development' } });
  assert.equal(r.isError ?? false, false);
  const text = (r.content as { text: string }[])[0].text;
  assert.deepEqual(JSON.parse(text).args, { party: 'Mill', style: 'ST-9' });
  assert.deepEqual(tracks, ['development']);
  const denied = await h.client.callTool({ name: 'request_approval', arguments: {} });
  assert.equal(denied.isError, true);
  const bad = await h.client.callTool({ name: 'queue_draft', arguments: {} });
  assert.equal(bad.isError, true);
  assert.match((bad.content as { text: string }[])[0].text, /party missing/);
  await h.client.close();
});

test('a tool error payload is flagged isError', async () => {
  const h = await connect({ tracks: ['production'], allowed: ['get_order'], toolsFor: () => [tool('get_order', () => ({ error: 'No PO 1' }))] });
  const r = await h.client.callTool({ name: 'get_order', arguments: {} });
  assert.equal(r.isError, true);
  await h.client.close();
});
