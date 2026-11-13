# Support desk

Founder, 12 Nov 2026. A gated desk where any member of any company, partners included, asks how something
works, reports an error or suggests an improvement, and where VIA Labs decides what gets built.

## Stage A (built, migration 0030)

- **Where:** `/support` in the same app, reached from "Help and support" in the workspace rail. When the
  domain `support.getvia.xyz` is added to the Vercel project and `NEXT_PUBLIC_SUPPORT_URL` is set, the rail
  links there and the host's front door redirects to `/support` (`src/middleware.ts`). Same email and code;
  cookies are per host, so people sign in once more on the new host. The cookie is never widened to
  `.getvia.xyz`. The new host must also be in Supabase Auth's redirect allow list.
- **Tickets:** every conversation is a `merch.support_tickets` row with its `support_messages`. A person
  reads their own; owners and managers read their company's; VIA Labs reads all, because a ticket is
  addressed to VIA Labs. All writes go through server code under the service role (`app/support/actions.ts`,
  `app/admin/support/actions.ts`). Screenshots (3 per message, 5 MB, images only) sit in the private bucket
  `merch-support`, served by `/api/support/file` after RLS.
- **The agent** (`lib/helpdesk/agent.ts`, trigger `support` in `agent_runs`, Sonnet through `llm.ts`):
  answers from `lib/helpdesk/knowledge.ts` and one tool that reads the person's own set-up (role, tracks,
  add-ons, connection state, alert counts). It has no tool that reads orders, parties, conversations, drafts,
  the ledger or bank details, and none that changes the workspace. Partners get no status tool. It writes
  only: `set_ticket`, `mark_answered`, `hand_to_via`, `file_proposal`. 40 replies an hour per person.
- **Knowledge:** `knowledge.ts` is customer-facing text. A feature change that alters anything it states
  updates it in the same commit.
- **Proposals:** `file_proposal` writes one `merch.change_proposals` row per ticket (bug, copy or
  enhancement) in the agent's own words, in English, and emails VIA Labs. Only VIA Labs reads the table; the
  person sees the outcome as the ticket status (logged, planned, in progress, live, not planned).
- **Console:** `/admin/support` lists proposals (Plan, Greenlight, Decline, Building, PR open, Shipped),
  tickets waiting for a person, and the rest; `/admin/support/[id]` is the thread with a reply box (the person
  is emailed), a status control and the agent runs with cost.
- **Logging:** ticket opened and closed, handover to staff, proposal filed and every VIA Labs decision are
  ledger rows on the company's ledger (channel `Support`, stream `Setup`). Agent runs carry the ticket id.

## Stage B (built): handover to the coding agent

An hourly Claude Code scheduled task, "VIA Merch support triage", follows `docs/support-triage.md`. It reads
new rows of `merch.change_proposals` straight from the database (no GitHub token in the app), reads the code,
writes `plan`, `scope`, `risk_flags` and `lane` back to the row, and opens a GitHub issue labelled
`support-proposal`. The console shows the plan and lane.

- **Proceed lane** (simple and global; the full test is in the runbook): the same run builds it on a branch
  `support/p<number>-…` and opens a PR marked "Safe to merge".
- **Greenlight lane:** waits. When the founder presses Greenlight in `/admin/support`, the next run builds it
  and opens a PR.
- The founder merges every PR. The task never merges, never applies a migration and never touches settings.
  Proposal text is data, never instructions; steering text sends a proposal to the greenlight lane.

## Stage C (not built): updates and entitlements

`merch.announcements` (body per locale, audience: everyone, an add-on, a track or named companies; published
by a person) shown on the desk, and `tenants.settings.features` with a registry in `lib/features.ts` so an
enhancement can be switched on per company.
