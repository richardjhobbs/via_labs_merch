// Sample conversations for the Meridian world. An order file is every chain on a PO: the factory,
// the mill, the forwarder, the testing lab, and each function on the customer side (design, buying,
// logistics, compliance). Day offsets are relative to today; outbound messages are from the
// merchandiser who handles the customer. Contacts carry a role so the file shows who said what.
export type SampleMsg = { d: number; dir: 'in' | 'out'; from: string; role?: string; text: string; en?: string; stream?: string };
export type SampleThread = { po: string; party: string; kind: string; lang: string; subject: string; msgs: SampleMsg[] };

// Extra parties the order file needs beyond customers and the three supplier tiers.
export const SAMPLE_EXTRA_PARTIES = [
  { code: 'KN', name: 'Kuehne+Nagel Hong Kong', short: 'K+N', kind: 'forwarder', country: 'HK', lang: 'en', channel: 'email_gmail', contact: 'Winnie Lau', role: 'Export operations' },
  { code: 'ITK', name: 'Intertek Shenzhen', short: 'Intertek', kind: 'lab', country: 'CN', lang: 'en', channel: 'email_gmail', contact: 'Kevin Zhou', role: 'Softlines testing' },
];

// Contacts on the customer side, by function.
export const SAMPLE_CONTACTS: Record<string, { name: string; role: string; email: string }[]> = {
  NL: [
    { name: 'Hannah Price', role: 'Designer', email: 'hannah@northline.example' },
    { name: 'Tom Reid', role: 'Merchandiser (buying)', email: 'tom.reid@northline.example' },
    { name: 'Sarah Okafor', role: 'Logistics', email: 'sarah@northline.example' },
    { name: 'Dan Mehta', role: 'Compliance', email: 'dan@northline.example' },
  ],
  OK: [{ name: 'Mark Ellison', role: 'Buyer', email: 'mark@oakfield.example' }, { name: 'Jess Carter', role: 'Import logistics', email: 'jess@oakfield.example' }],
  CV: [{ name: 'Lucía Ferrer', role: 'Diseño', email: 'lucia@casaverano.example' }],
  KO: [{ name: 'Aiko Tanaka', role: 'Sourcing', email: 'tanaka@koen.example' }],
};

export const SAMPLE_THREADS: SampleThread[] = [
  // ======================= 48812: Northline organic tee at Huaxin, fabric Yongli =======================
  { po: '48812', party: 'HX', kind: 'wecom', lang: 'zh', subject: 'Production', msgs: [
    { d: -41, dir: 'out', from: 'Priya Nair', text: '陈小姐您好，48812 订单确认，12,000 件，三色，FOB 4.10，ETD 12月12日。请确认面料已向永利下单。', en: 'Ms Chen, PO 48812 confirmed: 12,000 pcs, 3 colours, FOB 4.10, ETD 12 Dec. Please confirm fabric is booked with Yongli.', stream: 'Order confirmation' },
    { d: -40, dir: 'in', from: 'Ms Chen', role: 'Merchandising', text: '收到，已向永利下单 160g 有机棉汗布，交期 10月25日。色样下周寄出。', en: 'Received. Fabric booked with Yongli, 160g organic jersey, delivery 25 Oct. Lab dips go out next week.', stream: 'Production status' },
    { d: -24, dir: 'in', from: 'Ms Chen', role: 'Merchandising', text: '三个色样已寄出，DHL 单号 8841 2290 115。', en: 'Three lab dips sent, DHL 8841 2290 115.', stream: 'Approvals' },
    { d: -21, dir: 'out', from: 'Priya Nair', text: '色样已获 Northline 批准，黑色、海军蓝、石色。请按批准色样大货生产。', en: 'Lab dips approved by Northline: Black, Navy, Stone. Please proceed to bulk against the approved dips.', stream: 'Approvals' },
    { d: -6, dir: 'in', from: 'Ms Chen', role: 'Merchandising', text: '永利通知面料推迟，可能 10月30日才能到厂。我们会尽快安排。', en: 'Yongli says fabric is delayed, may reach us only on 30 Oct. We will arrange as fast as we can.', stream: 'Production status' },
    { d: -5, dir: 'out', from: 'Priya Nair', text: '请提供书面的新交期和恢复计划：裁剪、PP 样、出厂日期。ETD 12月12日不能变。', en: 'Please give the new dates in writing and a recovery plan: cut, PP sample, ex-factory. ETD 12 Dec cannot move.', stream: 'Production status' },
  ] },
  { po: '48812', party: 'SY', kind: 'wecom', lang: 'zh', subject: 'Fabric', msgs: [
    { d: -39, dir: 'in', from: 'Mr Xu', role: 'Sales', text: '华信 48812 面料订单已收到：160g 有机棉汗布 4,800 kg，三色，交期 10月25日。纱线来自古吉拉特合作社，GOTS 交易证书随货。', en: 'Fabric order for Huaxin 48812 received: 160g organic jersey 4,800 kg, three colours, delivery 25 Oct. Yarn from the Gujarat co-op, GOTS transaction certificate with the goods.', stream: 'Material sourcing' },
    { d: -7, dir: 'in', from: 'Mr Xu', role: 'Sales', text: '染厂锅炉检修，三色大货推迟五天，预计 10月30日出厂。抱歉。', en: 'Dye house boiler maintenance; bulk in three colours is five days late, ex-mill 30 Oct. Apologies.', stream: 'Production status' },
    { d: -7, dir: 'out', from: 'Priya Nair', text: '徐先生，五天对我们影响很大。能否先出黑色和海军蓝（各 1,600 kg），石色后出？请今天回复。', en: 'Mr Xu, five days hurts. Can Black and Navy (1,600 kg each) ship first and Stone follow? Please reply today.', stream: 'Production status' },
    { d: -6, dir: 'in', from: 'Mr Xu', role: 'Sales', text: '可以。黑色、海军蓝 10月27日出，石色 10月30日出。', en: 'Yes. Black and Navy ex-mill 27 Oct, Stone 30 Oct.', stream: 'Production status' },
  ] },
  { po: '48812', party: 'NL', kind: 'email', lang: 'en', subject: 'Design: fit and lab dips', msgs: [
    { d: -42, dir: 'in', from: 'Hannah Price', role: 'Designer', text: 'Hi Priya, PO 48812 attached with tech pack v3. Please confirm ETD 12 Dec and lab dips by end of month. Thanks, Hannah', stream: 'Tech pack forwarding' },
    { d: -41, dir: 'out', from: 'Priya Nair', text: 'Hi Hannah, confirmed: 48812, 12,000 pcs, ETD 12 Dec Yantian, in-store 25 Jan. Lab dips with you by 8 Oct. Priya', stream: 'Order confirmation' },
    { d: -22, dir: 'out', from: 'Priya Nair', text: 'Lab dips for 48812 sent by DHL today: Black, Navy, Stone. Please approve by Friday so Yongli can dye on schedule.', stream: 'Approvals' },
    { d: -21, dir: 'in', from: 'Hannah Price', role: 'Designer', text: 'All three approved. Stone slightly warm but within tolerance, go ahead. Fit sample for 48812 was fine; one comment: neck rib 2 mm narrower. H', stream: 'Approvals' },
  ] },
  { po: '48812', party: 'NL', kind: 'email', lang: 'en', subject: 'Buying: delivery and WIP', msgs: [
    { d: -30, dir: 'in', from: 'Tom Reid', role: 'Merchandiser (buying)', text: 'Priya, buying needs the SS27 drop 1 in store 25 Jan without fail; marketing has a launch tied to it. Any risk to 48812 I need to hear first, not last. Weekly WIP on Mondays please. Tom', stream: 'WIP reports' },
    { d: -14, dir: 'out', from: 'Priya Nair', text: 'Tom, WIP attached (your sheet). 48812 on plan: fabric 25 Oct, cut 10 Nov, PP 15 Nov, ETD 12 Dec. 48830 fit sample with Hannah since 17 Oct.', stream: 'WIP reports' },
    { d: -7, dir: 'out', from: 'Priya Nair', text: 'Tom, early flag as agreed: Yongli has a 5-day dye-house delay on 48812 fabric. I have asked Huaxin for a recovery plan and am holding ETD 12 Dec. Will confirm by Friday whether it holds. Priya', stream: 'Production status' },
    { d: -6, dir: 'in', from: 'Tom Reid', role: 'Merchandiser (buying)', text: 'Thanks for the heads-up. If ETD moves at all I need to know by 1 Nov, we would consider air on the Black only. Tom', stream: 'Production status' },
  ] },
  { po: '48812', party: 'NL', kind: 'email', lang: 'en', subject: 'Logistics: booking and routing', msgs: [
    { d: -12, dir: 'in', from: 'Sarah Okafor', role: 'Logistics', text: 'Hi Priya, for 48812 please book with K+N on our nominated contract, Yantian to Felixstowe, CY/CY, one 40HC. Our ref NL-SS27-0412. Cartons max 25 kg. Sarah', stream: 'Logistics' },
    { d: -11, dir: 'out', from: 'Priya Nair', text: 'Noted Sarah: K+N nominated, 1 x 40HC, Yantian to Felixstowe, ref NL-SS27-0412, cartons under 25 kg. Booking request goes to K+N 2 weeks before ETD. Priya', stream: 'Logistics' },
  ] },
  { po: '48812', party: 'NL', kind: 'email', lang: 'en', subject: 'Compliance: certificates and tests', msgs: [
    { d: -18, dir: 'in', from: 'Dan Mehta', role: 'Compliance', text: 'Priya, for 48812 we need before shipment: GOTS transaction certificate for the fabric, Huaxin amfori audit valid at ETD, and a bulk test report (dimensional stability, colourfastness). Dan', stream: 'Compliance and CSR' },
    { d: -17, dir: 'out', from: 'Priya Nair', text: 'Dan: Yongli issues the GOTS TC with the fabric (co-op yarn, certificate on file). Huaxin amfori valid to 14 Feb 2027. Bulk tests booked with Intertek Shenzhen on first bulk fabric. Priya', stream: 'Compliance and CSR' },
  ] },
  { po: '48812', party: 'KN', kind: 'email', lang: 'en', subject: 'Booking', msgs: [
    { d: -10, dir: 'out', from: 'Priya Nair', text: 'Winnie, pre-alert for Northline 48812: 1 x 40HC Yantian to Felixstowe, cargo ready 10 Dec, ETD 12 Dec, Northline contract ref NL-SS27-0412. Formal booking to follow 28 Nov. Priya', stream: 'Logistics' },
    { d: -9, dir: 'in', from: 'Winnie Lau', role: 'Export operations', text: 'Noted Priya. Space is tight mid-December; book by 26 Nov to hold the 12 Dec sailing (CMA CGM, cut-off 9 Dec). Winnie', stream: 'Logistics' },
  ] },
  { po: '48812', party: 'ITK', kind: 'email', lang: 'en', subject: 'Bulk testing', msgs: [
    { d: -17, dir: 'out', from: 'Priya Nair', text: 'Kevin, please book bulk fabric tests for Northline 48812 (160g organic jersey, 3 colours): dimensional stability, colourfastness to wash and rub, pH. Samples from Huaxin on fabric receipt. Priya', stream: 'QC' },
    { d: -16, dir: 'in', from: 'Kevin Zhou', role: 'Softlines testing', text: 'Booked, job ITK-SZ-48812. 5 working days from sample receipt. Please send 1 m per colour. Kevin', stream: 'QC' },
  ] },

  // ======================= 48830: Northline hiking trouser at Hai Phong =======================
  { po: '48830', party: 'HP', kind: 'zalo', lang: 'vi', subject: 'Production', msgs: [
    { d: -13, dir: 'in', from: 'Mr Tuan', role: 'Merchandising', text: 'Chị Priya, mẫu fit 48830 đã gửi DHL hôm nay, số 7703 1180 442. Chờ nhận xét.', en: 'Priya, fit sample 48830 sent by DHL today, 7703 1180 442. Waiting for comments.', stream: 'Approvals' },
    { d: -3, dir: 'out', from: 'Priya Nair', text: 'Anh Tuan, Northline chưa gửi nhận xét fit. Tôi đang thúc. Giữ nguyên lịch cắt 20/11 cho đến khi có thông báo.', en: 'Mr Tuan, Northline has not sent fit comments yet. I am chasing. Keep cut on 20 Nov until told otherwise.', stream: 'Approvals' },
    { d: -1, dir: 'in', from: 'Mr Tuan', role: 'Merchandising', text: 'Đã rõ. Nếu nhận xét đến trước 2/11, mẫu fit sửa sẽ gửi lại trong 5 ngày.', en: 'Understood. If comments arrive before 2 Nov, the revised fit sample goes back within 5 days.', stream: 'Approvals' },
  ] },
  { po: '48830', party: 'NL', kind: 'email', lang: 'en', subject: 'Design: fit', msgs: [
    { d: -12, dir: 'out', from: 'Priya Nair', text: 'Hannah, fit sample 48830 with you today (DHL 7703 1180 442). Comments by 24 Oct keeps cut on 20 Nov. Priya', stream: 'Approvals' },
    { d: -4, dir: 'out', from: 'Priya Nair', text: 'Hannah, fit comments on 48830 are now 4 days late and Hai Phong is holding cut. Anything I can do to help get them out?', stream: 'Approvals' },
  ] },

  // ======================= OK-5550: Oakfield Harrington at Huaxin, LC at sight =======================
  { po: 'OK-5550', party: 'OK', kind: 'email', lang: 'en', subject: 'Buying: PP approval', msgs: [
    { d: -9, dir: 'out', from: 'Priya Nair', text: 'Hi Mark, PP sample for OK-5550 shipped Monday, FedEx 7719 0032 884. Please approve by 26 Oct so Huaxin can cut on 1 Nov. ETD 3 Dec. Priya', stream: 'Approvals' },
    { d: -3, dir: 'out', from: 'Priya Nair', text: 'Mark, gentle reminder: PP approval for OK-5550 is now 3 days late. Every day of delay moves ex-factory by a day. Could you confirm today?', stream: 'Approvals' },
    { d: -1, dir: 'in', from: 'Mark Ellison', role: 'Buyer', text: 'Priya, apologies. Our head of design is travelling until Thursday. Approval Friday at the latest. Mark', stream: 'Approvals' },
  ] },
  { po: 'OK-5550', party: 'OK', kind: 'email', lang: 'en', subject: 'Import logistics: LC and documents', msgs: [
    { d: -15, dir: 'in', from: 'Jess Carter', role: 'Import logistics', text: 'Priya, LC for OK-5550 opened with HSBC, number 00412-77A, latest shipment 5 Dec, docs within 21 days. Please check the LC copy attached for discrepancies. Jess', stream: 'Logistics' },
    { d: -14, dir: 'out', from: 'Priya Nair', text: 'Jess, LC checked: one discrepancy, it says "Los Angeles" but the PO says "Long Beach" for discharge. Please amend to Long Beach or we will have a document issue at negotiation. Priya', stream: 'Logistics' },
    { d: -12, dir: 'in', from: 'Jess Carter', role: 'Import logistics', text: 'Amendment requested, will confirm when HSBC issues it. Jess', stream: 'Logistics' },
  ] },
  { po: 'OK-5550', party: 'HX', kind: 'wecom', lang: 'zh', subject: 'Production', msgs: [
    { d: -10, dir: 'in', from: 'Ms Chen', role: 'Merchandising', text: 'OK-5550 PP 样已寄 Oakfield，FedEx 7719 0032 884。等批准后 11月1日裁剪。', en: 'OK-5550 PP sample sent to Oakfield, FedEx 7719 0032 884. Cut 1 Nov once approved.', stream: 'Approvals' },
    { d: -2, dir: 'out', from: 'Priya Nair', text: 'Oakfield 的 PP 批准推迟，最晚周五。请先准备裁剪，批准一到即开裁。', en: 'Oakfield PP approval is delayed, Friday at the latest. Please prepare so cutting starts the day approval lands.', stream: 'Approvals' },
  ] },

  // ======================= C7203: Casa Verano silk blouse at Jiaxing =======================
  { po: 'C7203', party: 'CV', kind: 'email', lang: 'es', subject: 'Diseño: lab dips', msgs: [
    { d: -7, dir: 'out', from: 'Tom Becker', text: 'Hola Lucía, los lab dips de C7203 salieron hoy por DHL (8841 2311 907). Necesitamos la aprobación antes del 25 de octubre para teñir a tiempo. Saludos, Tom', en: 'Hi Lucía, lab dips for C7203 went out today by DHL (8841 2311 907). We need approval before 25 Oct to dye on time. Tom', stream: 'Approvals' },
    { d: -2, dir: 'out', from: 'Tom Becker', text: 'Lucía, seguimos sin aprobación de los lab dips. Jiaxing no puede reservar el teñido sin ella. ¿Podéis confirmar hoy?', en: 'Lucía, still no lab dip approval. Jiaxing cannot book dyeing without it. Can you confirm today?', stream: 'Approvals' },
    { d: -1, dir: 'in', from: 'Lucía Ferrer', role: 'Diseño', text: 'Tom, perdona el retraso. El estampado B necesita un ajuste de tono; mañana os mando el comentario y la aprobación del resto.', en: 'Tom, sorry for the delay. Print B needs a tone adjustment; tomorrow I send the comment and approval of the rest.', stream: 'Approvals' },
  ] },
  { po: 'C7203', party: 'JS', kind: 'email', lang: 'zh', subject: 'Production', msgs: [
    { d: -8, dir: 'in', from: 'Ms Lin', role: 'Merchandising', text: 'C7203 色样已寄 Casa Verano。印花 B 的网版已备好，等批准后染色 3 天、印花 5 天。', en: 'C7203 lab dips sent to Casa Verano. Screens for print B are ready; after approval dyeing 3 days, printing 5 days.', stream: 'Approvals' },
    { d: -2, dir: 'out', from: 'Tom Becker', text: '林小姐，客户批准推迟。请问如果 11月2日批准，出厂日期是否仍能保持 12月15日？', en: 'Ms Lin, customer approval is delayed. If approval lands 2 Nov, can ex-factory still hold 15 Dec?', stream: 'Production status' },
    { d: -1, dir: 'in', from: 'Ms Lin', role: 'Merchandising', text: '11月2日批准可以保持 12月15日出厂，但不能再晚。', en: 'Approval on 2 Nov holds ex-factory 15 Dec, but no later.', stream: 'Production status' },
  ] },

  // ======================= 48825: Northline fleece at Apex, Bangladesh =======================
  { po: '48825', party: 'DA', kind: 'whatsapp', lang: 'en', subject: 'Production', msgs: [
    { d: -17, dir: 'in', from: 'Mr Hasan', role: 'Merchandising', text: 'Fabric for 48825 received from Ahmedabad, 4,100 kg, lab test passed. Cutting plan 28 Oct.', stream: 'Production status' },
    { d: -16, dir: 'out', from: 'Priya Nair', text: 'Thanks Hasan. Please send the fabric inspection report and confirm inline QC date; I will book Inspectorio.', stream: 'QC' },
    { d: -1, dir: 'in', from: 'Mr Hasan', role: 'Merchandising', text: 'Cutting started today as planned. Inline possible from 5 Nov. Report sent by email.', stream: 'Production status' },
  ] },
  { po: '48825', party: 'NL', kind: 'email', lang: 'en', subject: 'Compliance: audit', msgs: [
    { d: -20, dir: 'in', from: 'Dan Mehta', role: 'Compliance', text: 'Priya, Apex’s Sedex SMETA expires 30 Nov, before 48825 ships. We cannot accept shipment from a site with a lapsed audit. What is the plan? Dan', stream: 'Compliance and CSR' },
    { d: -19, dir: 'out', from: 'Priya Nair', text: 'Dan, Apex has the follow-up SMETA booked for 12 Nov with Intertek Dhaka; report due 26 Nov, before ETD 29 Nov. I will send the report the day it lands. Priya', stream: 'Compliance and CSR' },
  ] },

  // ======================= K-1121: Kōen overshirt at Tirupur =======================
  { po: 'K-1121', party: 'KO', kind: 'email', lang: 'en', subject: 'Sourcing: certificates and routing', msgs: [
    { d: -20, dir: 'in', from: 'Aiko Tanaka', role: 'Sourcing', text: 'Tom-san, please send GOTS transaction certificate for the organic cotton on K-1121 before shipment. Also confirm Tokyo routing. Regards, Tanaka', stream: 'Compliance and CSR' },
    { d: -19, dir: 'out', from: 'Tom Becker', text: 'Tanaka-san, understood. Ahmedabad will issue the TC after weaving; with you before ETD. Routing confirmed Tuticorin to Tokyo. Tom', stream: 'Compliance and CSR' },
  ] },
];
