// The MCP server over the agent's tools. One stateless server per request: tools/list shows the allow list for
// the token, tools/call runs the tool through the same AgentCtx the chat agent uses (service role, one tenant,
// the person's scope), on the track the call belongs to. No sending, no decisions: see core.ts.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Track } from '@/lib/tracks';
import { trackForCall } from './core';

// What we need from a tool: the shape betaZodTool returns (name, description, JSON schema, parse, run).
export type McpTool = { name: string; description?: string; input_schema: Record<string, unknown>; parse: (args: unknown) => unknown; run: (args: never) => Promise<unknown> | unknown };

export type McpHost = {
  tracks: Track[];
  allowed: string[];
  toolsFor: (track: Track) => McpTool[];
  onInitialized?: (client: string | null) => void;
  onCall?: (r: { tool: string; args: unknown; track: Track; ok: boolean; ms: number; output: string }) => void;
};

export const SERVER_NAME = 'via-merch';

function listSchema(t: McpTool, host: McpHost) {
  // a client with both tracks may name the track on a draft; everything else is placed by the call itself
  if (t.name === 'queue_draft' && host.tracks.length > 1) {
    const s = t.input_schema as { properties?: Record<string, unknown> };
    return { ...s, properties: { ...(s.properties || {}), track: { type: 'string', enum: host.tracks, description: 'development or production; left out, a style means development and a PO means production' } } };
  }
  return t.input_schema;
}

export function buildServer(host: McpHost) {
  const server = new Server({ name: SERVER_NAME, version: '1.0.0' }, { capabilities: { tools: {} }, instructions: 'VIA Merch, the merchandising record of this company, as the signed-in person sees it. Read before you answer; never invent PO numbers, dates or names. Anything you queue waits for a person to approve in the workspace; nothing here sends a message or takes a decision.' });
  server.oninitialized = () => host.onInitialized?.(server.getClientVersion()?.name || null);
  const base = host.toolsFor(host.tracks[0]);
  const allowed = (name: string) => host.allowed.includes(name);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: base.filter((t) => allowed(t.name)).map((t) => ({ name: t.name, description: t.description, inputSchema: listSchema(t, host) as { type: 'object'; properties?: Record<string, unknown> } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params; const raw = (req.params.arguments || {}) as Record<string, unknown>;
    const t0 = Date.now();
    const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
    if (!allowed(name)) return fail(JSON.stringify({ error: `Tool ${name} is not available to this token` }));
    const track = trackForCall(name, raw, host.tracks);
    const tool = host.toolsFor(track).find((t) => t.name === name);
    if (!tool) return fail(JSON.stringify({ error: `Tool ${name} is not available on the ${track} track` }));
    const { track: _drop, ...args } = raw; void _drop;
    let parsed: unknown;
    try { parsed = tool.parse(args); } catch (e) { return fail(JSON.stringify({ error: `Invalid arguments: ${e instanceof Error ? e.message : String(e)}` })); }
    const out = await tool.run(parsed as never);
    const text = typeof out === 'string' ? out : JSON.stringify(out);
    let isError = false;
    try { const j = JSON.parse(text); isError = !!(j && typeof j === 'object' && !Array.isArray(j) && 'error' in j && Object.keys(j).length === 1); } catch { /* plain text */ }
    host.onCall?.({ tool: name, args, track, ok: !isError, ms: Date.now() - t0, output: text });
    return { content: [{ type: 'text' as const, text }], isError };
  });
  return server;
}
