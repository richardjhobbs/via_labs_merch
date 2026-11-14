# Tester programme

Founder, 14 Nov 2026. An open invitation to people in production, merchandising, product development, sourcing, manufacturing and brands to try VIA Merch and say what they think. Migration 0034, `web/src/lib/testers.ts`, `web/src/app/try`, `web/src/app/admin/testers`, `web/src/components/feedback.tsx`, `web/src/lib/sample/worlds.ts`.

## What a tester gets

- One link from the founder: `/try?k=<access word>` (optional `&ref=<tag>` to see where they came from). They give name, email, company and line of work, then sign in with the usual emailed code. No password, and the 2-hour idle rule applies.
- `/try/start` offers three practice companies: a brand (Northline), a buying office (Meridian Sourcing) and a manufacturer (Hai Phong Garment JSC). Opening one makes the tester's own private copy.
- In their copy they are the owner and can work as any role (owner, manager, merchandiser, QC, compliance, logistics) from the bar at the top of every page. "Start again from fresh" sets the copy aside and makes a new one.
- A Feedback button on every page: a tag (works well, confusing, something missing, broken), a typed or dictated note, or a recorded voice note of up to two minutes. The page, practice company, role, track and language travel with it.

## Isolation

No tester sees another tester or anything another tester does: every tester has their own company (`tenants.settings.sandbox = true`, a row in `merch.tester_sandboxes`), and the ordinary tenant RLS does the rest. The made-up colleagues in a practice company are sign-ins on reserved `.example` addresses; nobody can sign in as them and they are never emailed.

Nothing leaves a practice company. It cannot connect a mailbox, Drive, WhatsApp, Zalo, a forwarding address or a PLM, invite team members or partners, or issue MCP tokens. Background work skips it (hourly sweep, morning brief, capacity pass, compliance pass, first briefs, alerts, update emails); the agent runs only when the tester asks it something or acts, up to `SANDBOX_DAILY_CAP_USD` a day, after which chat rests until tomorrow.

## Practice companies (templates)

A practice company is an ordinary company marked `settings.template = { world, frozen_at }`. The console page `/admin/testers` sets each one up from `lib/sample/worlds.ts` (company, made-up team, customers, suppliers, POs, conversations, first inbound messages), with the founder as owner. It then runs like any company so the agents write their briefs and drafts, and the founder can change anything by hand, including adding styles and tech packs for the development track.

**Freeze** it when it looks right. Frozen, background work leaves it alone and testers get copies of it as it stood. **Thaw** to change it; new testers wait until it is frozen again. Existing copies never change.

`merch.sandbox_clone(source, user, name, email, slug, company name, settings, days)` makes a copy:

- every row gets a new id and references follow; the ledger is copied in order with its hash chain recomputed;
- every date and timestamp moves forward by the whole days since the template was frozen, so the copy is current;
- real people in the template (sign-ins outside `.example`) are replaced by the tester: one membership, and their names and emails in text become the tester's;
- not copied: channels, invites, tokens, support conversations, bank accounts, mail attachments, usage and agent run logs.

Messages already in a template are copied. Only use a company as a template if every message in it is a sample one.

Copies are never deleted (the ledger is append-only). A retired copy keeps its rows and loses its member.

## Feedback

`merch.tester_feedback`, written only by server code; recordings in the private bucket `merch-feedback`. `/admin/testers/feedback` lists notes with filters, plays recordings, marks them read or actioned, downloads a CSV, and writes a summary of all written and dictated notes with Claude Sonnet (themes, what to fix first, by kind of business). Dictation is the browser's speech recognition, as in the Ask box; recordings are not transcribed.

## Programme settings

`app_config` key `tester_program`: open or closed, the access word, the most testers. Closed or without the right word, `/try` says the programme is by invitation.

## Not built

- A simulated reply from a supplier or customer, so a tester sees the agent handle new inbound mail.
- Automatic removal of old copies.
- Transcription of recorded voice notes.
