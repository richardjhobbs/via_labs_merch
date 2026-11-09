# VIA Merch as an MCP server: plan

Founder decision, 9 November 2026: expose the workspace to a member's own agent (Claude Desktop, Cowork, Claude Code, any MCP client) through one server at `/api/mcp`. The middleware already lists `/api/mcp` as public and the catalogue already carries the "VIA agent channel" entry (vendor "MCP and A2A", status `via`), so this is the build behind two reservations, not a new direction. Where this document and the code differ, the code and CLAUDE.md are current.

## 1. What it is and is not

One MCP server, one tool set, one scope model. The tools are the agent's own tools from `src/lib/agents/tools.ts` and `style-tools.ts`, run through the same `AgentCtx`, so RLS scope, gates, tracks and the ledger behave exactly as they do when Mira calls them. No second data layer, no second permission model.

It is not a chat endpoint: the caller's model does the reasoning, VIA supplies the record and the gated queue. It is not a way to send anything: every outbound draft still waits in the approval queue for a person. It is not the inter-company channel yet: a customer's or supplier's agent reading another company's records is phase 2 (section 8).

## 2. Tool surface

Allow list, enforced in code. A tool not on the list is not registered, whatever the token says.

Read, every token:

| Tool | Source | Note |
|---|---|---|
| `get_briefing`, `get_desk_brief`, `get_company_brief` | tools.ts | Scoped to the person's customers through `scopeOf` |
| `search_orders`, `get_order`, `get_exceptions`, `get_order_file` | tools.ts | `get_order` carries `development` after a handover |
| `get_party`, `get_messages`, `get_ledger`, `get_gates`, `get_team` | tools.ts | `get_party` never includes bank accounts (it does not today; keep it so) |
| `search_styles`, `get_style`, `get_style_file`, `diff_tech_pack`, `get_samples`, `get_materials`, `get_schedule` | style-tools.ts | Only when the token carries the development track |
| `get_compliance` | tools.ts | Only when the ESG add-on is on |

Write, only when the token was issued with `writes: true`:

| Tool | What happens | Why it is safe |
|---|---|---|
| `queue_draft` | Draft lands in the queue with the stream's gate level | Never sends. The caller is `trigger: 'mcp'`, so `routeDraft` is skipped and no agent layer approves it (see section 5) |
| `set_milestone` | Reported expected date on a milestone, ledger row | Same as the chat agent; a person can see and undo it on the order page |
| `record_sample_event` | Sent, received or due date on a round | Never a decision |
| `record_compliance_value` | A value on a compliance task | Append-only submission, report approval stays with a person |

Never on MCP, in any version: `request_approval` (at L2+ it sends), `search_mailbox` (a personal mailbox is read only in a chat run by the signed-in person), `navigate` (UI only), sample decisions, tech pack confirmation, style status, handover, report approval, channel or member admin, anything that reads `party_bank_accounts`.

## 3. Token table

Migration `0025_mcp_tokens.sql`, schema `merch`, RLS on.

```sql
create table merch.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  membership_id uuid not null references merch.memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                          -- "Claude Desktop, laptop"
  prefix text not null unique,                 -- first 12 chars after vm_, for lookup
  hash text not null,                          -- sha256 of the full secret; the secret is shown once
  tracks text[] not null default '{production}',
  writes boolean not null default false,
  expires_at timestamptz not null,             -- 90 days max from issue
  last_used_at timestamptz,
  last_client text,                            -- clientInfo.name from initialize
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on merch.mcp_tokens (tenant_id, membership_id);
alter table merch.mcp_tokens enable row level security;
-- read: the owner of the token, owners and managers of the tenant, platform admins
-- insert, update, delete: nobody but the service role (server actions do the work after a role check)
```

Token format `vm_<prefix><secret>`: prefix 12 chars, secret 32 chars, base62. Only the hash is stored. The person copies the token once from the profile page. `tracks` is a subset of `memberships.tracks` at issue time and is intersected again on every call, so losing a track in the members table disables that part of the token at once. `writes` is false for `viewer`, `qc`, `compliance`, `logistics` and `partner`; partners cannot issue tokens at all in phase 1.

A ledger row on issue and on revoke (`p_channel: 'MCP'`, stream `null`, what `MCP token "Claude Desktop, laptop" issued, expires 7 Feb 2027`). Every tool call also writes to `agent_runs` with `trigger = 'mcp'`, `model = clientInfo.name`, `tools_called` as today, tokens and cost zero.

## 4. Route

`web/src/app/api/mcp/route.ts`, Node runtime, `maxDuration = 55`, pinned to `sin1` like everything else. Streamable HTTP in stateless JSON mode: POST only, every request carries `Authorization: Bearer vm_...`, no session, no SSE stream kept open (Hobby functions cannot hold one). GET and DELETE return 405. `@modelcontextprotocol/sdk` 1.32 supports zod 4, which the repo already uses, so the existing `betaZodTool` schemas convert without a second schema layer: one small adapter maps `{ name, description, inputSchema, run }` to `server.registerTool`.

Per request:

1. Parse the bearer, look up by prefix, compare the hash in constant time, reject if revoked or expired. 403, no detail.
2. Load the membership and tenant settings in one `Promise.all` (same pattern as the pages). Build `AgentCtx` with `trigger: 'mcp'`, `agentName` set to the client name, `userId`, `userName`, `role`, `scope: scopeOf(membership)`, `track` from the `track` argument the client passes or the token's first track.
3. Register the allowed tools for that token, hand the request to the server, return the JSON.
4. Update `last_used_at` and `last_client`, write the `agent_runs` row.

Track: the server exposes one `track` parameter on every development tool rather than two servers. Clients that only have production never see the development tools in `tools/list`.

Rate limit: 60 calls a minute per token, counted in `agent_runs`, 429 above it. Enough for an agent working one PO, low enough that a runaway loop cannot cost the Supabase free tier.

Ledger actor for writes: `<client name> (for <person>)`, the same shape as `Mira (for Richard)`, so the ledger shows who asked and through what.

## 5. Changes to existing code

- `AgentCtx.trigger` gains `'mcp'`. `queue_draft` already skips `routeDraft` unless the trigger is `inbound` or `schedule`, so MCP drafts wait for a person. Add `'mcp'` to the `agent_runs.trigger` comment and to the admin console's run filter.
- `toolsFor(ctx)` returns all tools; add `toolsNamed(ctx, names)` that returns the subset, so the MCP route and the `agents.tools` column (empty = all) use the same filter.
- Profile page: a "Connected agents" card listing the person's tokens (name, client, last used, expiry, tracks, writes) with Create and Revoke. Owners and managers see every member's tokens on the Team page and can revoke them. Strings in all six `messages/*.json`.
- Connections page: the "VIA agent channel" entry moves from `via` to `stage1` once the route works end to end with Claude Desktop, with the connect button opening the profile card. The three-layer explanation gains a line: a member's own agent reads the record through MCP and can only queue, never send.
- `/trust` and `/privacy`: one sentence each. Tokens are issued by the member, expire in 90 days, are hashed at rest, and give an outside agent read access to the same records the member sees plus the approval queue; nothing is sent by that agent.
- `.env.example`: no new secret. The token hash needs no key; `MERCH_TOKEN_KEY` is not used here.

## 6. Tests

- Unit: token parse and hash compare, allow list per role and track, `queue_draft` under `trigger: 'mcp'` never reaches `routeDraft`.
- Route: `tools/list` for a production-only viewer token shows reads only; a manager token with writes and both tracks shows the full list; a revoked token gets 403; the 61st call in a minute gets 429.
- Manual: Claude Desktop `claude_desktop_config.json` with the URL and bearer, ask "what needs me on PO 48812", see the `agent_runs` row and the ledger untouched; ask it to chase the mill, see the draft in the queue with the gate level and nothing sent.

## 7. Order of work

1. Migration 0025 and `lib/mcp-tokens.ts` (issue, verify, revoke, list). Half a day.
2. Route with the read list and the adapter. Half a day.
3. Profile card, Team page revoke, six message files. Half a day.
4. Writes behind the `writes` flag, `trigger: 'mcp'` plumbing, tests. Half a day.
5. Catalogue, Connections text, trust and privacy, Notion build log entry. One hour.

## 8. Phase 2: partner tokens and the inter-company channel

The catalogue entry describes two VIA Merch companies exchanging WIP, status, trace and booking records agent to agent. That needs a token issued by one company to a party, not to a member: `mcp_tokens.party_id` instead of `membership_id`, the role `partner`, and the read set limited by `merch.partner_style_ok` and the ESG partner policies that already exist. The surface is `get_order` for POs where the party is customer or factory, `get_samples` and `get_schedule` for shared styles, `get_compliance` for the party's own tasks, and a `post_comment` write that lands as a `records` row of kind `fit_comment` through the same path as `shared/actions.ts`. No draft queue, no ledger, no conversations. Build it when the first customer and supplier pair both run VIA Merch, not before.

## 9. Decisions taken

- One server, token auth, no OAuth. OAuth for MCP clients needs a dynamic client registration endpoint and an authorisation server; a 90-day personal token that the member can revoke covers the pilot and matches how the WhatsApp pilot takes a system-user token.
- `request_approval` stays off MCP. The chat agent earns L2 sending by running under VIA's prompt and VIA's logging. An outside model does not.
- Stateless JSON mode, not SSE. Hobby function limits and `sin1` pinning make a held stream the wrong shape; every MCP client in use today works in stateless mode.
- Tools, not resources or prompts. Resources would duplicate `get_order_file` and `get_style_file`; the clients that matter call tools.
