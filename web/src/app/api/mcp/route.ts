// MCP endpoint (docs/mcp.md). Streamable HTTP in stateless JSON mode: POST only, bearer token only, no session,
// no held stream. Each request authenticates the token, builds the tool set for that member and answers.
// Every tools/call is an agent_runs row (trigger 'mcp'); writes land on the ledger through the tools themselves.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toolsFor, type AgentCtx } from '@/lib/agents/tools';
import type { Track } from '@/lib/tracks';
import { allowedTools } from '@/lib/mcp/core';
import { authenticate, overLimit, touch } from '@/lib/mcp/tokens';
import { buildServer, type McpTool } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

const deny = (status: number, error: string) => new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: status === 429 ? -32000 : -32001, message: error }, id: null }), { status, headers: { 'content-type': 'application/json', ...(status === 401 ? { 'www-authenticate': 'Bearer realm="VIA Merch"' } : {}) } });

export async function POST(req: Request) {
  const a = await authenticate(req.headers.get('authorization'));
  if (!a) return deny(401, 'A valid VIA Merch token is required');
  if (await overLimit(a.token.id)) return deny(429, 'Too many calls on this token; wait a minute');

  const sb = supabaseAdmin();
  const calls: AgentCtx['calls'] = [];
  const ctxFor = (track: Track): AgentCtx => ({ tenantId: a.tenant.id, agentId: null, agentName: a.token.name, track, trigger: 'mcp', userId: a.member.user_id, userName: a.member.display_name || 'member', userEmail: null, role: a.member.role, scope: a.scope, calls, drafts: [], nav: null });
  const cache = new Map<Track, McpTool[]>();
  const toolsOn = (track: Track) => { let t = cache.get(track); if (!t) { t = toolsFor(ctxFor(track)) as unknown as McpTool[]; cache.set(track, t); } return t; };

  let client: string | null = null;
  const server = buildServer({
    tracks: a.tracks,
    allowed: allowedTools({ role: a.member.role, tracks: a.tracks, writes: a.writes, esg: a.esg }),
    toolsFor: toolsOn,
    onInitialized: (c) => { client = c; },
    onCall: (r) => { void sb.from('agent_runs').insert({ tenant_id: a.tenant.id, agent_id: null, user_id: a.member.user_id, trigger: 'mcp', model: a.token.last_client || a.token.name, input: { token: a.token.id, track: r.track, tool: r.tool, args: r.args }, tools_called: calls, output: r.output.slice(0, 4000), ms: r.ms, error: r.ok ? null : 'tool error' }).then(() => {}, () => {}); },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    await touch(a, client);
    return res;
  } finally {
    await transport.close().catch(() => {});
  }
}

const notAllowed = () => new Response(JSON.stringify({ error: 'VIA Merch MCP is stateless: POST JSON-RPC with a bearer token' }), { status: 405, headers: { allow: 'POST', 'content-type': 'application/json' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
