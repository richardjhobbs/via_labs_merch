// Starting points for the compliance work a merchandising team carries, from docs/compliance-landscape.md
// (research of 7 November 2026). A template becomes an ordinary programme with requirements the company then
// edits; cadences are the usual ones, so the agreement, standard or authority always wins.
//
// `site: true` marks work done at a factory site. A factory does it itself; a buying office, trading company,
// brand or retailer collects it from each of its tier 1 factories instead (applies_to suppliers), so one
// template serves both sides of the trade.
import { EU_COUNTRIES, type Frequency, type Trigger } from './esg-shared';

type Role = 'owner' | 'manager' | 'merchandiser' | 'qc' | 'compliance' | 'logistics';
export type TemplateReq = {
  title: string; instruction: string; discipline: string; measure: 'number' | 'yes_no' | 'evidence' | 'text'; owner_role: Role; evidence?: string; unit?: string;
  trigger?: Trigger; frequency?: Frequency; due_days?: number; lead_days?: number;
  milestone?: 'pp' | 'cut' | 'inline' | 'final' | 'exf' | 'etd' | 'eta'; milestone_offset?: number;
  site?: boolean; suppliers?: string[];            // suppliers: always fan out to these supplier kinds
};
export type Template = { destinations?: string[]; id: string; group: 'finance' | 'customer' | 'audit' | 'certification' | 'chemicals' | 'market' | 'licence'; kind: string; name: string; framework: string; summary: string; status?: string; perOrder?: boolean; reqs: TemplateReq[] };

const Q: Pick<TemplateReq, 'trigger' | 'frequency' | 'due_days'> = { trigger: 'schedule', frequency: 'quarterly', due_days: 30 };
const Y: Pick<TemplateReq, 'trigger' | 'frequency' | 'due_days'> = { trigger: 'schedule', frequency: 'annual', due_days: 60 };
const EXP = (lead = 90): Pick<TemplateReq, 'trigger' | 'lead_days'> => ({ trigger: 'expiry', lead_days: lead });
const PO = (milestone: TemplateReq['milestone'], offset: number): Pick<TemplateReq, 'trigger' | 'milestone' | 'milestone_offset'> => ({ trigger: 'per_order', milestone, milestone_offset: offset });

export const TEMPLATES: Template[] = [
  // ---------------------------------------------------------------- finance
  { id: 'bank-esap', group: 'finance', kind: 'loan', name: 'Bank or fund ESG covenants (ESAP)', framework: 'IFC Performance Standards, sustainability-linked loan principles',
    summary: 'The usual Environmental and Social Action Plan and KPI reporting a bank passes down from its development-finance lender. Set the targets from your facility agreement.',
    reqs: [
      { ...Q, title: 'Energy use', instruction: 'Report total electricity and fuel used in the quarter, from meter readings and bills, and the share from renewable sources.', discipline: 'energy', measure: 'number', unit: 'kWh', owner_role: 'compliance', evidence: 'Meter readings, utility and fuel bills' },
      { ...Q, title: 'Water use and effluent quality', instruction: 'Report water withdrawn in the quarter and attach the effluent test results against the discharge limits.', discipline: 'water', measure: 'number', unit: 'm3', owner_role: 'compliance', evidence: 'Water meter log, accredited effluent test report' },
      { ...Y, title: 'Greenhouse gas emissions (scope 1 and 2)', instruction: 'Calculate scope 1 and 2 emissions for the year from the energy figures, with the method and emission factors used.', discipline: 'emissions', measure: 'number', unit: 'tCO2e', owner_role: 'compliance', evidence: 'Calculation sheet' },
      { ...Q, title: 'Accidents and lost-time injuries', instruction: 'Report the number of recordable accidents and lost-time injuries, with any fatality or serious incident reported to the bank immediately.', discipline: 'health_safety', measure: 'number', unit: 'count', owner_role: 'compliance', evidence: 'Accident register' },
      { trigger: 'schedule', frequency: 'semiannual', due_days: 30, title: 'Wages, hours and grievances', instruction: 'Confirm legal minimum wage and overtime were paid, report average weekly hours and the grievances received and closed.', discipline: 'labour', measure: 'text', owner_role: 'compliance', evidence: 'Payroll summary, attendance records, grievance log' },
      { ...Y, title: 'Annual environmental and social monitoring report', instruction: 'Compile the annual E&S report in the format the bank asks for and have it signed by management.', discipline: 'governance', measure: 'evidence', owner_role: 'manager', evidence: 'Signed annual report' },
    ] },

  // ---------------------------------------------------------------- customers
  { id: 'brand-coc', group: 'customer', kind: 'customer', name: 'Brand code of conduct and supplier manual', framework: "Customer's code of conduct",
    summary: "A brand or retailer's code of conduct: signed acceptance, a valid social audit, open corrective actions, disclosure of subcontractors, and the same terms passed to your own suppliers.",
    reqs: [
      { ...Y, title: 'Signed code of conduct acceptance', instruction: "Sign the customer's current code of conduct and supplier manual and send it back.", discipline: 'governance', measure: 'evidence', owner_role: 'manager', evidence: 'Signed acceptance' },
      { ...Y, title: 'Code of conduct passed to suppliers', instruction: "Each factory working on this customer's orders signs the code of conduct.", discipline: 'governance', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Signed acceptance from the factory', suppliers: ['factory'] },
      { ...EXP(90), title: 'Valid social audit', instruction: 'Keep an accepted social audit (BSCI, SMETA, WRAP, SLCP or the one the customer names) in date at every production site.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Audit report and rating', site: true },
      { ...Y, title: 'Subcontractor and production site disclosure', instruction: 'Disclose every site and subcontractor used for this customer, including printing, embroidery and washing, and get approval before using a new one.', discipline: 'traceability', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Site list' },
      { ...Y, title: 'Worker grievance mechanism', instruction: 'Show a working grievance channel for workers, with the log of cases and how each was closed.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Grievance procedure and log', site: true },
    ] },
  { id: 'brand-rsl', group: 'customer', kind: 'customer', name: 'Brand restricted substances and product testing', framework: "Customer's RSL and testing manual", perOrder: true,
    summary: "The customer's restricted substances list and testing manual: an accredited test report for every order before final inspection, and chemical management at the mills.",
    reqs: [
      { ...PO('final', -7), title: 'Product test report', instruction: "Send an accredited lab report covering the customer's RSL and physical tests for the order, passed, a week before final inspection.", discipline: 'chemicals', measure: 'evidence', owner_role: 'qc', evidence: 'Accredited test report' },
      { ...Y, title: 'RSL acknowledgement', instruction: "Sign the customer's current restricted substances list.", discipline: 'chemicals', measure: 'evidence', owner_role: 'compliance', evidence: 'Signed RSL' },
      { ...Q, title: 'Chemical inventory at wet processing', instruction: 'Each mill and laundry sends its chemical inventory with MRSL conformance for every product used.', discipline: 'chemicals', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Chemical inventory, ZDHC Gateway or InCheck report', suppliers: ['mill'] },
    ] },
  { id: 'brand-traceability', group: 'customer', kind: 'customer', name: 'Supply chain mapping and traceability', framework: "Customer's traceability requirements", perOrder: true,
    summary: 'Tier 1 to tier 3 disclosure once a year, and fibre and yarn origin documents for each order.',
    reqs: [
      { ...Y, title: 'Supplier map tier 1 to 3', instruction: 'Disclose the garment factory, fabric mill and yarn or fibre supplier for each product group, with addresses.', discipline: 'traceability', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Supplier map' },
      { ...PO('etd', -7), title: 'Order origin documents', instruction: 'Collect fabric and yarn invoices and packing lists back to the spinner for the order, and fibre origin where the customer asks for it.', discipline: 'traceability', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Invoices and packing lists by tier' },
    ] },

  // ---------------------------------------------------------------- audits and industry schemes
  { id: 'amfori-bsci', group: 'audit', kind: 'audit', name: 'amfori BSCI', framework: 'amfori BSCI', status: 'amfori BSCI reported as SSCI-recognised, March 2026. Audit validity depends on the rating.',
    summary: 'A valid BSCI audit at each site, and the corrective actions from it closed on time. Upload the audit report to add each finding.',
    reqs: [{ ...EXP(120), title: 'BSCI audit in date', instruction: 'Book the next audit well before the current one expires and prepare with a self-assessment.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Audit report on the amfori platform', site: true }] },
  { id: 'smeta', group: 'audit', kind: 'audit', name: 'SMETA (Sedex)', framework: 'Sedex SMETA',
    summary: 'The Sedex self-assessment kept current and a SMETA audit in date for customers who ask for it.',
    reqs: [
      { ...Y, title: 'Sedex self-assessment questionnaire', instruction: 'Update the site self-assessment on Sedex.', discipline: 'labour', measure: 'yes_no', owner_role: 'compliance', evidence: 'Sedex SAQ', site: true },
      { ...EXP(120), title: 'SMETA audit in date', instruction: 'Keep a SMETA audit within the period your customers accept and close its corrective actions on Sedex.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'SMETA report and CAP', site: true },
    ] },
  { id: 'wrap', group: 'audit', kind: 'certification', name: 'WRAP', framework: 'WRAP', status: 'Reported from 1 March 2026: certificates valid one year, renewal needs 90 days of practice (45 for recertification). Single source.',
    summary: 'A WRAP certificate in date at each site, with the self-assessment done before the audit.',
    reqs: [{ ...EXP(150), title: 'WRAP certificate in date', instruction: 'Complete the pre-audit self-assessment and book the audit early enough to renew before expiry.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'WRAP certificate', site: true }] },
  { id: 'slcp-higg', group: 'audit', kind: 'industry', name: 'SLCP and Higg FEM', framework: 'SLCP converged assessment; Cascale Higg FEM', status: 'Higg FEM verification protocol 1.6 from 1 January 2026.',
    summary: 'The annual SLCP social assessment and Higg FEM environmental module, self-assessed and verified, shared with customers.',
    reqs: [
      { ...Y, title: 'SLCP verified assessment', instruction: 'Complete the SLCP self-assessment and its verification, then share it with customers on the Gateway.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Verified SLCP assessment', site: true },
      { ...Y, title: 'Higg FEM self-assessment and verification', instruction: 'Complete the Higg FEM, have it verified and share the verified module with customers.', discipline: 'governance', measure: 'evidence', owner_role: 'compliance', evidence: 'Verified Higg FEM', site: true },
    ] },
  { id: 'building-safety', group: 'audit', kind: 'industry', name: 'Building and fire safety (RSC, Pakistan Accord)', framework: 'RSC Bangladesh; International Accord (Pakistan)', status: 'Pakistan Accord renewed 1 January 2026, auto-extends to end 2029.',
    summary: 'Structural, fire and electrical remediation tracked to closure, the safety committee working, and inspections prepared for.',
    reqs: [
      { ...Q, title: 'Remediation plan progress', instruction: 'Report progress on every open structural, fire and electrical finding with photos and the expected closure date.', discipline: 'health_safety', measure: 'evidence', owner_role: 'compliance', evidence: 'CAP status and photos', site: true },
      { ...Q, title: 'Safety committee meetings', instruction: 'Hold the safety committee meeting and keep the minutes.', discipline: 'health_safety', measure: 'evidence', owner_role: 'compliance', evidence: 'Minutes', site: true },
    ] },
  { id: 'better-work', group: 'audit', kind: 'industry', name: 'ILO Better Work', framework: 'ILO and IFC Better Work',
    summary: 'The annual Better Work assessment and the improvement plan that follows it.',
    reqs: [
      { ...Y, title: 'Better Work assessment', instruction: 'Prepare for and complete the annual assessment.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Assessment report', site: true },
      { ...Q, title: 'Improvement plan progress', instruction: 'Update the improvement plan agreed with Better Work.', discipline: 'labour', measure: 'text', owner_role: 'compliance', evidence: 'Progress report', site: true },
    ] },

  // ---------------------------------------------------------------- certifications
  { id: 'oeko-tex', group: 'certification', kind: 'certification', name: 'OEKO-TEX STANDARD 100', framework: 'OEKO-TEX STANDARD 100', status: '2026 limits, including tighter PFAS limits, apply from 1 June 2026.',
    summary: 'Certificates in date for each article group, from your own site and from the mills and trim suppliers whose materials go into certified products.',
    reqs: [
      { ...EXP(90), title: 'OEKO-TEX certificate in date', instruction: 'Renew the certificate for each article group before it expires.', discipline: 'chemicals', measure: 'evidence', owner_role: 'compliance', evidence: 'OEKO-TEX certificate', site: true },
      { ...EXP(60), title: 'Supplier OEKO-TEX certificates', instruction: 'Hold a valid certificate from each mill and trim supplier used in certified products.', discipline: 'chemicals', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Supplier certificate', suppliers: ['mill'] },
    ] },
  { id: 'gots', group: 'certification', kind: 'certification', name: 'GOTS', framework: 'Global Organic Textile Standard', status: 'Version 8.0 mandatory from 1 March 2027. Transaction certificates are per shipment.', perOrder: true,
    summary: 'A scope certificate in date across the chain, and a transaction certificate for every shipment of certified goods.',
    reqs: [
      { ...EXP(90), title: 'GOTS scope certificate', instruction: 'Keep the scope certificate in date; prepare for the annual inspection.', discipline: 'traceability', measure: 'evidence', owner_role: 'compliance', evidence: 'Scope certificate', site: true },
      { ...EXP(60), title: 'Supplier scope certificates', instruction: 'Hold a valid GOTS scope certificate from each mill and processor in the chain.', discipline: 'traceability', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Scope certificate', suppliers: ['mill'] },
      { ...PO('etd', 14), title: 'GOTS transaction certificate', instruction: 'Apply for the transaction certificate for the shipment and send it to the customer.', discipline: 'traceability', measure: 'evidence', owner_role: 'logistics', evidence: 'Transaction certificate' },
    ] },
  { id: 'textile-exchange', group: 'certification', kind: 'certification', name: 'GRS, RCS, OCS, RWS (Textile Exchange)', framework: 'Textile Exchange standards', perOrder: true,
    summary: 'Recycled, organic and wool standards: scope certificates in date and a transaction certificate for each shipment of certified goods.',
    reqs: [
      { ...EXP(90), title: 'Scope certificate', instruction: 'Keep the scope certificate in date for each standard you hold.', discipline: 'traceability', measure: 'evidence', owner_role: 'compliance', evidence: 'Scope certificate', site: true },
      { ...PO('etd', 14), title: 'Transaction certificate', instruction: 'Request the transaction certificate for the shipment in the Textile Exchange database and send it on.', discipline: 'traceability', measure: 'evidence', owner_role: 'logistics', evidence: 'Transaction certificate' },
    ] },
  { id: 'better-cotton', group: 'certification', kind: 'certification', name: 'Better Cotton', framework: 'Better Cotton chain of custody', status: 'Moved to a certified chain of custody model.',
    summary: 'Chain of custody certification in date and volumes declared on the Better Cotton Platform.',
    reqs: [
      { ...EXP(90), title: 'Chain of custody certificate', instruction: 'Keep chain of custody certification in date.', discipline: 'traceability', measure: 'evidence', owner_role: 'compliance', evidence: 'Certificate', site: true },
      { ...Q, title: 'Volume declarations', instruction: 'Declare Better Cotton volumes bought and sold on the platform.', discipline: 'traceability', measure: 'number', unit: 'kg', owner_role: 'merchandiser', evidence: 'Platform declarations' },
    ] },

  // ---------------------------------------------------------------- chemicals and wastewater
  { id: 'zdhc', group: 'chemicals', kind: 'industry', name: 'ZDHC wastewater and chemicals', framework: 'ZDHC MRSL and Wastewater Guidelines', status: 'MRSL 3.1 applies on the Gateway; Wastewater and Sludge Guidelines version 2 published October 2025.',
    summary: 'Wastewater testing and chemical inventories at every wet-processing site (dyeing, printing, washing), shared on the ZDHC Gateway.',
    reqs: [
      { trigger: 'schedule', frequency: 'semiannual', due_days: 30, title: 'Wastewater test (ClearStream)', instruction: 'Have wastewater and sludge sampled by an approved lab and the report published on the Gateway.', discipline: 'water', measure: 'evidence', owner_role: 'compliance', evidence: 'ClearStream report', suppliers: ['mill'] },
      { trigger: 'schedule', frequency: 'monthly', due_days: 15, title: 'Chemical inventory (InCheck)', instruction: 'Upload the chemical inventory and get the InCheck report with MRSL conformance.', discipline: 'chemicals', measure: 'evidence', owner_role: 'compliance', evidence: 'InCheck report', suppliers: ['mill'] },
    ] },

  // ---------------------------------------------------------------- markets
  { id: 'eu-market', destinations: EU_COUNTRIES, group: 'market', kind: 'regulation', name: 'Selling into the EU', framework: 'REACH, GPSR, Textile Regulation 1007/2011, Forced Labour Regulation 2024/3015', perOrder: true,
    status: 'SVHC Candidate List at 253 entries (February 2026). EU Forced Labour Regulation prohibition applies from 14 December 2027. Textile Digital Product Passport not yet required (delegated act expected 2027).',
    summary: 'For orders whose destination is in the EU or EEA: chemical restrictions tested, labels right, the SVHC list checked after each update, and forced-labour due diligence records ready.',
    reqs: [
      { ...PO('final', -7), title: 'REACH restriction tests', instruction: 'Accredited test report for the restricted substances that apply (azo dyes, nickel release, PAHs, chromium VI in leather and others).', discipline: 'chemicals', measure: 'evidence', owner_role: 'qc', evidence: 'Test report' },
      { ...PO('pp', 0), title: 'Fibre composition and care label check', instruction: 'Check the fibre names and percentages, care and origin labels against Regulation 1007/2011 and the customer artwork at PP.', discipline: 'governance', measure: 'yes_no', owner_role: 'qc', evidence: 'Approved label artwork, composition test' },
      { trigger: 'schedule', frequency: 'semiannual', due_days: 30, title: 'SVHC Candidate List check', instruction: 'Check materials against the latest SVHC Candidate List and tell customers about any article above 0.1%.', discipline: 'chemicals', measure: 'yes_no', owner_role: 'compliance', evidence: 'Supplier declarations' },
      { ...Y, title: 'Forced labour due diligence file', instruction: 'Keep supply chain maps, supplier declarations and audit evidence that show the goods are not made with forced labour.', discipline: 'labour', measure: 'evidence', owner_role: 'compliance', evidence: 'Due diligence file' },
    ] },
  { id: 'us-market', destinations: ['US'], group: 'market', kind: 'regulation', name: 'Selling into the US', framework: 'UFLPA, CPSIA, Prop 65, FTC labelling, CPSC eFiling', perOrder: true,
    status: 'UFLPA rebuttable presumption in force, entity list growing (July 2026). CPSC eFiling of certificates reported effective 8 July 2026. Tariffs change often: not covered.',
    summary: "For orders whose destination is the US: cotton and input traceability, children's product testing, Prop 65 and labelling, and the certificate data for each shipment.",
    reqs: [
      { ...PO('etd', -10), title: 'UFLPA traceability pack', instruction: 'Assemble cotton and yarn traceability back to the raw material, with transaction documents, for the shipment.', discipline: 'traceability', measure: 'evidence', owner_role: 'merchandiser', evidence: 'Traceability documents by tier' },
      { ...PO('final', -7), title: "Children's product test and certificate (CPSIA)", instruction: "For children's products: CPSC-accepted lab test and a Children's Product Certificate. Set the order filter to children's categories.", discipline: 'chemicals', measure: 'evidence', owner_role: 'qc', evidence: 'Test report and CPC' },
      { ...PO('etd', -3), title: 'Certificate data for CPSC eFiling', instruction: 'Send the importer the certificate data for the shipment (product, rules certified, place and date of manufacture, lab and test date).', discipline: 'governance', measure: 'evidence', owner_role: 'logistics', evidence: 'Certificate data' },
      { ...PO('pp', 0), title: 'Fibre content, care and origin labels (FTC)', instruction: 'Check fibre content, care, origin and manufacturer identification labels at PP.', discipline: 'governance', measure: 'yes_no', owner_role: 'qc', evidence: 'Approved label artwork' },
    ] },
  { id: 'eu-due-diligence', group: 'market', kind: 'regulation', name: 'Customer due diligence and sustainability data requests', framework: 'CSDDD, CSRD, LkSG and similar', status: 'CSDDD narrowed by Omnibus I (in force 18 March 2026): companies over 5,000 staff and EUR 1.5bn, applying from 26 July 2029. CSRD for over 1,000 staff and EUR 450m; suppliers below that may limit data to the voluntary standard. LkSG reporting being removed.',
    summary: "The yearly questionnaires and data requests large customers send under EU and German supply-chain law: risks, policies, grievance channels and environmental figures.",
    reqs: [
      { ...Y, title: 'Customer sustainability questionnaire', instruction: "Answer the customer's annual due diligence or sustainability questionnaire from the figures already on file.", discipline: 'governance', measure: 'evidence', owner_role: 'compliance', evidence: 'Completed questionnaire' },
      { ...Y, title: 'Human rights and environmental risk review', instruction: 'Review the main human rights and environmental risks in your own operations and supply chain, and what you do about them.', discipline: 'governance', measure: 'text', owner_role: 'manager', evidence: 'Risk review' },
    ] },
  { id: 'uk-msa', group: 'market', kind: 'regulation', name: 'UK Modern Slavery Act statement', framework: 'Modern Slavery Act 2015, section 54',
    summary: 'For organisations over the UK turnover threshold, or supplying one: the annual statement and the evidence behind it.',
    reqs: [{ ...Y, title: 'Modern slavery statement', instruction: 'Publish the annual statement signed by a director, or send the customer the information it needs for theirs.', discipline: 'labour', measure: 'evidence', owner_role: 'manager', evidence: 'Signed statement' }] },

  // ---------------------------------------------------------------- licences and permits
  { id: 'bd-licences', group: 'licence', kind: 'licence', name: 'Bangladesh factory licences and permits', framework: 'DIFE, Fire Service, Chief Inspector of Boilers, Department of Environment, City Corporation',
    status: 'Renewal periods vary by authority and category; set each expiry from the licence itself.',
    summary: "A Bangladesh garment factory's licences kept in date: trade, factory, fire, boiler, environmental clearance and the ETP records behind it.",
    reqs: [
      { ...EXP(60), title: 'Trade licence', instruction: 'Renew the trade licence with the City Corporation or Union Parishad.', discipline: 'governance', measure: 'evidence', owner_role: 'manager', evidence: 'Trade licence', site: true },
      { ...EXP(90), title: 'Factory licence (DIFE)', instruction: 'Renew the factory licence with DIFE.', discipline: 'governance', measure: 'evidence', owner_role: 'manager', evidence: 'Factory licence', site: true },
      { ...EXP(90), title: 'Fire licence', instruction: 'Renew the fire licence with the Fire Service and Civil Defence.', discipline: 'health_safety', measure: 'evidence', owner_role: 'compliance', evidence: 'Fire licence', site: true },
      { ...EXP(60), title: 'Boiler certificate', instruction: 'Book the annual boiler inspection and renew the certificate.', discipline: 'health_safety', measure: 'evidence', owner_role: 'compliance', evidence: 'Boiler certificate', site: true },
      { ...EXP(120), title: 'Environmental clearance certificate (DoE)', instruction: 'Renew the environmental clearance with the Department of Environment.', discipline: 'water', measure: 'evidence', owner_role: 'compliance', evidence: 'Environmental clearance certificate', site: true },
      { trigger: 'schedule', frequency: 'monthly', due_days: 10, title: 'ETP operation records', instruction: 'Keep the ETP running log, chemical use and flow readings for the month.', discipline: 'water', measure: 'evidence', owner_role: 'compliance', evidence: 'ETP log', site: true },
    ] },
  { id: 'site-licences', group: 'licence', kind: 'licence', name: 'Site licences and permits (any country)', framework: 'Local authorities',
    summary: 'The licences any production site holds, for Vietnam, China, India, Pakistan, Cambodia, Turkey and elsewhere. Rename them to match your local permits.',
    reqs: [
      { ...EXP(90), title: 'Business or factory licence', instruction: 'Renew the business or factory operating licence.', discipline: 'governance', measure: 'evidence', owner_role: 'manager', evidence: 'Licence', site: true },
      { ...EXP(90), title: 'Fire safety approval', instruction: 'Keep the fire safety approval or inspection certificate in date.', discipline: 'health_safety', measure: 'evidence', owner_role: 'compliance', evidence: 'Certificate', site: true },
      { ...EXP(120), title: 'Environmental or discharge permit', instruction: 'Keep the environmental permit or pollutant discharge permit in date.', discipline: 'water', measure: 'evidence', owner_role: 'compliance', evidence: 'Permit', site: true },
      { ...Q, title: 'Environmental monitoring report', instruction: 'Submit the periodic monitoring report the permit requires.', discipline: 'water', measure: 'evidence', owner_role: 'compliance', evidence: 'Monitoring report', site: true },
    ] },
];

export const TEMPLATE_GROUPS = ['finance', 'customer', 'audit', 'certification', 'chemicals', 'market', 'licence'] as const;
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) || null;

// Template text in the reader's language (en is the source above). Proper names and figures stay as written.
import de from './esg-templates-i18n/de.json';
import bn from './esg-templates-i18n/bn.json';
import zh from './esg-templates-i18n/zh.json';
import vi from './esg-templates-i18n/vi.json';
import es from './esg-templates-i18n/es.json';
type Overlay = Record<string, { name: string; summary: string; status?: string; reqs: { title: string; instruction: string; evidence?: string }[] }>;
const OVERLAYS: Record<string, Overlay> = { de, bn, zh, vi, es };

export function localizeTemplate(tpl: Template, locale: string): Template {
  const o = OVERLAYS[locale]?.[tpl.id];
  if (!o || o.reqs.length !== tpl.reqs.length) return tpl;
  return { ...tpl, name: o.name || tpl.name, summary: o.summary || tpl.summary, status: tpl.status ? o.status || tpl.status : undefined, reqs: tpl.reqs.map((r, i) => ({ ...r, title: o.reqs[i].title || r.title, instruction: o.reqs[i].instruction || r.instruction, evidence: r.evidence ? o.reqs[i].evidence || r.evidence : undefined })) };
}
