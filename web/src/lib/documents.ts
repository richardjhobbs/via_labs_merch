// Reading an uploaded commercial document (proforma invoice, invoice, purchase order): the shape we extract,
// how a file becomes model input, and how names are matched to records already on file.
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { DocumentInput } from './llm';

// Structured outputs allow at most 16 nullable (union) fields per schema, so the model returns plain strings
// (empty when the document does not show a value) and normalizeDoc() turns them into nulls and numbers.
const S = z.string();
const DocPartyRaw = z.object({ name: S, address: S, city: S, country: S, contact_name: S, email: S, phone: S });
export const DocSchema = z.object({
  type: z.enum(['proforma_invoice', 'invoice', 'purchase_order', 'other']),
  number: S, date: S, currency: S,
  seller: DocPartyRaw,
  buyer: DocPartyRaw,
  lines: z.array(z.object({ description: S, qty: S.describe('plain number or empty'), unit_price: S.describe('plain number or empty'), amount: S.describe('plain number or empty') })),
  freight: S, total: S, incoterm: S, payment_terms: S,
  lead_time_days: S.describe('plain number of days or empty'),
  hs_code: S,
  bank: z.object({ beneficiary: S, bank_name: S, bank_address: S, account_no: S, swift: S, bank_code: S, branch_code: S, currency: S }).describe('all empty if the document shows no payment details'),
});
type Raw = z.infer<typeof DocSchema>;
type Party = { name: string | null; address: string | null; city: string | null; country: string | null; contact_name: string | null; email: string | null; phone: string | null };
export type ReadDoc = {
  type: Raw['type']; number: string | null; date: string | null; currency: string | null; seller: Party; buyer: Party;
  lines: { description: string; qty: number | null; unit_price: number | null; amount: number | null }[];
  freight: number | null; total: number | null; incoterm: string | null; payment_terms: string | null; lead_time_days: number | null; hs_code: string | null;
  bank: { beneficiary: string | null; bank_name: string | null; bank_address: string | null; account_no: string | null; swift: string | null; bank_code: string | null; branch_code: string | null; currency: string | null } | null;
};
const str = (v: string) => (v && v.trim() ? v.trim() : null);
const num = (v: string) => { const n = Number(String(v || '').replace(/[, ]/g, '')); return v && v.trim() && isFinite(n) ? n : null; };
const party = (p: Raw['seller']): Party => ({ name: str(p.name), address: str(p.address), city: str(p.city), country: str(p.country), contact_name: str(p.contact_name), email: str(p.email), phone: str(p.phone) });
export function normalizeDoc(r: Raw): ReadDoc {
  const b = r.bank;
  return {
    type: r.type, number: str(r.number), date: str(r.date), currency: str(r.currency), seller: party(r.seller), buyer: party(r.buyer),
    lines: r.lines.map((l) => ({ description: l.description, qty: num(l.qty), unit_price: num(l.unit_price), amount: num(l.amount) })),
    freight: num(r.freight), total: num(r.total), incoterm: str(r.incoterm), payment_terms: str(r.payment_terms), lead_time_days: num(r.lead_time_days), hs_code: str(r.hs_code),
    bank: str(b.account_no) ? { beneficiary: str(b.beneficiary), bank_name: str(b.bank_name), bank_address: str(b.bank_address), account_no: str(b.account_no), swift: str(b.swift), bank_code: str(b.bank_code), branch_code: str(b.branch_code), currency: str(b.currency) } : null,
  };
}
export type DocDraft = { file: string; doc: ReadDoc; etd: string; buyerMatch: string | null; sellerMatch: string | null; buyerIsUs: boolean; sellerIsUs: boolean; sellerConfirmed: string[] };

// Spreadsheets become text for the model; PDFs and photos go to it as they are. Null means an unsupported file.
export async function documentContent(file: File): Promise<DocumentInput | null> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(ext)) {
    try {
      const wb = XLSX.read(bytes, { type: 'buffer', cellDates: false });
      const text = wb.SheetNames.map((n) => `Sheet ${n}:\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join('\n\n').replace(/,{2,}/g, ',').slice(0, 30_000);
      return text.trim() ? text : null;
    } catch { return null; }
  }
  const data = bytes.toString('base64');
  if (ext === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }, { type: 'text', text: 'Read this document.' }];
  const image = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] as 'image/png' | 'image/jpeg' | 'image/webp' | undefined;
  if (image) return [{ type: 'image', source: { type: 'base64', media_type: image, data } }, { type: 'text', text: 'Read this document.' }];
  return null;
}

// "SHAOXING TIANXIU UMBRELLA CO., LTD." and "Shaoxing Tianxiu Umbrella" are one company.
const SUFFIX = /\b(co|company|corp|corporation|inc|incorporated|ltd|limited|llc|llp|plc|pte|pvt|private|gmbh|ag|srl|sa|sl|jsc|bv|nv)\b/g;
const key = (s: string) => s.toLowerCase().replace(/[.,&()'"/-]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
export const sameCompany = (a: string, b: string) => { const x = key(a); return !!x && x === key(b); };
export const findParty = (list: { id: string; name: string }[], name: string | null) => (name && list.find((p) => sameCompany(p.name, name))?.id) || null;
