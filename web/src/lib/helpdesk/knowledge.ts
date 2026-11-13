// What the support agent knows about VIA Merch, written for the people who use it. It is loaded into the
// agent's cached system prompt (lib/helpdesk/agent.ts). Keep it in step with the product: a feature change
// that alters anything stated here updates this file in the same commit. No table names, env vars, file
// paths or security internals belong here; this text can be quoted to any signed-in person.
export const HELP = `
# VIA Merch: how it works

VIA Merch gives a merchandising team (buying office, brand, factory, trading company, retailer) agents that read the team's channels, keep each order's record and critical path, and draft replies and chasers. It sits on top of the tools the company already uses (email, WhatsApp, spreadsheets, ERP, PLM, portals) and replaces none of them. The workspace is at merch.getvia.xyz.

## Signing in
- Sign-in is by email: enter your address, receive a code, type it in. There is no password and no "remember me".
- A session ends when the browser closes or after 2 hours idle. Then you ask for a new code.
- Sign-in is by invitation. "No account" means the address was not invited: an owner or manager invites people under Settings, Team.
- A code works once. If it fails, ask for a new one and use the newest email. Codes sometimes land in spam.
- The support desk uses the same account. Opening "Help and support" or an update from inside the workspace signs you in to the desk without a second code; going to the desk directly asks for a code.

## Languages
- The interface is available in English, German, Bangla, Chinese, Vietnamese and Spanish. Change it with the flag picker.
- The agent replies in the language you write in. Messages to a customer or supplier are drafted in their language with an English rendering.

## Roles
- Owner and manager: everything, including the team, agent authority, connections for company channels, archive and delete, confirming bank accounts, and granting VIA support access.
- Merchandiser, QC, compliance, logistics: their own work and customers, and they can approve drafts.
- Viewer: reads only and approves nothing.
- Partner: a person at a customer or supplier. They see only "Shared with you" (the compliance records of their party, and their styles if the company runs development). Partners have no assistant and no workspace pages.
- A person can be limited to certain customers (Settings, Team). None ticked means all customers.

## The pages
- My day: what needs you now. The morning brief, alerts, open exceptions and drafts waiting.
- Approval queue: what the agents drafted and may not send alone. Approve, edit and approve, or reject. Every decision is on the ledger.
- Orders and T&A: every PO with its critical path (plan, forecast, status per milestone) and health (red, amber, green). Click anywhere on a row to open the order.
- Conversations: messages from connected channels, grouped by thread and linked to a customer or supplier and a PO.
- Customers and suppliers: the parties, their contacts, country, tier (1 garment factory, 2 fabric mill, 3 fibre or yarn) and bank accounts.
- ESG and compliance: a paid add-on (see below).
- Ledger and autonomy: the append-only record of every action, and the autonomy level per stream.
- Agents: what the agents do, their activity, and what each layer may approve.
- Connections: mailboxes and channels.
- Settings: profile, team, working hours, VIA support access, your own agents (MCP tokens).
- The Ask panel (bottom right on every workspace page) is the company's merchandising agent. It answers from the live record and drafts what you dictate. It is a different agent from this support desk.

## Orders
- Add orders one at a time, import a spreadsheet (xlsx or csv), or add from a document: upload a proforma, invoice or PO (spreadsheet, PDF or photo, up to 4 MB), check the review form, then save. Nothing is written until a person has checked the form. The original file is not stored.
- With Google Drive connected you can pick a Google Sheet or Doc instead of uploading.
- PO numbers are unique per customer. Two customers can use the same PO number; the import flags duplicates with an amber note.
- The critical path is counted back from the ETD. When a supplier or customer states a new date, the agent records it and the forecast for later milestones moves.
- You can export your data as xlsx, csv or json at any time.

## Drafts, gates and autonomy
- Nothing the agent drafts is sent unless the stream's autonomy level allows it. L0: record only. L1: the agent drafts, a person sends. L2: the agent may approve routine messages itself. L3: act within limits.
- Price, claims and order confirmation are always capped at L1: a person decides.
- An approved reply goes out from the mailbox or channel the original message came in on, threaded under it.
- If no channel is connected for that party, an approved draft stays approved and is not sent. Connect the channel to send.
- A failed send appears as an alert on My day with the reason.

## Connections
- Gmail and Microsoft 365 (Outlook): each member connects their own mailbox on Connections. VIA reads only new mail from the moment you connect, and only from known customers and suppliers (their contact addresses and company domains), or one label or folder you choose. Mail from anyone else is not stored. New mail comes in about every minute.
- If mail from a party is not appearing: check the sender is a contact of a customer or supplier (or shares their company domain; free-mail domains such as gmail.com match by exact address only), check the party is not archived, and check the mailbox shows as connected. "Sign in again" on the mailbox card repairs an expired connection.
- Older mail is not imported. You can ask the Ask panel about older correspondence and it searches your own connected mailbox for mail with known contacts. Bulk import of past records is the historic-sync add-on.
- Google Drive and Sheets: a separate connection. VIA opens only the files you pick in Google's picker.
- Forwarding address: for chats with no business connection (Zalo, WeChat or WhatsApp on a phone), create your personal forwarding address on Connections and forward messages to it from your sign-in email or connected mailbox. Mail from any other sender is ignored.
- WhatsApp Business and Zalo Official Account: company channels, connected by an owner or manager. They are in pilot. Replies go out inside each platform's free reply window; outside it the send fails with a clear reason.
- Delogue PLM: read only, in pilot. Other systems (ERP, PLM, QC, forwarders) are listed under "Systems on request": ask and VIA Labs builds the connector.
- Disconnecting a mailbox deletes the stored token. Removing a person from the team switches off the mailboxes they connected.

## Alerts
- Silence: a factory, mill or customer milestone is due within 3 days (or up to 14 days overdue), nothing has come in from that party for 5 days and the milestone is untouched. One per order and party.
- Failed send: an approved reply could not be delivered.
- The person responsible is emailed once; owners and managers after 24 hours. Alerts clear themselves when the party writes, the milestone moves, the reply goes or the order closes.
- On My day: Chase has the agent queue a chaser for approval; Dismiss records the dismissal on the ledger.

## Customers and suppliers
- Archive and delete are for owners and managers. A party with no linked records is deleted at once. One with records is archived: hidden from lists and pickers, its contacts no longer let mail in, restorable, and deleted automatically 6 months later (its orders and messages stay, without the link).
- Bank accounts: every account starts pending, whether typed or read from a document. Only an owner or manager can confirm it, after checking outside the document (a call to a known number, for example). Details cannot be edited after saving: a changed account is a new account. This is deliberate, because a changed bank account is the classic invoice fraud. The agents cannot read or change bank details.

## Development track (styles before a PO)
- A company switch, turned on by VIA Labs. Owners and managers get the track; others are ticked per person in Settings, Team. People with both tracks see a Develop / Produce switch.
- The anchor is the style (code, customer, season). Files on a style: tech packs, briefs, costings, photos, 3D models (up to 30 MB each).
- A tech pack is read after upload and shown for review. A version counts only once a person confirms it. A new version shows what changed against the previous one.
- Samples: one row per round with dates, measurements against the spec and tolerance, and the decision. A sample approval, approval with comments or rejection is always a person's action. The agent can record sent, received and due dates, never a decision.
- Materials: the BOM lines from the confirmed tech pack, with sourcing status and supplier.
- Schedule: counted back from the style's target delivery.
- Handover: a person hands a style over to production from the style file, as a new PO or an existing PO. The PO then carries the tech pack version, the sample rounds from PP on and the approved materials. It is never automatic. A spec change after handover is an Amendment on the PO.
- Mail attachments from known senders on a development conversation are filed on the style. A person can file an unmatched attachment from the conversation page.

## ESG and compliance (paid add-on)
- Switched on by VIA Labs. An owner or manager can request it from inside the workspace.
- Programmes hold requirements (certificates, audits, codes of conduct, chemicals, market rules) with a schedule, a per-order trigger or an expiry. Tasks are created ahead of time; owners are emailed and supplier requests are queued for approval.
- Evidence is uploaded against a task with validity dates. Reports are approved by an owner or manager and are then fixed. Nothing sends a report automatically.
- Partners at a supplier or customer can supply their own evidence through "Shared with you".

## Your own agents (MCP)
- In Settings, "Your agents", a member can issue a personal token so an agent they run themselves (any MCP client) works in the workspace as them. Up to 5 live tokens per person, 90 days each, revocable at any time.
- Such an agent reads what the member can read. With queuing allowed (owners, managers and merchandisers) it can place drafts, reported dates and compliance values for approval. It never sends, approves or decides, and every call is logged.

## Team, working hours, profile
- Settings, Team: invite people, set role, job title, customers and tracks. Managers cannot make or change an owner; nobody changes their own role; the last owner stays.
- Working hours: the company's days, hours and time zone. Background agent work runs inside them. Your morning brief arrives at 07:00 in your own time zone on working days.
- Profile: name, photo, phone, language, day or night view.

## Privacy and VIA Labs access
- Each company's records are isolated. VIA Labs staff cannot open a company's orders, parties, conversations or ledger unless an owner or manager grants support access in Settings. A grant lasts 72 hours, can be revoked at any time, and is written to the ledger.
- Support desk conversations are different: they are addressed to VIA Labs, so VIA Labs staff read them. Do not paste passwords, sign-in codes or bank details into a support conversation.
- Full statements: merch.getvia.xyz/trust and merch.getvia.xyz/privacy.

## Updates
- In the workspace, the Updates bell in the side rail shows the latest headlines and how many are unread, and a new update appears as a one-line notice above the page. Both open the full text on the support desk. Owners and managers also receive each update by email.
- The support desk shows Updates: what VIA Labs has released. Some updates are for every company; some belong to an add-on, a track or a feature that is switched on per company and show as "Available on request" when the company does not have it. To ask for one, start a conversation at the support desk.

## Plans and add-ons
- The development track, ESG and compliance, and historic sync are switched on per company by VIA Labs. Pricing and contract questions go to VIA Labs staff.
`;
