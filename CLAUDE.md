# CLAUDE.md — via_labs_merch

VIA Merch, the live product at merch.getvia.xyz: agents for merchandising teams in buying offices, brands, factories and trading companies. Separate from the getvia.xyz site (repo `via_labs`, which keeps the `/merch` demo) and the VIA App (repo `via-app`).

## Layout

- `web/` Next.js 15 (App Router, TypeScript, Tailwind v4, next-intl). `src/app/(public)`: landing, login, invite. `src/app/app/[tenant]`: the workspace. `src/app/admin`: the VIA console. `src/app/api/{jobs,webhooks,mcp}`.
- `supabase/migrations/` SQL applied to the shared Supabase project **VIA Labs Projects** (`jiimjfqkeuvveculyill`). All Merch objects live in schema **`merch`**; never create tables in `public` (other VIA Labs apps own it). Apply with the Supabase MCP `apply_migration` and commit the file.
- Every table has `tenant_id` and RLS. Reads: members of the tenant and platform admins. The ledger is append-only and written only through `merch.ledger_append()`.

## Rules

- Sign-in is a code or magic link on every visit; sessions are browser-session cookies and end after 2 hours idle (`src/middleware.ts`, `merch.sessions`). Do not add "remember me".
- Nothing the agent drafts is sent without the stream's gate allowing it; price, claims and order confirmation are capped at L1.
- Jobs run from `/api/jobs/drain`, called every minute by `merch.tick()` (pg_cron + pg_net) with the `x-merch-jobs` secret. Keep each drain under 55 s.
- UI strings go through `messages/*.json` (English first, German complete; others fall back to English).
- Hosting is Vercel Hobby and Supabase free until Richard confirms the design; do not add Pro-only features.

## Env vars

See `web/.env.example`. Secrets live only in the Vercel project `via-labs-merch`.

## Notion build log

Update after every meaningful deploy: page "Build Log - VIA Merch (Phase 1+)" under "Build Logs - All Repos (Index)" (id `3b4dbc7b67f28185b446cf4c84895f47`). Entries are `## Phase N - Title (D Month YYYY)` with **What was built** / **What failed** / **Key learning** / **Key files** / **Verified**, appended at the end before the `*Last updated:*` footer. Phase numbers never reset.
