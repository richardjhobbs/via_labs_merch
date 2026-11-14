// The three practice companies of the tester programme (docs/testers.md): a buying office (the Meridian
// world), a brand that buys direct from factories, and a garment manufacturer with several customers.
// Each is the same shape of data, so one loader fills any of them. Every name is made up; every email
// address is on a reserved .example domain and is never written to.
import { SAMPLE_BRANDS, SAMPLE_SUPPLIERS, SAMPLE_LINES, SAMPLE_STORY, POD } from './meridian';
import { SAMPLE_THREADS, SAMPLE_EXTRA_PARTIES, SAMPLE_CONTACTS, type SampleThread } from './threads';
import type { World } from '@/lib/testers';

export type Line = [string, string, string, string, string, string, string, string, string, number, number, number];
type Customer = { code: string; name: string; country: string; segment: string; lang: string; channel: string | null; policy: object; kind?: string };
type Supplier = { code: string; name: string; short: string; country: string; city: string; tier: number; type: string; lang: string; channel: string | null; contact: string | null; score: object; unverified?: boolean };
type Extra = { code: string; name: string; short: string; kind: string; country: string; lang: string; channel: string; contact: string; role: string };
export type Inbound = { party: string; channelKind: string; from: string; senderName: string; subject: string | null; text: string };
export type SampleWorld = {
  world: World; tenant: { name: string; slug: string; kind: 'brand' | 'buying_office' | 'factory'; tz: string };
  members: { name: string; email: string; role: 'manager' | 'merchandiser' | 'qc' | 'compliance' | 'logistics'; title: string }[];
  fromAddr: string;
  customers: Customer[]; suppliers: Supplier[]; lines: Line[];
  story: Record<string, Partial<Record<string, { expected?: number; late?: true }>>>;
  pod: Record<string, string>;
  extras: Extra[]; contacts: Record<string, { name: string; role: string; email: string }[]>; threads: SampleThread[];
  inbound: Inbound[];
};

const sup = (codes: string[]) => (SAMPLE_SUPPLIERS as readonly Supplier[]).filter((s) => codes.includes(s.code));

// ------------------------------------------------------------ buying office: Meridian Sourcing
const BUYING_OFFICE: SampleWorld = {
  world: 'buying_office', tenant: { name: 'Meridian Sourcing', slug: 'practice-buying-office', kind: 'buying_office', tz: 'Asia/Hong_Kong' },
  members: [
    { name: 'Priya Nair', email: 'priya.nair@meridian-practice.example', role: 'merchandiser', title: 'Senior merchandiser' },
    { name: 'Tom Becker', email: 'tom.becker@meridian-practice.example', role: 'merchandiser', title: 'Merchandiser' },
    { name: 'Farida Rahman', email: 'farida.rahman@meridian-practice.example', role: 'compliance', title: 'Compliance manager' },
  ],
  fromAddr: 'merch@meridian.example',
  customers: SAMPLE_BRANDS as unknown as Customer[], suppliers: SAMPLE_SUPPLIERS as unknown as Supplier[], lines: SAMPLE_LINES, story: SAMPLE_STORY, pod: POD,
  extras: SAMPLE_EXTRA_PARTIES, contacts: SAMPLE_CONTACTS, threads: SAMPLE_THREADS,
  inbound: [
    { party: 'HX', channelKind: 'wecom', from: 'chen@huaxin.example', senderName: 'Ms Chen', subject: null, text: '48812 面料延期，永利说下周二交货。我们周四开始裁剪，PP样品下周一寄出。请确认唛头和尺码比例。' },
    { party: 'NL', channelKind: 'email', from: 'hannah@northline.example', senderName: 'Hannah Price', subject: 'SS27 WIP + 48830 fit comments', text: 'Hi, could you send the WIP for all our SS27 POs by Monday, in our sheet format as usual? Fit comments for 48830 are attached - we need the revised fit sample back within the week or the in-store date is at risk. Thanks, Hannah' },
    { party: 'DA', channelKind: 'whatsapp', from: '+8801700000000', senderName: 'Mr Hasan', subject: null, text: 'Dear sir, for 48825 please confirm carton marking and shipping mark by tomorrow, cartons arriving Thursday. Also fabric for 48825 received today, inline inspection can be booked. Regards Hasan' },
  ],
};

// ------------------------------------------------------------ brand: Northline, buying direct
// The production team's "customers" are the brand's own sales channels; design, buying, logistics and
// compliance sit behind them as contacts. The conversations about Northline POs in the Meridian world are
// the same conversations seen from the brand's own desk.
const NL_POS = (SAMPLE_LINES as Line[]).filter((l) => l[0] === 'NL');
const CH: Record<string, string> = { '48812': 'NR', '48813': 'NO', '48820': 'NE', '48821': 'NR', '48825': 'NE', '48826': 'NR', '48830': 'NR', '48840': 'NO', '48845': 'NE' };
const BRAND: SampleWorld = {
  world: 'brand', tenant: { name: 'Northline', slug: 'practice-brand', kind: 'brand', tz: 'Europe/London' },
  members: [
    { name: 'Priya Nair', email: 'priya.nair@northline-practice.example', role: 'merchandiser', title: 'Production merchandiser' },
    { name: 'Jonas Weber', email: 'jonas.weber@northline-practice.example', role: 'qc', title: 'Quality and fit technician' },
    { name: 'Amara Osei', email: 'amara.osei@northline-practice.example', role: 'compliance', title: 'Sustainability and compliance lead' },
  ],
  fromAddr: 'production@northline.example',
  customers: [
    { code: 'NR', name: 'Northline Retail UK', country: 'GB', segment: 'Own stores', lang: 'en', channel: 'email_gmail', kind: 'retailer', policy: { audits: ['amfori BSCI', 'SMETA'], minGrade: 'C', certs: ['OEKO-TEX'], restricted: ['XUAR cotton'], dpp: true } },
    { code: 'NE', name: 'Northline Europe Wholesale', country: 'DE', segment: 'Wholesale accounts', lang: 'en', channel: 'email_gmail', kind: 'retailer', policy: { audits: ['amfori BSCI'], minGrade: 'C', certs: ['OEKO-TEX'], restricted: ['XUAR cotton'], dpp: true } },
    { code: 'NO', name: 'Northline Online', country: 'GB', segment: 'E-commerce', lang: 'en', channel: 'email_gmail', kind: 'store', policy: { audits: ['amfori BSCI'], minGrade: 'C', certs: [], restricted: ['XUAR cotton'] } },
  ],
  suppliers: sup(['HX', 'HP', 'DA', 'KD', 'IZ', 'BR', 'SY', 'NM', 'AM', 'KF', 'GJ', 'TX', 'XS', 'RP']),
  lines: [
    ...NL_POS.map((l) => [CH[l[4]] || 'NR', ...l.slice(1)] as Line),
    ['NE', 'HP', 'NM', 'RP', '48850', 'SS27-SHL-005', 'Insulated belay jacket', 'Outerwear', '100% recycled polyester, 80g insulation', 2800, 41.20, 59],
    ['NO', 'DA', 'AM', 'GJ', '48852', 'SS27-ACC-010', 'Fleece beanie and neck gaiter set', 'Accessories', '100% recycled polyester fleece', 6000, 3.90, 26],
    ['NR', 'BR', 'AM', 'GJ', '48855', 'SS27-TEE-022', 'Kids trail tee', 'Kids', '100% organic cotton jersey', 4200, 5.60, 33],
    ['NE', 'IZ', 'AM', 'GJ', '48858', 'SS27-BSL-001', 'Merino base layer crew', 'Tops', '100% merino 180gsm', 3000, 18.90, 41],
    ['NR', 'HX', 'SY', 'TX', '48860', 'SS27-SHT-006', 'Trail shorts', 'Bottoms', '92% recycled nylon 8% elastane', 7400, 9.80, 48],
    ['NO', 'KD', 'KF', 'TX', '48862', 'SS27-DNM-04', 'Workwear canvas pant', 'Bottoms', '100% cotton 10oz canvas', 2600, 16.10, 62],
    ['NE', 'HP', 'NM', 'RP', '48865', 'SS27-SHL-006', 'Softshell vest', 'Outerwear', '94% recycled polyester 6% elastane', 3600, 19.40, 36],
    ['NR', 'DA', 'AM', 'GJ', '48868', 'SS27-SWT-003', 'Organic logo hoodie', 'Tops', '100% organic cotton loopback 320gsm', 8200, 12.60, 29],
    ['NO', 'HX', 'SY', 'TX', '48870', 'SS27-TEE-025', 'Graphic tee, artist series', 'Tops', '100% cotton jersey 180gsm', 5000, 4.70, -5],
  ],
  story: { '48812': { fabric: { expected: 1 } }, '48830': { fit: { late: true } }, '48865': { pp: { late: true } } },
  pod: { NR: 'Felixstowe', NE: 'Rotterdam', NO: 'Felixstowe' },
  extras: SAMPLE_EXTRA_PARTIES,
  contacts: { NR: SAMPLE_CONTACTS.NL },
  threads: SAMPLE_THREADS.filter((t) => NL_POS.some((l) => l[4] === t.po)).map((t) => (t.party === 'NL' ? { ...t, party: 'NR' } : t)),
  inbound: [
    { party: 'HX', channelKind: 'wecom', from: 'chen@huaxin.example', senderName: 'Ms Chen', subject: null, text: '48812 面料延期，永利说下周二交货。我们周四开始裁剪，PP样品下周一寄出。请确认唛头和尺码比例。' },
    { party: 'NR', channelKind: 'email', from: 'tom.reid@northline.example', senderName: 'Tom Reid', subject: 'SS27 drop 1: where are we?', text: 'Priya, retail ops are asking me daily. Can I have the WIP for every drop 1 PO by Monday, and a straight answer on 48830: is the fit sample back with Hannah this week or not? If the store date is at risk I need to tell the regions now. Tom' },
    { party: 'HP', channelKind: 'zalo', from: '+84900000001', senderName: 'Mr Tuan', subject: null, text: 'Chào chị, PO 48865 mẫu PP bị chậm vì vải softshell từ Nam Định về trễ 4 ngày. Chúng tôi sẽ gửi mẫu PP vào thứ Sáu tuần này. Xin chị xác nhận nhãn giặt mới.' },
  ],
};

// ------------------------------------------------------------ manufacturer: Hai Phong Garment JSC
// Seen from the factory: four customers (three brands and a buying office), its own two plants and one
// subcontractor as the production units, and the mills, trims and services behind them.
const POLICY = { audits: ['amfori BSCI'], minGrade: 'C', certs: ['OEKO-TEX'], restricted: ['XUAR cotton'] };
const FACTORY: SampleWorld = {
  world: 'factory', tenant: { name: 'Hai Phong Garment JSC', slug: 'practice-manufacturer', kind: 'factory', tz: 'Asia/Ho_Chi_Minh' },
  members: [
    { name: 'Nguyen Thi Lan', email: 'lan.nguyen@haiphong-practice.example', role: 'merchandiser', title: 'Export merchandiser' },
    { name: 'Pham Van Duc', email: 'duc.pham@haiphong-practice.example', role: 'qc', title: 'QA manager' },
    { name: 'Tran Minh Chau', email: 'chau.tran@haiphong-practice.example', role: 'logistics', title: 'Shipping and documents' },
  ],
  fromAddr: 'export@haiphong-garment.example',
  customers: [
    { code: 'NL', name: 'Northline', country: 'GB', segment: 'Outdoor', lang: 'en', channel: 'email_gmail', kind: 'brand', policy: { ...POLICY, audits: ['amfori BSCI', 'SMETA'], dpp: true } },
    { code: 'LA', name: 'Little Atlas', country: 'DE', segment: 'Kidswear', lang: 'de', channel: 'email_gmail', kind: 'brand', policy: { ...POLICY, minGrade: 'B', childSafety: true, dpp: true } },
    { code: 'MS', name: 'Meridian Sourcing', country: 'HK', segment: 'Buying office (for Oakfield & Co)', lang: 'en', channel: 'email_gmail', kind: 'buying_office', policy: { ...POLICY, audits: ['WRAP', 'SMETA'], uflpa: true } },
    { code: 'FJ', name: 'Fjell Outdoor', country: 'NO', segment: 'Ski and mountain', lang: 'en', channel: 'email_gmail', kind: 'brand', policy: { ...POLICY, certs: ['bluesign', 'OEKO-TEX'], pfasFree: true } },
  ],
  suppliers: [
    { code: 'P1', name: 'Hai Phong Plant 1 (An Duong)', short: 'Plant 1', country: 'VN', city: 'Hai Phong', tier: 1, type: 'Own plant: seam-sealed shells, 14 lines', lang: 'vi', channel: 'zalo', contact: 'Mr Hung', score: { otd: 93, quality: 96, compliance: 92, response: 1.2 } },
    { code: 'P2', name: 'Thai Binh Plant 2', short: 'Plant 2', country: 'VN', city: 'Thai Binh', tier: 1, type: 'Own plant: trousers, softshell, 9 lines', lang: 'vi', channel: 'zalo', contact: 'Ms Hanh', score: { otd: 89, quality: 93, compliance: 90, response: 1.8 } },
    { code: 'SC', name: 'Quang Ninh Sewing Co', short: 'Quang Ninh (sub)', country: 'VN', city: 'Ha Long', tier: 1, type: 'Approved subcontractor: light jackets', lang: 'vi', channel: 'zalo', contact: 'Mr Binh', score: { otd: 82, quality: 88, compliance: 79, response: 3.4 } },
    { code: 'NM', name: 'Nam Dinh Textile Co', short: 'Nam Dinh', country: 'VN', city: 'Nam Dinh', tier: 2, type: 'Fabric mill: nylon, recycled poly, lamination', lang: 'vi', channel: 'zalo', contact: 'Ms Hoa', score: { otd: 91, quality: 92, compliance: 88, response: 3 } },
    { code: 'FT', name: 'Long An Taffeta Mills', short: 'Long An', country: 'VN', city: 'Long An', tier: 2, type: 'Fabric mill: taffeta, ripstop, linings', lang: 'vi', channel: 'email_gmail', contact: 'Mr Khoa', score: { otd: 86, quality: 90, compliance: 87, response: 2.6 } },
    { code: 'RP', name: 'Binh Duong rPET Chip', short: 'rPET', country: 'VN', city: 'Binh Duong', tier: 3, type: 'Recycled polyester chip (GRS)', lang: 'vi', channel: 'email_gmail', contact: 'Ms Lan', score: { compliance: 92, response: 4 } },
  ],
  lines: [
    ['NL', 'P1', 'NM', 'RP', '48820', 'SS27-SHL-002', '3L shell jacket', 'Outerwear', '100% recycled polyamide 3L', 3200, 38.50, 45],
    ['NL', 'P1', 'NM', 'RP', '48821', 'SS27-SHL-003', '2.5L packable shell', 'Outerwear', '100% recycled polyester 2.5L', 4100, 27.90, 52],
    ['NL', 'P2', 'NM', 'RP', '48830', 'SS27-TRS-011', 'Stretch hiking trouser', 'Bottoms', '88% recycled nylon 12% elastane', 5400, 16.80, 38],
    ['NL', 'P1', 'NM', 'RP', '48850', 'SS27-SHL-005', 'Insulated belay jacket', 'Outerwear', '100% recycled polyester, 80g insulation', 2800, 41.20, 59],
    ['NL', 'P2', 'NM', 'RP', '48865', 'SS27-SHL-006', 'Softshell vest', 'Outerwear', '94% recycled polyester 6% elastane', 3600, 19.40, 31],
    ['LA', 'P2', 'FT', 'RP', 'L-2230', 'LA27-JKT-01', 'Kids rain jacket', 'Outerwear', '100% recycled polyester PU coated', 4500, 14.50, 24],
    ['LA', 'P1', 'FT', 'RP', 'L-2231', 'LA27-JKT-02', 'Kids puffer jacket', 'Outerwear', '100% recycled polyester, recycled fill', 3800, 17.90, 47],
    ['LA', 'SC', 'FT', 'RP', 'L-2233', 'LA27-JKT-04', 'Kids softshell jacket', 'Outerwear', '96% recycled polyester 4% elastane', 5200, 12.30, 54],
    ['MS', 'P1', 'FT', 'RP', 'M-6101', 'OC27-JKT-11', 'Waxed-look field jacket', 'Outerwear', '65% polyester 35% cotton, coated', 2400, 31.60, 33],
    ['MS', 'SC', 'FT', 'RP', 'M-6102', 'OC27-JKT-12', 'Coach jacket', 'Outerwear', '100% nylon taffeta', 4800, 13.80, 40],
    ['MS', 'P2', 'FT', 'RP', 'M-6105', 'OC27-GLT-03', 'Quilted gilet', 'Outerwear', '100% recycled nylon, recycled fill', 3000, 18.20, 61],
    ['MS', 'P1', 'NM', 'RP', 'M-6108', 'OC27-PRK-02', 'Rain parka', 'Outerwear', '100% recycled polyester 2L', 2200, 29.40, -4],
    ['FJ', 'P1', 'NM', 'RP', 'FJ-3301', 'W27-SKI-101', 'Ski shell jacket, 3L', 'Outerwear', '100% recycled polyamide 3L, PFAS-free DWR', 2600, 52.80, 66],
    ['FJ', 'P2', 'NM', 'RP', 'FJ-3302', 'W27-SKI-102', 'Ski shell pant, 3L', 'Bottoms', '100% recycled polyamide 3L, PFAS-free DWR', 2600, 44.10, 66],
    ['FJ', 'P1', 'NM', 'RP', 'FJ-3305', 'W27-PRK-110', 'Synthetic insulated parka', 'Outerwear', '100% recycled polyester, 133g insulation', 1800, 58.30, 73],
    ['FJ', 'SC', 'FT', 'RP', 'FJ-3308', 'W27-WND-120', 'Wind anorak', 'Outerwear', '100% recycled nylon ripstop', 3400, 15.60, 27],
  ],
  story: { '48830': { fit: { late: true } }, 'FJ-3301': { fabric: { expected: 3 } }, 'M-6101': { pp: { late: true } } },
  pod: { NL: 'Felixstowe', LA: 'Hamburg', MS: 'Los Angeles', FJ: 'Oslo' },
  extras: [
    { code: 'YK', name: 'YKK Vietnam', short: 'YKK', kind: 'trim_supplier', country: 'VN', lang: 'en', channel: 'email_gmail', contact: 'Mr Sato', role: 'Sales' },
    { code: 'ITK', name: 'Intertek Vietnam', short: 'Intertek', kind: 'lab', country: 'VN', lang: 'en', channel: 'email_gmail', contact: 'Ms Thuy', role: 'Softlines testing' },
    { code: 'KN', name: 'Kuehne+Nagel Hai Phong', short: 'K+N', kind: 'forwarder', country: 'VN', lang: 'en', channel: 'email_gmail', contact: 'Mr Long', role: 'Export operations' },
  ],
  contacts: {
    NL: [{ name: 'Hannah Price', role: 'Designer', email: 'hannah@northline.example' }, { name: 'Tom Reid', role: 'Merchandiser (buying)', email: 'tom.reid@northline.example' }],
    LA: [{ name: 'Katrin Vogel', role: 'Quality and compliance', email: 'katrin@littleatlas.example' }],
    MS: [{ name: 'Priya Nair', role: 'Senior merchandiser', email: 'priya@meridian.example' }],
    FJ: [{ name: 'Ingrid Solberg', role: 'Product developer', email: 'ingrid@fjell.example' }, { name: 'Lars Berg', role: 'Buyer', email: 'lars@fjell.example' }],
  },
  threads: [
    { po: '48830', party: 'NL', kind: 'email', lang: 'en', subject: 'Fit sample: comments and revision', msgs: [
      { d: -16, dir: 'out', from: 'Nguyen Thi Lan', text: 'Dear Hannah, fit sample for 48830 (size M) sent today by DHL 7731 0045 218. Measurement sheet attached. Lan', stream: 'Approvals' },
      { d: -11, dir: 'in', from: 'Hannah Price', role: 'Designer', text: 'Hi Lan, fit comments on 48830: front rise +1 cm, knee articulation dart 2 cm lower, waistband elastic too firm (reduce tension about 10%). Thigh is fine. Please send a revised fit sample; we cannot approve to PP on this one. Hannah', stream: 'Approvals' },
      { d: -10, dir: 'out', from: 'Nguyen Thi Lan', text: 'Noted, all three points. Pattern correction this week; revised fit sample will leave in 6 working days. Lan', stream: 'Approvals' },
      { d: -2, dir: 'in', from: 'Tom Reid', role: 'Merchandiser (buying)', text: 'Lan, the revised fit sample for 48830 has not arrived and I have no tracking number. Hannah needs it this week or the store date slips. Where is it? Tom', stream: 'Production status' },
    ] },
    { po: '48820', party: 'NM', kind: 'zalo', lang: 'vi', subject: 'Fabric: 3L laminate', msgs: [
      { d: -30, dir: 'out', from: 'Nguyen Thi Lan', text: 'Chị Hoa, đặt vải 3L recycled polyamide cho PO 48820: 6.400 m, 2 màu, giao trước ngày 20. Xin xác nhận.', en: 'Ms Hoa, ordering 3L recycled polyamide for PO 48820: 6,400 m, 2 colours, delivery before the 20th. Please confirm.', stream: 'Material sourcing' },
      { d: -29, dir: 'in', from: 'Ms Hoa', role: 'Sales', text: 'Đã nhận. Giao 6.400 m đúng hẹn, chứng chỉ GRS kèm theo lô hàng.', en: 'Received. 6,400 m on time, GRS certificate with the shipment.', stream: 'Material sourcing' },
      { d: -4, dir: 'in', from: 'Ms Hoa', role: 'Sales', text: 'Máy cán màng đang bảo trì, màu Navy trễ 5 ngày. Màu Black giao đúng hẹn. Xin lỗi chị.', en: 'The laminating line is under maintenance; Navy is 5 days late. Black ships on time. Apologies.', stream: 'Production status' },
      { d: -4, dir: 'out', from: 'Nguyen Thi Lan', text: 'Trễ 5 ngày ảnh hưởng đến ngày cắt. Chị cho em ngày giao chắc chắn bằng văn bản và kết quả test cột nước của lô Black hôm nay được không?', en: 'Five days hits our cutting date. Can you give me a firm delivery date in writing and the hydrostatic head result for the Black lot today?', stream: 'Production status' },
    ] },
    { po: 'FJ-3301', party: 'FJ', kind: 'email', lang: 'en', subject: 'Development: seam tape and PFAS-free DWR', msgs: [
      { d: -26, dir: 'in', from: 'Ingrid Solberg', role: 'Product developer', text: 'Hi Lan, for W27-SKI-101 we need 20,000 mm hydrostatic head after 5 washes with the PFAS-free DWR, and 13 mm seam tape throughout. Please confirm which tape you plan to use and send the lab report with the PP sample. Ingrid', stream: 'Tech pack forwarding' },
      { d: -24, dir: 'out', from: 'Nguyen Thi Lan', text: 'Dear Ingrid, confirmed: 13 mm 3L tape throughout. The mill tests the PFAS-free DWR at 20,000 mm after 5 washes; Intertek report will come with the PP sample. Fabric ex-mill date to follow. Lan', stream: 'Tech pack forwarding' },
      { d: -8, dir: 'in', from: 'Lars Berg', role: 'Buyer', text: 'Lan, we may add 600 pcs to FJ-3301 in a third colour. What would the price and the latest order date be to stay on the same ETD? Lars', stream: 'RFQ and quotes' },
    ] },
    { po: 'M-6101', party: 'MS', kind: 'email', lang: 'en', subject: 'PP sample overdue', msgs: [
      { d: -20, dir: 'in', from: 'Priya Nair', role: 'Senior merchandiser', text: 'Lan, M-6101 confirmed for Oakfield: 2,400 pcs, FOB 31.60, LC at sight. PP sample to me by the 5th please; Oakfield approves in the US, so allow 6 days. Priya', stream: 'Order confirmation' },
      { d: -19, dir: 'out', from: 'Nguyen Thi Lan', text: 'Thank you Priya, confirmed. PP sample by the 5th. Lan', stream: 'Order confirmation' },
      { d: -3, dir: 'in', from: 'Priya Nair', role: 'Senior merchandiser', text: 'Lan, the PP sample for M-6101 is now a week late and I have nothing to tell Oakfield. Please send the date today, and whether the coated fabric is the problem. Priya', stream: 'Production status' },
    ] },
    { po: 'L-2230', party: 'LA', kind: 'email', lang: 'en', subject: 'Child safety: cords and test report', msgs: [
      { d: -14, dir: 'in', from: 'Katrin Vogel', role: 'Quality and compliance', text: 'Dear Lan, for L-2230 please confirm in writing that the hood has no drawcords (EN 14682) and send the test report for small parts and the PU coating (REACH, phthalates) before shipment. Without both we cannot release. Katrin', stream: 'Compliance and CSR' },
      { d: -13, dir: 'out', from: 'Nguyen Thi Lan', text: 'Dear Katrin, confirmed: elasticated hood, no cords, snaps tested to 90 N. Bulk fabric goes to Intertek this week; report expected in 8 working days. Lan', stream: 'Compliance and CSR' },
    ] },
    { po: '48821', party: 'YK', kind: 'email', lang: 'en', subject: 'Zippers: lead time', msgs: [
      { d: -12, dir: 'out', from: 'Nguyen Thi Lan', text: 'Mr Sato, order for PO 48821: 4,300 pcs #5 AquaGuard, 62 cm, colours as attached. Need delivery in 15 days.', stream: 'Material sourcing' },
      { d: -11, dir: 'in', from: 'Mr Sato', role: 'Sales', text: 'Thank you. AquaGuard #5 in your two colours is 21 days at the moment, not 15. We can deliver Black in 15 days and Moss in 21. Please confirm.', stream: 'Material sourcing' },
    ] },
  ],
  inbound: [
    { party: 'NL', channelKind: 'email', from: 'hannah@northline.example', senderName: 'Hannah Price', subject: '48830 revised fit sample', text: 'Hi Lan, still no revised fit sample for 48830 and no tracking. I can hold the slot until Friday. If it is not here by then we lose the PP date. Please confirm today. Hannah' },
    { party: 'NM', channelKind: 'zalo', from: '+84900000002', senderName: 'Ms Hoa', subject: null, text: 'Chị Lan, vải Navy cho PO 48820 sẽ giao vào thứ Tư tuần sau, chắc chắn. Kết quả cột nước lô Black: 22.000 mm. Em gửi chứng chỉ GRS qua email.' },
    { party: 'MS', channelKind: 'email', from: 'priya@meridian.example', senderName: 'Priya Nair', subject: 'M-6108 documents', text: 'Lan, M-6108 sailed last week but I still do not have the commercial invoice, packing list and the bill of lading copy. The LC presentation period ends in 9 days. Please send all three today. Priya' },
  ],
};

export const SAMPLE_WORLDS: Record<World, SampleWorld> = { buying_office: BUYING_OFFICE, brand: BRAND, factory: FACTORY };
