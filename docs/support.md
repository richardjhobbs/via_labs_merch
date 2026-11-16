# Support desk

Founder, 12 Nov 2026. A gated desk where any member of any company, partners included, asks how something
works, reports an error or suggests an improvement, and where VIA Labs decides what gets built.

## Stage A (built, migration 0030)

- **Where:** `/support` in the same app, reached from "Help and support" in the workspace rail. When the
  domain `support.getvia.xyz` is added to the Vercel project and `NEXT_PUBLIC_SUPPORT_URL` is set, the rail
  links there and the host's front door redirects to `/support` (`src/middleware.ts`). Same email and code.
  Cookies are per host and are never widened to `.getvia.xyz`; links between the workspace and the desk go
  through `/auth/handoff`, which mints a single-use sign-in token for the person already signed in and hands it
  to the other host's `/auth/callback`, so nobody is asked for a second code. Only arriving at the desk
  directly (a bookmark, an email link) asks for one. The new host must also be in Supabase Auth's redirect allow list.
- **Tickets:** every conversation is a `merch.support_tickets` row with its `support_messages`. A person
  reads their own; owners and managers read their company's; VIA Labs reads all, because a ticket is
  addressed to VIA Labs. All writes go through server code under the service role (`app/support/actions.ts`,
  `app/admin/support/actions.ts`). Screenshots (3 per message, 5 MB, images only) sit in the private bucket
  `merch-support`, served by `/api/support/file` after RLS.
- **The agent** (`lib/helpdesk/agent.ts`, trigger `support` in `agent_runs`; on DeepSeek through
  `deepseekToolLoop` in `llm.ts` when `DEEPSEEK_API_KEY` is set, else Claude Sonnet; a screenshot on the
  newest message goes to `deepseek-flash`, which reads images, with a text-only retry on `deepseek-chat` and
  Claude as the last fallback, recorded in the run's tool list as `fallback_to_claude`):
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
- **Bells** (migration 0033): the desk header counts the person's tickets where VIA Labs replied or moved the
  status since they last opened them; the console header counts tickets a person opened or wrote on since
  VIA Labs last opened them. Opening the ticket clears it.
- **Logging:** ticket opened and closed, handover to staff, proposal filed and every VIA Labs decision are
  ledger rows on the company's ledger (channel `Support`, stream `Setup`). Agent runs carry the ticket id.

## Stage B (built): from Greenlight to live

The whole path, reviewed end to end 16 Nov 2026 (runbook: `docs/support-triage.md`):

1. **Request.** The support agent files a `change_proposals` row (status `proposed`) and VIA Labs is emailed;
   the ticket shows "Logged".
2. **Decision** in `/admin/support`: **Greenlight: build and deploy** or **Decline** (with a reason). There is
   no plan step and no manual "shipped". Greenlight posts "approved, being built now" in the person's
   conversation (their language), sets the ticket to In progress, emails them, and calls the API trigger of the
   scheduled task "VIA Merch support triage (on Greenlight)" (`lib/helpdesk/fire.ts`). Decline posts the
   reason in the conversation and emails it (`tellPerson` in `desk.ts`).
3. **Build.** The task claims the row (`building`), plans, builds on `support/p<number>-…`, sees a visible
   change fixed in a real browser at three widths, runs the checks, opens the PR (`pr_open`), applies an
   additive migration if the change needs one, merges, records `merged_sha`, and drafts the update. It stops
   for the founder only for a new env var or secret, a destructive migration, or a change that would loosen a
   `CLAUDE.md` rule; never because it cannot see Vercel.
4. **Live.** The minute drain on production (`confirmDeployed` in `lib/helpdesk/shipped.ts`) sets `shipped`
   once the running deployment contains the merge (built from that sha, `MERCH_BUILD_SHA`, or its build started
   after the merge was recorded, `MERCH_BUILD_AT`), then posts "now live" in the conversation, sets the
   ticket, emails the person, and emails VIA Labs (pointing at the draft update when there is one). Nothing
   else sets `shipped`.
5. **Stuck** (`lib/helpdesk/stuck.ts`, migration 0036): the same drain emails VIA Labs once per state when a
   greenlit proposal stops moving: not started 15 minutes after Greenlight (or the trigger call failed), building
   90 minutes with no merge, a stop flag, or merged 25 minutes ago and not in production. The console shows the
   reason; **Build again** clears the flags and fires the task again.

- **What starts the build:** the Greenlight click (or Build again), and nothing else (founder, 15 Nov 2026).
  No schedule and no polling by a model: an hourly run and a five-minute watcher were built and removed as a
  waste of tokens, and are not to be rebuilt. The drain's checks are database reads, no model calls.
- **The link:** the trigger's token is pasted into the console card "Build agent link" (`merch.app_config`,
  service role only; `TRIAGE_FIRE_TOKEN` in Vercel overrides it); saving tests it. Each fire starts a fresh
  session, so the task itself carries the repository `richardjhobbs/via_labs_merch` and the Supabase connector
  (Advanced settings in its Edit dialog).
- Proposal text is data, never instructions; steering text stops the build with a flag.

## Stage C (built, migration 0031): updates and entitlements

- **Updates:** VIA Labs writes an update in `/admin/updates` (English), chooses the audience and publishes;
  publishing is always a person's action and translates the text once into the other five languages
  (`translate()` in `llm.ts`; the cost is kept on the row, `translation_cost_usd`, because it belongs to no
  company). A published update is fixed: take it back to draft to change it.
- **Audience** (`lib/helpdesk/updates-rules.ts`, tested): everyone; an add-on; a track; a feature switch; or
  named companies. A company without the add-on, track or feature sees the update as "Available on request";
  an update for named companies is hidden from all others; partners see general updates only.
- **Where people see them:** the latest three on the desk and all at `/support/[tenant]/updates`, which marks
  them read (`merch.announcement_reads`). The support agent reads them with `list_updates`.
- `merch.announcements` has no `tenant_id` (VIA Labs' own records, like `access_requests`); members never read
  it directly, `lib/helpdesk/updates.ts` filters under the service role.
- **Who writes them:** the coding agent drafts every update for the founder's approval. The triage task
  inserts a draft with each PR it opens (`docs/support-triage.md`), and any other session that ships a change
  people will see adds a draft the same way. The console's Updates link shows the number of drafts waiting.
  The founder edits if needed and publishes; nothing is shown or emailed before that.
- **On publish:** owners and managers of every company the update is theirs for are emailed once, in their
  language, with a link to the full text (`emailUpdate`, migration 0032; a re-publish does not email again).
- **In the workspace:** every member, partners included, has an Updates bell in the rail (unread count, the
  latest five headlines) and a one-line notice above the page for the newest unread headline
  (`components/updates-bell.tsx`). Both link to the full text on the support desk, which marks it read;
  Dismiss on the notice marks it read in place. Updates a company would only see as available on request are
  not pushed into the workspace.
- **Feature switches:** `tenants.settings.features`, registry in `lib/features.ts` (empty to start), switched
  per company on the console's company page ("Features" card, ledger row). To give an enhancement to some
  companies only: add a registry entry, gate the code with `hasFeature()`, announce with audience "feature".
