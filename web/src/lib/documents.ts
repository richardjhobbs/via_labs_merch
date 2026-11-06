// Reading an uploaded commercial document (proforma invoice, invoice, purchase order): the shape we extract,
// how a file becomes model input, and how names are matched to records already on file.
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { DocumentInput } from './llm';

const DocParty = z.object({ name: z.string().nullable(), address: z.string().nullable(), city: z.string().nullable(), country: z.string().nullable(), contact_name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() });
export const DocSchema = z.object({
  type: z.enum(['proforma_invoice', 'invoice', 'purchase_order', 'other']),
  number: z.string().nullable(),
  date: z.string().nullable(),
  currency: z.string().nullable(),
  seller: DocParty,
  buyer: DocParty,
  lines: z.array(z.object({ description: z.string(), qty: z.number().nullable(), unit_price: z.number().nullable(), amount: z.number().nullable() })),
  freight: z.number().nullable(),
  total: z.number().nullable(),
  incoterm: z.string().nullable(),
  payment_terms: z.string().nullable(),
  lead_time_days: z.number().nullable(),
  hs_code: z.string().nullable(),
});
export type ReadDoc = z.infer<typeof DocSchema>;
export type DocDraft = { file: string; doc: ReadDoc; etd: string; buyerMatch: string | null; sellerMatch: string | null; buyerIsUs: boolean; sellerIsUs: boolean };

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
