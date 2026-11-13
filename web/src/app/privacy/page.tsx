// Privacy policy for VIA Merch. Required by Google's OAuth verification (including the Limited Use
// statement, which must stay word for word) and by Microsoft's publisher terms. Every statement here
// must match the code: connectors in src/lib/connectors, sessions in src/middleware.ts, support access
// in migration 0006, models in src/lib/llm.ts. Change the code and this page together.
import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Privacy policy · VIA Merch' };
const UPDATED = '13 November 2026';

const S: LegalSection[] = [
  { h: 'Who we are', p: [
    'VIA Merch (merch.getvia.xyz) is operated by VIA Labs Pte. Ltd., a company registered in Singapore ("VIA Labs", "we", "us"). VIA Merch gives merchandising teams at buying offices, brands, factories and trading companies an AI agent that reads their order communication, keeps their order records and drafts replies that a person approves.',
    'For the data a company puts into VIA Merch, that company is the controller and VIA Labs processes it on the company\'s behalf under our agreement with it. For the data we need to run accounts and bill for the service, VIA Labs is the controller. Questions and requests: contact@getvia.xyz.',
  ] },
  { h: 'What we collect', p: [[
    'Account data: name, work email, company, role and language of each person a company invites, and, if the person adds them in Settings, a phone number their team can call and a profile picture. A company owner can add a company logo. Pictures are kept in private storage and shown only to people in that company. Sign-in is by a one-time code or link sent to that email; we do not store passwords.',
    'Company records: customers, suppliers, contacts, purchase orders, milestones, compliance records and documents that people enter, upload or import.',
    'Connected channels: messages and files from the mailboxes and services a person chooses to connect, as described in the next sections.',
    'Agent activity: the questions people ask the agent, the drafts it prepares, the approvals and rejections people make, and an append-only ledger of these actions.',
    'Support conversations: what you write to the support desk, any screenshot you attach, your name, email address and role, and the replies of the support agent and of VIA Labs staff.',
    'Technical data: a browser-session cookie that keeps you signed in, the last time each session was active (sessions end after 2 hours idle), cookies with your language choice and your day or night view, and standard server logs from our hosting provider.',
  ]] },
  { h: 'Google user data', p: [
    'A person can connect their own Gmail mailbox, and Google Drive files, by signing in with Google. VIA Merch asks only for these permissions:',
    [
      'Read Gmail (gmail.readonly): to read new emails from the person\'s known customers and suppliers (their contact addresses and company domains), or under one Gmail label the person chooses, starting from the moment they connect; and, when that person asks the agent about older correspondence, to search their mailbox for emails with those same customers and suppliers.',
      'Send Gmail (gmail.send): to send a reply from the person\'s mailbox, in the same email thread, only after a person in their company has approved that reply, or the company has set the agent to send that kind of routine reply itself.',
      'Google Drive files (drive.file), as a separate connection: to open only the files the person picks in Google\'s file picker, such as an order sheet to import or a proforma invoice to read. A picked file is read like an upload; the original file is not stored.',
    ],
    'What we store: emails from known customers and suppliers (sender, recipients, subject, text and attachment names) become part of the company\'s order record so the team and the agent can work from them. Emails from anyone else are not fetched in full and are not stored. Results of a search of older mail are shown to the person who asked and are not stored. Each search is recorded in the company\'s ledger.',
    'How we protect it: Google access tokens are encrypted before they are stored and are readable only by our server. Only members of the person\'s company can see the records made from their mail. VIA Labs staff cannot open a company\'s records unless an owner or manager of that company grants time-limited support access, and every such opening is recorded.',
    'VIA Merch\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
    'In particular: we use Google user data only to provide the features described above to the person who connected it and their company; we do not sell it; we do not use it for advertising; we do not use it to develop, improve or train generalised AI or machine-learning models; and no person reads it except with that user\'s permission, for security purposes, to comply with the law, or where the data has been aggregated and anonymised for internal operations.',
    'Disconnecting: a person can disconnect Gmail or Google Drive at any time on the Connections page. We then delete the stored token, and for Gmail we also revoke our access at Google. You can also remove VIA Merch from your Google account at myaccount.google.com/permissions, which ends all of its access.',
  ] },
  { h: 'Microsoft 365 data', p: [
    'A person can connect their own Outlook mailbox by signing in with Microsoft. VIA Merch asks to read mail, send mail and keep access while the connection stays on (offline access). Mail is handled exactly as described for Gmail above: only new mail from known customers and suppliers or one chosen folder, searches of older mail only when the person asks and without storing the results, and replies only after approval. Disconnecting deletes the stored token; you can also remove the app from your Microsoft account settings.',
  ] },
  { h: 'Company WhatsApp and Zalo accounts', p: [
    'A company can connect its own WhatsApp Business number (through Meta\'s WhatsApp Business Platform) or its own Zalo Official Account. These are the company\'s business channels, so every message sent to the connected number or Official Account becomes part of the company\'s order record, linked to a customer or supplier where the sender can be matched. Replies go out from the same number or Official Account only after approval. The access tokens are encrypted and readable only by our server. Personal WhatsApp, WeChat and Zalo accounts are never connected.',
  ] },
  { h: 'Forwarded messages', p: [
    'Each member can create a personal forwarding address and forward messages to it from chat apps on their phone, such as Zalo, WeChat or WhatsApp. VIA Merch accepts mail at that address only from the member\'s own sign-in email or connected mailbox; anything else sent to it is ignored and not stored. A forwarded message becomes part of the company\'s order record, like an email from a connected mailbox. Replies to forwarded messages are sent by the member from their own app; VIA Merch does not connect to personal chat accounts.',
  ] },
  { h: 'How the AI agent uses data', p: [
    'To read a message, answer a question or prepare a draft, the agent sends the relevant part of the company\'s record to an AI model provider and receives the result. The standard provider is Anthropic (Claude). Companies based in regions where Claude is not offered may run on another provider, which is named in their agreement. We use these providers only on terms under which they do not train their models on the data we send, and we never use company data or connected-account data to train models ourselves.',
    'Nothing the agent drafts is sent without a person\'s approval, except routine message types that the company itself has set the agent to send. Prices, claims and order confirmations always need a person.',

    'The support desk has its own agent. It answers from our product guide and sees only your role, your tracks, your company\'s add-ons and the state of your connections; it cannot read the company\'s orders, parties, conversations, ledger or payment details. Support conversations are addressed to VIA Labs, so VIA Labs staff read them. To prepare the answer, the text of a support conversation is sent to DeepSeek, a model provider based in China; screenshots are not sent to it. Do not put passwords, sign-in codes or bank details in a support conversation.',

    'A member can also let an agent they run themselves, in any tool that supports the Model Context Protocol (MCP), work in the workspace through a personal token issued in Settings. That agent reads what the member can read and can place drafts and reported dates in the approval queue; it cannot send messages, approve drafts, take sample decisions or read payment details. The token is stored as a hash, expires after 90 days, can be revoked by the member or a manager, and every call is recorded in the company\'s run log.',
  ] },
  { h: 'Who we share data with', p: [
    'We do not sell personal data. We share it only with the service providers that run VIA Merch for us, under contracts that limit their use of it to providing their service:',
    [
      'Supabase (database, sign-in and file storage, hosted in Singapore).',
      'Vercel (application hosting; our application runs in its Singapore region).',
      'Anthropic, and any other model provider named in a company\'s agreement (AI processing as described above).',
      'DeepSeek (AI processing of support desk conversations, and of translations of messages and updates).',
      'Resend (delivery of sign-in codes, invitations and notifications by email, and receiving the messages a member forwards to their own VIA forwarding address).',
      'Google and Microsoft, when a person connects their account, to read and send the mail described above.',
      'Meta (WhatsApp Business Platform) and VNG (Zalo), when a company connects its own WhatsApp Business number or Zalo Official Account.',
    ],
    'We may also disclose data where the law requires it, or to protect the rights and safety of our users or of VIA Labs. Dictation in the Ask box uses your browser\'s own speech recognition; in Chrome and Edge the audio goes to the browser maker to be transcribed, not to VIA Labs.',
  ] },
  { h: 'Where data is kept, and for how long', p: [
    'Company data is stored in Singapore. Some providers above may process data in other countries; where they do, they do so under their contractual and legal safeguards.',
    'We keep a company\'s data for as long as its agreement with us is active, or as set out in that agreement. When a company leaves, or asks us to, we delete its data, except the minimum we must keep for legal, tax or accounting reasons. A customer or supplier that a company archives is deleted automatically 6 months later (its orders and messages stay, without the link), and one with no activity can be deleted at once. The ledger is append-only while an account is active, so that a company can rely on its record of decisions.',
  ] },
  { h: 'Your choices and rights', p: [
    'You can ask to see, correct, export or delete personal data about you, or object to how it is used, by writing to contact@getvia.xyz. Where your data is in a company\'s workspace, we will work with that company, which decides on its records. You can disconnect any mailbox or service at any time. If you are in a country with a data-protection authority, including Singapore\'s Personal Data Protection Commission, you may also complain to it.',
  ] },
  { h: 'Security', p: [
    'Every company\'s data is kept apart by database rules, not only by the application. Sign-in uses one-time codes, sessions end when the browser closes or after 2 hours idle, connection tokens are encrypted, bank details read from documents stay pending until an owner or manager confirms them, and every agent action and approval is written to an append-only ledger. More detail is on our Trust page (merch.getvia.xyz/trust).',
  ] },
  { h: 'Children', p: ['VIA Merch is a business service for adults at work. It is not meant for children and we do not knowingly collect their data.'] },
  { h: 'Changes', p: ['If we change this policy, we will update the date at the top and, for material changes, tell the companies using VIA Merch before the change takes effect.'] },
];

export default function Privacy() { return <LegalPage kind="privacy" updated={UPDATED} sections={S} />; }
