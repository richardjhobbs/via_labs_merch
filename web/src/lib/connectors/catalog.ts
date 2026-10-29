// The connector catalogue: every channel and system VIA Merch connects to, or can on request.
// Each entry is the manifest half of the connector SDK (name, category, auth, instructions);
// the runtime half (connect/watch/ingest/send/health) lands with the channels build.
// Logos live in /public/brands (simple-icons SVGs or the company's own favicon).

export type ConnectorStatus = 'stage1' | 'request' | 'via';
export type ConnectorCategory = 'email' | 'chat' | 'files' | 'wholesale' | 'plm' | 'erp' | 'qc' | 'compliance' | 'logistics' | 'commerce' | 'agent';

export type Connector = {
  id: string;
  name: string;
  vendor?: string;
  category: ConnectorCategory;
  logo: string | null;                 // path under /brands, or null for an initial tile
  status: ConnectorStatus;
  auth: string;                        // what the customer provides
  use: string;                         // what VIA does with it
  steps: string[];                     // setup instructions shown in the wizard
  docs?: string;
};

export const CATEGORIES: Record<ConnectorCategory, string> = {
  email: 'Email', chat: 'Chat', files: 'Sheets and files', wholesale: 'Wholesale platforms', plm: 'PLM', erp: 'ERP', qc: 'Quality control', compliance: 'Compliance and traceability', logistics: 'Carriers and forwarders', commerce: 'Commerce', agent: 'Agent to agent',
};

export const CONNECTORS: Connector[] = [
  // ---- stage 1: channels that work for real
  { id: 'gmail', name: 'Gmail', vendor: 'Google Workspace', category: 'email', logo: '/brands/gmail.svg', status: 'stage1', auth: 'OAuth (the merchandiser signs in once)', use: 'Reads the inbox, links each thread to a party and order, drafts replies, sends as the merchandiser once approved.',
    steps: ['Click Connect and sign in with the Google account the merchandiser uses for customers and suppliers.', 'Allow Read and Send. VIA watches the inbox through Google push; nothing is polled.', 'Choose which labels or senders the agent handles. Everything else is left alone.'], docs: 'https://developers.google.com/gmail/api' },
  { id: 'm365', name: 'Microsoft 365', vendor: 'Outlook, shared mailboxes', category: 'email', logo: '/brands/microsoft.svg', status: 'stage1', auth: 'OAuth (Microsoft Entra)', use: 'Same as Gmail for Outlook mailboxes, including a shared merchandising@ mailbox.',
    steps: ['Click Connect and sign in with the Microsoft work account.', 'An IT admin may need to grant consent once for the company.', 'Pick the mailbox or shared mailbox the agent works in.'], docs: 'https://learn.microsoft.com/graph/api/resources/mail-api-overview' },
  { id: 'whatsapp', name: 'WhatsApp Business', vendor: 'Meta Cloud API', category: 'chat', logo: '/brands/whatsapp.svg', status: 'stage1', auth: 'A WhatsApp Business number (yours, or one VIA hosts for you)', use: 'Inbound messages, photos and voice notes from factories and mills become records; approved replies go back on the same number.',
    steps: ['Tell VIA whether to use your own WhatsApp Business number or a VIA-hosted one.', 'For your own number: add VIA as a partner in Meta Business Manager and approve the number.', 'Save the contacts the agent may message; new numbers are held for a person.'], docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api' },
  { id: 'sheets', name: 'Google Sheets', vendor: 'Google Workspace', category: 'files', logo: '/brands/googlesheets.svg', status: 'stage1', auth: 'OAuth, per sheet', use: 'Reads the order book or WIP sheet a customer keeps and writes the agreed columns back, so the customer never changes their format.',
    steps: ['Connect the Google account that owns or can edit the sheet.', 'Paste the sheet link and map the columns once; VIA remembers the mapping.', 'Choose the direction: read only, or write status back on a schedule.'] },
  { id: 'drive', name: 'Google Drive', vendor: 'Google Workspace', category: 'files', logo: '/brands/googledrive.svg', status: 'stage1', auth: 'OAuth', use: 'Tech packs, PIs and inspection reports dropped in a folder are parsed and attached to the right order.',
    steps: ['Connect the Google account.', 'Pick the folder VIA watches.'] },
  { id: 'upload', name: 'File upload', vendor: 'xlsx, csv, pdf, images', category: 'files', logo: null, status: 'stage1', auth: 'None', use: 'Drop an order list, a PI, a tech pack or a photo of a WIP board; VIA parses it into the record.',
    steps: ['Go to Orders → Import spreadsheet, or attach a file to any order.'] },
  { id: 'via-agent', name: 'VIA agent channel', vendor: 'MCP and A2A', category: 'agent', logo: null, status: 'via', auth: 'A partner token issued by the other company', use: 'When a customer or supplier also runs VIA Merch, the agents exchange WIP, status, trace and booking records directly, each side gated and logged.',
    steps: ['Ask the partner for a VIA partner token (Settings → Partners on their side).', 'Paste it here; both agents can now see the shared orders.', 'Set the gate for agent requests: answer automatically, or hold for a person.'] },

  // ---- chat, on request
  { id: 'wecom', name: 'WeCom', vendor: 'WeChat Work', category: 'chat', logo: '/brands/wecom.png', status: 'request', auth: 'Enterprise WeChat account with external contacts', use: 'Mills and factories in China on the channel they already use.', steps: ['Needs a Tencent enterprise account; VIA sets up the app and callback.'] },
  { id: 'wechat', name: 'WeChat', vendor: 'Tencent', category: 'chat', logo: '/brands/wechat.svg', status: 'request', auth: 'Official account', use: 'Consumer WeChat contacts via an official account.', steps: ['Only through an official account; most supplier contacts use WeCom instead.'] },
  { id: 'zalo', name: 'Zalo OA', vendor: 'VNG', category: 'chat', logo: '/brands/zalo.svg', status: 'request', auth: 'Zalo Official Account', use: 'Vietnamese factories and mills.', steps: ['Create a Zalo Official Account; VIA connects the webhook.'] },
  { id: 'telegram', name: 'Telegram', category: 'chat', logo: '/brands/telegram.svg', status: 'request', auth: 'Bot token', use: 'A VIA bot in your supplier groups.', steps: ['VIA creates the bot; you add it to the groups.'] },
  { id: 'slack', name: 'Slack', category: 'chat', logo: '/brands/slack.png', status: 'request', auth: 'Slack app install', use: 'Internal approvals and the daily briefing in a channel.', steps: ['Install the VIA app in your workspace.'] },

  // ---- wholesale
  { id: 'joor', name: 'JOOR', category: 'wholesale', logo: '/brands/joor.png', status: 'request', auth: 'Brand API v4 token (issued by JOOR integrations team)', use: 'Reads wholesale orders and writes confirmations and ship dates back.', steps: ['Ask your JOOR account manager for API access; VIA completes the integration form.'] },
  { id: 'nuorder', name: 'NuORDER', vendor: 'Lightspeed', category: 'wholesale', logo: '/brands/nuorder.png', status: 'request', auth: 'Partner API credentials', use: 'Reads wholesale orders.', steps: ['Request API access through NuORDER support.'] },
  { id: 'shopify', name: 'Shopify', category: 'commerce', logo: '/brands/shopify.svg', status: 'request', auth: 'Custom app token', use: 'Sell-through and stock by style, so the production record meets the sales record.', steps: ['Create a custom app in Shopify admin with read orders and products; paste the token.'] },

  // ---- PLM
  { id: 'centric', name: 'Centric PLM', category: 'plm', logo: null, status: 'request', auth: 'REST API user (customer-granted)', use: 'Tech packs and styles in; WIP and sample status back.', steps: ['Your Centric admin creates an API user; VIA maps the style and BOM objects.'] },
  { id: 'bamboorose', name: 'Bamboo Rose', category: 'plm', logo: '/brands/bamboorose.png', status: 'request', auth: 'Vendor contact', use: 'Styles, POs and supplier records.', steps: ['Vendor-gated; VIA requests access with you.'] },
  { id: 'backbone', name: 'Backbone PLM', category: 'plm', logo: '/brands/backbone.png', status: 'request', auth: 'Vendor contact', use: 'Tech packs and styles.', steps: ['Vendor-gated; VIA requests access with you.'] },
  { id: 'wfx', name: 'WFX', vendor: 'World Fashion Exchange', category: 'plm', logo: '/brands/wfx.png', status: 'request', auth: 'Vendor contact', use: 'PLM and ERP for apparel.', steps: ['Vendor-gated; VIA requests access with you.'] },
  { id: 'delogue', name: 'Delogue PLM', category: 'plm', logo: '/brands/delogue.png', status: 'request', auth: 'API key', use: 'Styles and supplier conversations.', steps: ['Generate an API key in Delogue settings; paste it here.'] },

  // ---- ERP
  { id: 'odoo', name: 'Odoo', category: 'erp', logo: '/brands/odoo.svg', status: 'request', auth: 'JSON-RPC user and API key', use: 'Purchase orders, manufacturing orders, stock.', steps: ['Create an API key for a VIA user in Odoo; give it the purchase and inventory apps.'] },
  { id: 'sap-b1', name: 'SAP Business One', category: 'erp', logo: '/brands/sap.svg', status: 'request', auth: 'Service Layer user', use: 'Purchase orders and stock.', steps: ['Your SAP partner creates a Service Layer user; VIA connects over HTTPS.'] },
  { id: 'infor', name: 'Infor M3', category: 'erp', logo: '/brands/infor.png', status: 'request', auth: 'ION API', use: 'POs and item master.', steps: ['Vendor-gated; VIA requests access with you.'] },
  { id: 'apparelmagic', name: 'ApparelMagic', category: 'erp', logo: '/brands/apparelmagic.png', status: 'request', auth: 'API key', use: 'Orders, styles, stock.', steps: ['Generate an API key in ApparelMagic; paste it here.'] },
  { id: 'aims360', name: 'AIMS360', category: 'erp', logo: '/brands/aims360.png', status: 'request', auth: 'API credentials', use: 'Orders and styles.', steps: ['Request API credentials from AIMS360 support.'] },

  // ---- QC
  { id: 'inspectorio', name: 'Inspectorio', category: 'qc', logo: '/brands/inspectorio.png', status: 'request', auth: 'API key from your Inspectorio account', use: 'Books inspections and pulls results into the order record.', steps: ['Create an API key in Inspectorio settings; production access is enabled by their implementation manager.'] },
  { id: 'qima', name: 'QIMA', category: 'qc', logo: '/brands/qima.png', status: 'request', auth: 'Developer portal credentials', use: 'Books inspections and lab tests; pulls reports.', steps: ['Register on the QIMA developer portal; paste the credentials.'] },

  // ---- compliance
  { id: 'sedex', name: 'Sedex', category: 'compliance', logo: '/brands/sedex.png', status: 'request', auth: 'Sedex API (member access)', use: 'SMETA audit validity per site.', steps: ['Ask Sedex for API access on your membership; VIA maps sites to suppliers.'] },
  { id: 'amfori', name: 'amfori BSCI', category: 'compliance', logo: '/brands/amfori.png', status: 'request', auth: 'Manual upload for now', use: 'Audit validity per site.', steps: ['No public API; upload audit PDFs and VIA reads the dates.'] },
  { id: 'osh', name: 'Open Supply Hub', category: 'compliance', logo: '/brands/opensupplyhub.png', status: 'request', auth: 'Public API', use: 'Facility IDs for every supplier site.', steps: ['Nothing to provide; VIA matches your suppliers to OS IDs.'] },

  // ---- logistics
  { id: 'maersk', name: 'Maersk', category: 'logistics', logo: '/brands/maersk.png', status: 'request', auth: 'Maersk developer key', use: 'Booking status and container tracking on the order.', steps: ['Create a key on developer.maersk.com; paste it here.'] },
  { id: 'kn', name: 'Kuehne+Nagel', category: 'logistics', logo: '/brands/kuehne-nagel.png', status: 'request', auth: 'myKN account', use: 'Shipment tracking.', steps: ['Contract-gated; VIA connects through your myKN account.'] },
  { id: 'dsv', name: 'DSV', category: 'logistics', logo: '/brands/dsv.png', status: 'request', auth: 'Account contact', use: 'Shipment tracking.', steps: ['Through your DSV account; VIA requests access with you.'] },
  { id: 'flexport', name: 'Flexport', category: 'logistics', logo: '/brands/flexport.png', status: 'request', auth: 'Account contact', use: 'Bookings and tracking.', steps: ['Through your Flexport account.'] },
];

export const STATUS_LABEL: Record<ConnectorStatus, string> = { stage1: 'Available', request: 'On request', via: 'VIA network' };
