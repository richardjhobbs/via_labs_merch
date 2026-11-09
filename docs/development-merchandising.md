# Development merchandising: research and plan

Founder brief, 9 November 2026: everything built so far starts when a PO is placed. The work before it, design briefs, tech packs, material and trim sourcing, sample schedules, sample rounds and approvals, most of it inside a customer's PLM and the rest arriving as photos, scans and references from anywhere, is a second line of work. It must run as its own channel through the whole system, alongside production, with people who may work in both and a point where development hands over to production. This document is the research and the plan. Decisions taken on 9 November 2026: the style is the anchor, development is a tenant switch now and priced later, sample approvals stay a person's action. Stage A (section 5) was built the same day; Stages B to E are not built. Where this document and the code differ, the code and CLAUDE.md are current.

## 1. Vocabulary

The code already uses "channel" for a connector (`merch.channels`: Gmail, WhatsApp, Zalo). To avoid two meanings, this plan calls the two lines of work **tracks**: `development` and `production`. The UI can call them Develop and Produce. Every record that can belong to one line of work or the other carries `track`.

## 2. What development merchandising is, in records

A development desk (buying office, brand, factory or trading company) works per **style** per **season** for one customer. The style goes through roughly this path, with the customer's calendar setting the dates:

| Step | What arrives or leaves | Who | Today in VIA Merch |
|---|---|---|---|
| Design brief | Sketch, mood board, reference garment or photo, target price, target market, delivery window | Customer design, buying | Nothing; the "Tech pack forwarding" and "General enquiries" streams catch the mail |
| Tech pack and spec | Tech pack PDF or Excel (sketches, construction, BOM, colourways, POM table with tolerances, labelling, packaging), often v1, v2, v3 | Customer tech or PLM export | Attachment stored, nothing extracted |
| Material and trim sourcing | Fabric quality, composition, weight, finish, hand feel; swatches, hangers, lab dips, strike-offs; trims and labels; MOQ, lead time, price | Mills, trim suppliers, agents | "Material sourcing" stream exists; no record |
| Sample schedule | Proto, fit, size set, salesman samples, PP, with dates per round, who makes them (factory sample room or a separate sample facility) and the courier | Development merchandiser with the maker | Nothing |
| Sample rounds | Sample sent (courier, AWB), received, reviewed; measurement against spec; fit and construction comments; approved, approved with comments, rejected, resubmit | Customer tech, fit model session, factory | Nothing (`milestones.note` only) |
| Costing | Cost breakdown, quote, counter, target price negotiation | Factory, development merchandiser, customer buying | "RFQ and quotes" and "Price clarification" streams; price capped at L1 |
| Testing | Fabric and garment test reports (shrinkage, colourfastness, pilling, restricted substances) | Labs | ESG per_order requirements handle some of it, after a PO exists |
| Adoption and PO | Customer adopts the style, issues the PO | Customer buying | The PO is where VIA Merch starts today |

Three facts shape the design:

1. **The anchor is the style, not the PO.** Development has no PO. Styles get dropped, merged, carried over to the next season, and one style can become several POs (by customer, destination, delivery). `orders.style` is a free text field today.
2. **Versions and rounds, not dates alone.** Production is a critical path of ten dated milestones. Development is tech pack versions and sample rounds, each a decision against a version, and the schedule is per style and per customer, not one fixed chain.
3. **The customer's PLM is the system of record for the customer, not for the merchandiser.** The merchandiser's work spans PLM, email, WhatsApp, photos and old references. VIA Merch's job is the same as in production: one trail of everything, with the PLM as a source and a destination, not a replacement.

## 3. How it sits alongside production

### 3.1 One tenant, two tracks, one ledger

Separation is at the level of streams, gates, queue, briefing, agent prompt and navigation. Storage is shared: one `merch` schema, one ledger, one set of parties and contacts, one set of connectors. Reasons: the same factory and the same customer appear in both tracks; the same mailbox carries both kinds of mail; handover must be a pointer move, not a copy between two systems; and a hash-chained ledger split in two cannot be audited as one story of a style.

Concretely:

- `track` column (`development` or `production`, not null) on `gates` (part of the primary key), `drafts`, `threads`, `messages`, `agents`, `ledger`, and the new `alerts` rows. Existing rows backfill to `production`.
- `STREAMS` becomes two lists. Production keeps its fourteen. Development gets: Design briefs, Tech packs and specs, Material sourcing (moved from production), Sample schedule, Sample comments and approvals, Lab dips and strike-offs, Costing and quotes, Testing, General enquiries. Gates are per (tenant, track, stream). Caps stay: price and order confirmation at L1; **sample approval decisions are L0 for the agent in both tracks** (the agent records a person's decision, never makes one).
- `memberships.tracks text[]` default `{production}`; a person can hold both. The workspace shows a track switch in the top bar only to people with both. The switch sets a cookie, like `merch_locale`, and every list, queue, briefing and the assistant read it. People with one track never see the switch.
- `tenants.settings.tracks` switches development on per company in the VIA console, like the ESG add-on switch. Pricing is a later decision; the switch exists from the start so production-only customers see nothing new.
- The agent: one agent record per track per tenant (`agents.track`), with a prompt per track and a tool list per track, through the same `run.ts` loop. The inbound pipeline picks the track first (section 3.3), then runs that track's agent.
- Alerts: `silence` generalises from "milestone due and nothing from that party" to "sample round or swatch due and nothing from the maker". Same table, `track` column, same escalation.

### 3.2 Development data model (schema `merch`, new migration)

| Table | Purpose | Key columns |
|---|---|---|
| `styles` | The development file. One row per style per season per customer. | `tenant_id`, `customer_id` (party), `code` (customer's style number), `name`, `season`, `category`, `status` (`brief`, `developing`, `sampling`, `costing`, `adopted`, `handed_over`, `dropped`), `owner_user_id`, `target_price`, `currency`, `target_delivery`, `plm_ref` (id in the customer's PLM), `meta` |
| `records` | Every versioned artefact, both tracks. Answers the open item in `docs/merchandiser-records.md`. | `tenant_id`, `track`, `kind` (`brief`, `tech_pack`, `spec`, `bom`, `colourway`, `fit_comment`, `measurement_sheet`, `photo`, `scan`, `test_report`, `inspection_report`, `reference`, `other`), `style_id`, `order_id`, `sample_id`, `material_id`, `version`, `supersedes_id`, `source` (`plm`, `email`, `upload`, `forward`, `drive`, `whatsapp`, `agent`), `source_message_id`, `storage_path` (private bucket `merch-development`), `filename`, `mime`, `parsed` (structured extraction), `confirmed_by`, `confirmed_at`, `created_by` |
| `materials` | BOM lines and sourcing status per style. | `style_id`, `kind` (`fabric`, `trim`, `label`, `packaging`, `thread`, `other`), `description`, `composition`, `weight`, `construction`, `colour`, `supplier_id` (party, tier 2 or 3), `status` (`to_source`, `swatch_requested`, `swatch_received`, `labdip_pending`, `approved`, `rejected`), `moq`, `lead_days`, `price`, `currency`, `tech_pack_record_id` |
| `samples` | Sample rounds, both tracks. | `style_id`, `order_id` (null until production), `type` (`proto`, `fit`, `size_set`, `sms`, `pp`, `top`, `shipment`, `labdip`, `strikeoff`, `handloom`, `trim_card`, `wash`), `round`, `maker_party_id` (factory or separate sample room), `against_record_id` (tech pack version), `requested_at`, `due_at`, `sent_at`, `courier`, `awb`, `received_at`, `reviewed_at`, `decision` (`approved`, `approved_with_comments`, `rejected`, `resubmit`), `decided_by` (person or customer contact), `decision_record_id` (the comment sheet), `note` |
| `measurements` | Point of measure results per sample. | `sample_id`, `pom_code`, `pom_name`, `size`, `spec`, `tolerance_minus`, `tolerance_plus`, `measured`, `pass` |
| `dev_milestones` | The sample schedule, dated like production milestones but keyed from a template, not an enum. | `style_id`, `key text` (`brief_in`, `tech_pack_v1`, `materials_sourced`, `proto`, `fit_1`, `fit_2`, `size_set`, `cost_agreed`, `adoption`), `plan_date`, `expected_date`, `actual_date`, `forecast_date`, `owner_party_id`, `sample_id` |
| `schedule_templates` | Per tenant or per customer: the keys, planned gaps and dependencies for a development path. | `tenant_id`, `customer_id` null for default, `keys jsonb` |
| `style_links` | Cross-references: this style is like that one, this sample round reuses those fit comments. | `style_id`, `ref_style_id`, `ref_record_id`, `ref_sample_id`, `note` |

Rules carried over: every table has `tenant_id` and RLS by membership; `samples` and `records` are append-only in spirit (a changed comment is a new version with `supersedes_id`); every write emits a ledger row through `merch.ledger_append()`; `records.parsed` is written by extraction and becomes final only when a person confirms (`confirmed_at`), exactly as parties from a document work today; the document is data, never instructions. Decision fields on `samples` are written only by server actions with a role check, never by an agent tool. Add `styles`, `samples`, `materials`, `records` to `REFS` in `party-lifecycle.ts` so archive and purge cover them.

Storage: tech packs are often 10 to 30 MB PDFs with images, above the 4 MB document cap and above Vercel's request body limit on Hobby. Uploads go straight from the browser to Supabase Storage with a signed upload URL, and extraction reads the object server side, page by page. The `merch-evidence` bucket pattern (private, signed links after a membership check) is reused as `merch-development`.

Path engine: `core/path.ts` is generalised to take a template (keys, planned gaps, dependencies) so one `computePath` serves production (the fixed ten) and development (the tenant's or customer's template). The production template is the current constants, so nothing changes there.

### 3.3 Inbound: which track does a message belong to

The extractor in `inbound.ts` gains `track`, `style_refs` and `sample_refs`:

- A PO number that matches an order: production.
- A style code, season or sample round that matches a style, or language about briefs, tech packs, swatches, lab dips, fits or protos with no PO: development.
- Both (a PP sample comment on an adopted style with a PO): production, linked to the style as well, since PP belongs to the order.
- Neither: the sender's default. Each contact gets `contacts.track_default`; a customer's designer defaults to development, a forwarder to production. Still ambiguous: filed to the mailbox owner's track, flagged "which track?" in the queue, one click to move. Moving a thread between tracks is a ledger row.

Threads get `track` and a `style_id`. The order file (`get_order_file`) extends to a style file (`get_style_file`): every conversation about the style with the customer's design, tech and buying, the mills, the sample room and the factory.

### 3.4 Handover from development to production

Handover is an explicit event, by a person, never automatic. Trigger: the customer's PO arrives (document, PLM, email or import) for an adopted style, or the owner clicks "Hand over to production" on the style.

What it does, in one server action and one ledger row:

1. Creates or links `orders` rows with `orders.style_id` (new column) and copies the style's customer, description, category, composition, colours and sizes. `orders.style` text is kept for the imported PO as written.
2. Seeds production milestones from ETD as today (`planFromEtd`), then overrides `fabric` and `labdip` plan dates from the approved materials' lead times when they are known.
3. Sets `orders.mill_id` from the approved fabric material's supplier when there is exactly one, else leaves it for the person.
4. Links open `samples` of type `pp`, `top` and `shipment` to the order (`order_id`). The production `pp` milestone's actual date is the PP round's decision date once approved. Proto, fit and size set rounds stay with the style, readable from the order file.
5. Marks the style `handed_over`. The style can keep developing for a repeat or the next season as a new style row carried over with a `style_links` row.
6. Development records for that style stay readable and are frozen for that order: a spec change after handover is an Amendment in production, against a new `records` version that references the handed-over tech pack version.

The point of handover is the single most valuable thing in this plan for the production agent: it starts the PO with the approved tech pack version, the BOM with suppliers, the fit history and the open PP round, instead of a bare PO line.

### 3.5 Workspace

With the track switch on Develop the rail reads: My day, Queue, Styles, Samples, Materials, Threads, Ledger, then the shared Customers and suppliers, Connections, Agents, Settings. Produce keeps today's rail. Shared pages do not change. New screens:

- **Styles**: list by season and customer with status, next sample due, open comments, last word from the customer. Style file: tech pack versions (diff between versions), BOM and sourcing status, sample rounds with decisions and comments, schedule against plan, threads, ledger, references.
- **Samples**: all rounds across styles, sorted by overdue, awaiting decision, in transit, approved; courier tracking links; the demo screen `via_labs/merch/js/screens/sampling.js` is the starting shape.
- **Materials**: swatch and lab dip requests out, received, approved, by mill.
- **Record a sample review**: the merchandiser's manual work as a form: pick the round, measurements per POM against the spec version (pass or fail computed from tolerance), comments, photos, decision. Any input route: typed, photo of a measurement sheet (extracted then confirmed), forwarded email from the customer's technologist.

All strings in all six message files in the same commit; new party kinds `sample_room`, `designer` and `trim_supplier` in `party_kind`; the country and tier conventions unchanged.

### 3.6 The development agent

Same loop, same gates, same ledger actors. What it does in development:

- **Translate and brief**: a tech pack or brief in English becomes a factory-facing summary in Chinese, Bangla or Vietnamese with the POM table and BOM kept as data, not prose; a factory's question in Chinese becomes an English note on the style. Draft at the stream's gate.
- **Extract and file**: tech pack PDF or Excel to a confirmed `tech_pack` record with BOM lines, colourways and the POM table (`extract()` with a new schema beside `DocSchema`); a new version is diffed against the last and the changes listed on the style and in the briefing ("v3 moved the chest POM tolerance from ±1 to ±0.5 cm; the back neck label changed").
- **Source**: queue swatch, lab dip and strike-off requests to the mills on the Material sourcing stream, with quality, weight, colour standard and quantity from the BOM; log what comes back.
- **Schedule and chase**: propose the sample schedule from the template and the customer's dates; record courier and AWB from emails; chase a maker when a round is due; raise a silence alert when nothing arrives.
- **Compile comments**: the customer's fit comments, measurement sheet and photos into one structured, translated comment sheet to the maker, referencing the tech pack version and the previous round; gated.
- **Cross-reference**: find earlier styles, rounds and comments that match ("same block as 2201 from SS25; fit 2 comments on the armhole applied there") from `style_links` and a text search over `records.parsed`.
- **Cost**: collect quotes, lay them against target price, draft the counter. Price stays at L1.

Tools to add in `tools.ts`: `search_styles`, `get_style`, `get_style_file`, `get_samples`, `record_sample_event` (requested, sent, received; never a decision), `get_tech_pack`, `diff_tech_pack`, `request_material` (queues a gated draft), `propose_schedule`, `find_references`. Existing `queue_draft` and `request_approval` take the track from the run context. Inbound runs still never get `request_approval`.

## 4. PLM integration

Research, 9 November 2026. The statement that most development work runs in a PLM is right for brands and larger retailers; buying offices and factories mostly receive PLM output (tech pack exports and notification emails) and work in email and spreadsheets. The integration surface differs by vendor and is summarised below from what each vendor publishes.

| Vendor | Public API | How access is granted | Objects exposed | Supplier portal | Notes |
|---|---|---|---|---|---|
| Centric PLM | REST module (Centric 8), licensed, no public developer portal, no webhooks | Per customer: a Centric user with rights, set up by the brand | Any object the user can see: styles, BOM, colourways, samples, suppliers | Vendor Portal; no documented third-party write path | Market leader; every integration is a per-brand project |
| PTC FlexPLM | OData REST on Windchill, read and write, no webhooks | The brand's IT creates a Windchill user | Styles, materials, colours, BOM, samples, specs | Vendor Portal | Open, but one instance per brand |
| Infor PLM for Fashion | ION API through Infor OS, no webhooks documented | The brand's Infor OS admin issues credentials | Styles with BOM, colourways, measurements, costing; materials, trims, colours, comments, requests, tasks, documents | Partners add-on; non-system suppliers get an auto-generated email with the tech pack attached | Email route is documented |
| Delogue PLM | Public REST, about 300 endpoints, OpenAPI spec, no webhooks | Self-serve API key from the user profile, staging environment available | Styles, colours, BOM items, files, prices, SKUs, suppliers, sample requests and types, measurement charts, compliance | Suppliers log in, send samples, comment; email notification with a link | The only PLM a small vendor can integrate without a contract |
| Backbone PLM (owned by Bamboo Rose) | REST, no webhooks | Admin creates an API key; support can be asked for access | Products, styles, collections, BOM, users (read) | Collab App: shared tech pack folders, email notification | Tech packs, samples and comments not in the public docs |
| Bamboo Rose | No public documentation | Enterprise sales | Unknown | Large supplier network | Do not plan on it |
| WFX PLM | "Open REST API" claimed, no public reference | On request through sales | Products, attributes, images, costings, orders (marketing) | Vendor Portal with tech packs, samples, RFQs, line comments, change alerts | Ask the customer's vendor |
| Lectra Kubix Link | No public documentation | Lectra account team | Unknown | Supplier users; Kubix Forms for third-party entry | Ask the customer's vendor |
| Coats Digital (FastReact, GSDCost, VisionPLM) | No public documentation | Account team | Unknown | No | Ask the customer's vendor |
| Techpacker | No API; Zapier app with triggers (new comment, new PDF version, stage change) | Zapier connection by the account owner | Tech pack, versions, comments, stages | Share by email to factory addresses; "Send Version" emails the PDF | Email route is the product |
| Browzwear, CLO | Desktop plugin SDKs; CLO-SET has a file upload and download API | Licence | Garments, materials, BOM, renders as files | None (design tools) | Hook is the exported tech pack or project file |
| Inspectorio (QC) | REST plus webhooks (report uploaded, report file ready) | Admin creates API keys in the app, plan dependent | Bookings, inspections, reports, POs, products, CAPA, lab tests, measurement charts | Factories are platform users | Production track; the one vendor with webhooks |
| Pantone, Coloro | Pantone GraphQL for licensees; Coloro none | Licence application | Colour libraries and conversions | n/a | Store colour codes as text; no integration |

Three consequences: no PLM documents webhooks except Inspectorio, so every connector polls from the minute drain; no PLM documents a third-party write path into its supplier portal, so writing back means acting as a vendor user through the same API or not at all; and the brands on Centric and FlexPLM still send PDF and Excel tech packs by email to the people who make the goods.

Design consequences:

- **Three routes in, in this order.** (1) PLM notification emails and tech pack exports already land in the mailboxes VIA connects; the inbound pipeline recognises them by sender domain and subject pattern, files the attachment as a `tech_pack` record with `source = 'plm'` and the PLM reference, and asks the person to confirm the version. No API and no vendor permission needed; this is the honest stage one and covers every PLM at once. (2) A forwarding address per style or per tenant for PLM notifications a person forwards from their phone. (3) API connectors, one PLM at a time. Delogue first: self-serve key, a test environment, and a documented sample request and measurement chart model to check our schema against. Then whichever PLM the first development customer runs, read of styles, tech packs, BOM, colourways and sample requests, and write-back of sample status and comments where the API allows it. FlexPLM and Infor only when a brand's IT grants a user; Centric only with the brand's own REST licence.
- **Write-back is a draft, not a sync.** Where VIA can post to the PLM, the post goes through the queue at the stream's gate like any outbound message, and is a ledger row. Where it cannot, VIA produces the comment sheet in the PLM's import format or as text for the person to paste.
- **Catalogue entries stay `request` until the runtime works end to end** (the existing rule). `channel_kind` already has `plm`; each PLM connection is a channel row with `config.connector`, like Drive.

## 5. Build order

Each item is one or two Build Log phases. Stage A is the smallest version that a development desk can use; nothing in it is throwaway.

**Stage A, the second track (foundation), built 9 November 2026 (migration 0015, `lib/tracks.ts`, `lib/styles.ts`, `lib/records.ts`, `app/[tenant]/styles`)**
1. Migration: `track` on gates, drafts, threads, messages, agents, ledger, alerts; `memberships.tracks`; `tenants.settings.tracks`; `styles`, `records`, bucket `merch-development`; `orders.style_id`. Backfill production. Development streams and default gates.
2. Track switch in the workspace, per-track queue, briefing and ledger views; Styles list and style file with tech pack versions.
3. Tech pack and brief intake: direct-to-storage upload, Drive pick, email attachment, forwarded mail; extraction to a confirmed `tech_pack` record; translation of the construction notes; version diff.
4. Inbound track classification with `track_default` on contacts and the "which track?" queue item.
5. Development agent prompt and the style tools; PLM notification recognition for the first customer's PLM (route 1).

**Stage B, samples and materials**
6. `samples`, `measurements`, `materials`, `dev_milestones`, `schedule_templates`; the generalised path engine; Samples and Materials screens; the sample review form; courier capture; silence alerts on rounds and swatches; comment-sheet compilation.
7. `style_links` and reference search.

**Stage C, handover**
8. The handover action, PP straddle, order file with development history, Amendments against the handed-over version.

**Stage D, PLM connectors**
9. Delogue connector, read only (styles, BOM, sample requests, measurement charts), as the reference adapter; then the first development customer's PLM; then write-back of sample status and comments through the queue. Inspectorio stays a production-track item (QC reports and webhooks).

**Stage E, later**
10. Partner access for the customer's designer or technologist on `/shared` to see and comment on their own styles' rounds (the `partner` role widened to development, scope by party, no workspace pages). Costing sheets (the demo's costing screen) as a record kind. 3D file previews (Browzwear, CLO) as `records`.

## 6. Decisions needed from Richard

1. **Anchor**: style per season per customer, as proposed, or the customer's development request or tech pack number. The proposal assumes a style can carry several tech pack versions and several rounds.
2. **Who the first development customer is and which PLM they run**, since that sets the first API connector and the first notification-email pattern.
3. **Packaging**: development as a tenant switch now, priced later (recommended), or a paid add-on like ESG from day one.
4. **Sample approval**: confirm that approve, approve with comments and reject are always a person's action in VIA (agent at L0 on that stream in both tracks), and that the agent may record a customer's decision stated in an email as that customer's decision, not VIA's.

## 7. What is deliberately not in this plan

- Replacing or mirroring the customer's PLM. VIA stores what the desk receives, produces and decides, with the PLM reference, not the PLM's whole object model.
- Automatic handover on PO receipt. The PO arriving creates the order as today and proposes the link to the style; a person confirms.
- Building a per-brand PLM adapter (Centric, FlexPLM, Infor) before a customer on that PLM exists. Delogue is the exception because it costs nothing to access and proves the adapter shape.
- Agent-made sample decisions, agent-sent price or order confirmation, or any change to the bank account rules.
