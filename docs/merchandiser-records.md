# Merchandiser work and the record of it

Founder note, 29 October 2026. Product principle for VIA Merch. Read before designing any feature that touches samples, approvals, QC, documents or the ledger.

## The concern we have to answer

The first objection from a buying office, brand or factory will be: "A large part of our merchandisers' work is manual and stays manual. Garment reviews, fit and PP sample assessments, measuring against the spec, checking adherence to the tech pack, agreeing and recording modifications, lab dips, strike-offs, inline and final inspections. An agent cannot do those. So what does your system do with that work?"

The answer is not that the agent replaces the merchandiser. The answer is that everything the merchandiser does and records lands in the same system as everything the agent does, so one auditable, checkable trail runs from development through production to the goods leaving the factory door, onto the boat or plane, and into the hands of the brand or retailer.

VIA Merch empowers merchandisers. It does not remove them.

## What this means for the product

1. **Manual work is a first-class record, not an exception.** Every work-in-progress and development artefact has a home in the data model and the UI: tech pack and spec versions, sample rounds (proto, fit, size set, PP, shipment sample), measurement sheets against spec with tolerances and pass or fail per point of measure, comments and requested modifications, approvals and rejections with who, when and against which version, lab dips and strike-offs, trims and accessories approvals, test reports, inline and final inspection reports, packing and shipping documents.

2. **Any input route is valid.** The merchandiser types it in the workspace, uploads a photo or a PDF, forwards an email, sends a WhatsApp or WeCom message, pastes a sheet, or a third party (factory QC, a lab, an auditor, the brand's own technologist, a forwarder) supplies it through a channel or the portal. The agent extracts, structures and files it; the person confirms. The source and the raw original are kept alongside the structured record. Nothing is rekeyed by hand into a second system.

3. **Every record is linked to the order and the milestone.** A fit comment belongs to PO, style, colourway, size and sample round. An inspection report belongs to the PO and the `inline` or `final` milestone. The milestone date moves only with a record behind it.

4. **Every record is in the ledger.** Who did what, when, from which channel, against which version, and under which gate. Human entries and agent entries sit in the same hash-chained, append-only ledger (`merch.ledger`, written only through `merch.ledger_append()`). The actor is the person, `Agent (for Person)`, or the agent alone for inbound, as today. A reviewer, an auditor or the customer can later reconstruct the full history of a style without asking anyone.

5. **Versions, not overwrites.** Spec, tech pack, measurement sheet and approval records are versioned. A modification creates a new version that references the one it changes and the reason. Earlier versions stay readable.

6. **The agent works from these records.** The briefing, exception detection, chasing and drafting use the merchandiser's own entries: a failed measurement at fit becomes a risk on the `pp` and `exf` dates; an open PP approval blocks the cut milestone; a final inspection fail holds the shipping advice. Better human records make a more useful agent, and the merchandiser sees that payoff directly.

7. **Checkable by the counterparty.** The brand or retailer buying the goods, and the factory making them, can be given read access to the records that concern them, scoped by party, so the trail is shared evidence rather than one side's notes.

## Why

Efficient, better quality, on-time production depends on information arriving where it is needed, complete and trusted. Today that information is split across email, chat, spreadsheets, PLM exports and people's memory. Putting the manual work and the agent's work in one record is what turns an inbox assistant into the system of record for the order.

## Open design items for the main session

- Data model for samples, measurement sheets, approvals and inspection reports in schema `merch` (today only `milestones.note` and `attachments.parsed` hold any of this).
- Extraction prompts for measurement sheets, inspection reports and test reports (Haiku, via `src/lib/llm.ts`), with human confirmation before the record is final.
- Workspace screens for sample rounds and measurements, and the ledger entries they emit.
- Party-scoped read access for brand and factory users.
- Decide how a modification to spec is approved: which stream and which gate level (price, claims and order confirmation stay capped at L1).
