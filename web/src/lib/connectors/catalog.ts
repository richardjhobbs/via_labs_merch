// The connector catalogue: every channel and system VIA Merch connects to, or can on request.
// Each entry is the manifest half of the connector SDK (name, category, auth, instructions);
// the runtime half (connect/watch/ingest/send/health) lands with the channels build.
// Logos live in /public/brands (simple-icons SVGs or the company's own favicon).

export type ConnectorStatus = 'stage1' | 'request' | 'via';
export type ConnectorCategory = 'email' | 'chat' | 'files' | 'wholesale' | 'plm' | 'design' | 'erp' | 'qc' | 'compliance' | 'logistics' | 'commerce' | 'agent';

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
  email: 'Email', chat: 'Chat', files: 'Sheets and files', wholesale: 'Wholesale platforms', plm: 'PLM', design: '3D design, patterns and cutting', erp: 'ERP', qc: 'Quality control', compliance: 'Compliance and traceability', logistics: 'Carriers and forwarders', commerce: 'Commerce', agent: 'Agent to agent',
};

export const CONNECTORS: Connector[] = [
  // ---- stage 1: channels that work for real today (gmail, m365, sheets, drive, upload); whatsapp stays
  // on request until its runtime is live
  { id: 'gmail', name: 'Gmail', vendor: 'Google Workspace', category: 'email', logo: '/brands/gmail.svg', status: 'stage1', auth: 'OAuth (the merchandiser signs in once)', use: 'Reads the inbox, links each thread to a party and order, drafts replies, sends as the merchandiser once approved.',
    steps: ['Click Connect Gmail and sign in with the Google account you use for customers and suppliers.', 'Allow Read and Send. VIA checks for new mail every minute, from the moment you connect; older mail is not read.', 'Choose what the agent reads: mail from known customers and suppliers (their contacts and company domains), or one Gmail label. Everything else is never stored.'], docs: 'https://developers.google.com/gmail/api' },
  { id: 'm365', name: 'Microsoft 365', vendor: 'Outlook', category: 'email', logo: '/brands/microsoft.svg', status: 'stage1', auth: 'OAuth (Microsoft Entra)', use: 'Same as Gmail for Outlook mailboxes: reads mail from known customers and suppliers, links it to the party and order, drafts replies, sends from the mailbox once approved. Shared mailboxes on request.',
    steps: ['Click Connect Outlook and sign in with the Microsoft account you use for customers and suppliers.', 'Allow Read and Send. If your company requires it, an IT admin approves VIA Merch once for everyone.', 'Choose what the agent reads: mail from known customers and suppliers, or one Outlook folder. New mail only, from the moment you connect; everything else is never stored.'], docs: 'https://learn.microsoft.com/graph/api/resources/mail-api-overview' },
  { id: 'whatsapp', name: 'WhatsApp Business', vendor: 'Meta Cloud API', category: 'chat', logo: '/brands/whatsapp.svg', status: 'request', auth: 'A WhatsApp Business number (yours, or one VIA hosts for you)', use: 'Inbound messages, photos and voice notes from factories and mills become records; approved replies go back on the same number.',
    steps: ['Tell VIA whether to use your own WhatsApp Business number or a VIA-hosted one.', 'For your own number: add VIA as a partner in Meta Business Manager and approve the number.', 'Save the contacts the agent may message; new numbers are held for a person.'], docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api' },
  { id: 'sheets', name: 'Google Sheets', vendor: 'Google Workspace', category: 'files', logo: '/brands/googlesheets.svg', status: 'stage1', auth: 'Your Google Drive connection (you pick each sheet)', use: 'Imports the order book a customer or factory keeps in a Google Sheet, in the same columns as a spreadsheet upload.',
    steps: ['Connect Google Drive below (once).', 'Go to Orders → Import spreadsheet → Choose a Google Sheet, and pick the sheet in Google\'s own file picker.', 'VIA reads only the sheets you pick; nothing else in your Drive is visible to it.'] },
  { id: 'drive', name: 'Google Drive', vendor: 'Google Workspace', category: 'files', logo: '/brands/googledrive.svg', status: 'stage1', auth: 'OAuth, files you pick only (drive.file)', use: 'Tech packs, PIs, invoices and order sheets you pick in Drive are read like an upload: an order sheet imports POs, a PI or invoice fills the customer, supplier and order for you to check.',
    steps: ['Click Connect Google Drive and sign in with the Google account that holds the files.', 'Allow access to the files you choose. VIA never sees the rest of your Drive.', 'Use Choose from Google Drive on Orders → Import spreadsheet, or on Customers & suppliers → Add from a document.'] },
  { id: 'upload', name: 'File upload', vendor: 'xlsx, csv, pdf, images', category: 'files', logo: null, status: 'stage1', auth: 'None', use: 'Drop an order list, a PI, a tech pack or a photo of a WIP board; VIA parses it into the record.',
    steps: ['Go to Orders → Import spreadsheet, or attach a file to any order.'] },
  { id: 'forward', name: 'Forward from chat apps', vendor: 'Zalo, WeChat, WhatsApp, Line, SMS', category: 'chat', logo: null, status: 'stage1', auth: 'Your own forwarding address', use: 'Forward a message from a chat on your phone to your VIA address and it is logged against the right supplier and PO like an email. The text is what the agent reads; photos and voice notes are noted by name. Replies are drafted for approval and you send them from your chat app.',
    steps: ['Create your forwarding address below and save it as a contact on your phone.', 'In Zalo, WeChat or WhatsApp, long-press a message, choose Share or Forward, then Email, and send it to that address. Add a line such as "Huaxin, PO 48812" if the message does not say who it is from.', 'Only mail from your own sign-in email or your connected mailbox is accepted.'] },
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
  { id: 'topo', name: 'Topo', vendor: 'Sourcing and supply chain', category: 'plm', logo: '/brands/topo.png', status: 'request', auth: 'Vendor contact', use: 'Sourcing, sampling, orders, production, quality and compliance records in; WIP and milestone status back.', steps: ['Vendor-gated; VIA requests access with you.'], docs: 'https://topo.cc/' },
  { id: 'delogue', name: 'Delogue PLM', category: 'plm', logo: '/brands/delogue.png', status: 'request', auth: 'API key', use: 'Styles and supplier conversations.', steps: ['Generate an API key in Delogue settings; paste it here.'] },

  // ---- 3D design, patterns and cutting (vendor-gated: access is arranged with the first client, then one-step)
  { id: 'browzwear', name: 'Browzwear', vendor: 'VStitcher', category: 'design', logo: '/brands/browzwear.png', status: 'request', auth: 'Developer access granted by Browzwear; a VIA plug-in in VStitcher', use: '3D samples, colourways and approvals sent to the order as they happen.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://browzwear.com/api' },
  { id: 'clo3d', name: 'CLO 3D', vendor: 'CLO and CLO-SET', category: 'design', logo: '/brands/clo3d.png', status: 'request', auth: 'CLO SDK; a VIA plug-in in CLO', use: '3D samples, fabrics and colourways sent to the order; CLO-SET styles linked to POs.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://developer.clo3d.com/' },
  { id: 'optitex', name: 'Optitex', vendor: 'PDS and Marker', category: 'design', logo: null, status: 'request', auth: 'Optitex API user, granted by the vendor', use: 'Patterns, measurement charts and marker efficiency on the order.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://optitex.com/' },
  { id: 'lectra', name: 'Lectra', vendor: 'Kubix Link, Modaris, Valia', category: 'design', logo: '/brands/lectra.png', status: 'request', auth: 'Partner access arranged with Lectra', use: 'Styles from Kubix Link, patterns from Modaris, cutting status from Valia, on the order record.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://www.lectra.com/' },
  { id: 'accumark', name: 'Gerber AccuMark', vendor: 'Lectra', category: 'design', logo: '/brands/lectra.png', status: 'request', auth: 'Partner access arranged with Lectra, or exported files', use: 'Markers, models and cut orders linked to the PO.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://www.lectra.com/' },
  { id: 'tukatech', name: 'Tukatech', vendor: 'TUKAcad, TUKA3D, TUKAcloud', category: 'design', logo: '/brands/tukatech.png', status: 'request', auth: 'Vendor contact; exported files until then', use: '3D samples, tech packs and measurement charts linked to the order.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://tukatech.com/' },
  { id: 'style3d', name: 'Style3D', vendor: '3D design and fabric digitisation', category: 'design', logo: '/brands/style3d.png', status: 'request', auth: 'Enterprise API access arranged with Style3D', use: '3D samples and digital fabrics linked to the order.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://www.style3d.com/' },
  { id: 'audaces', name: 'Audaces', vendor: 'Pattern making and marker', category: 'design', logo: '/brands/audaces.png', status: 'request', auth: 'Vendor contact', use: 'Patterns, grading and markers linked to the order.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://audaces.com/' },
  { id: 'jeanologia', name: 'Jeanologia', vendor: 'eDesigner, eMark, Jeanologia Cloud', category: 'design', logo: '/brands/jeanologia.png', status: 'request', auth: 'Vendor contact; .jean files until then', use: 'Denim wash and laser finishing recipes linked to the order and its approvals.', steps: ['Set up with the vendor once you are a client: VIA requests access with you and builds the connector.', 'After the first build it becomes a one-step connection for every later customer.'], docs: 'https://www.jeanologia.com/' },

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
