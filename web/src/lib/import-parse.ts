// Reading order spreadsheets and CSVs as people actually write them. Pure, tested in import-parse.test.ts.
import * as XLSX from 'xlsx';

// Column names vary between offices and systems ("PO No.", "PO#", "Purchase order", "Ship date"), so headers are
// compared without case, spaces or punctuation, against a list of the names people use.
export const norm = (k: string) => k.replace(/^\ufeff/, '').toLowerCase().replace(/#/g, 'no').replace(/[^a-z0-9]/g, '');
export const H = (r: Record<string, unknown>, ...names: string[]) => { const want = names.map(norm); for (const w of want) { const k = Object.keys(r).find((x) => norm(x) === w); if (k !== undefined && r[k] !== '' && r[k] != null) return r[k]; } return null; };
export const COLS = {
  po: ['PO', 'PO number', 'PO no', 'PO#', 'PO num', 'Purchase order', 'Purchase order number', 'Order', 'Order no', 'Order number'],
  etd: ['ETD', 'ETD date', 'Ship date', 'Shipment date', 'Shipping date', 'Ex-factory', 'Ex factory date', 'X-factory', 'Delivery date'],
  customer: ['Customer', 'Brand', 'Buyer', 'Client'], factory: ['Factory', 'Supplier', 'Vendor', 'Manufacturer', 'Maker'],
  style: ['Style', 'Style no', 'Style number', 'Style code', 'Article', 'Item'], description: ['Description', 'Desc', 'Style description', 'Style name', 'Product'],
  qty: ['Qty', 'Quantity', 'Units', 'Order qty', 'Total qty', 'Pcs', 'Pieces'], fob: ['FOB', 'FOB price', 'FOB USD', 'Price', 'Unit price', 'Cost'],
};
// "1,200", "$4.50", "4,50" (decimal comma), "1.200,50": numbers as people type them in different countries
export const num = (v: unknown): number | null => {
  if (v == null || v === '') return null; if (typeof v === 'number') return v;
  let s = String(v).replace(/[^0-9.,-]/g, ''); if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) => { if (y < 100) y += 2000; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null; };
// Dates as spreadsheets and people write them: 2026-12-20, 20/12/2026, 12/20/2026 (month first when the day is over 12),
// 20.12.2026, 20-Dec-26, 20 Dec 2026, Dec 20 2026, or a spreadsheet date number. An impossible date is never accepted.
export const toIso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? iso(d.y, d.m, d.d) : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); if (m) { const a = +m[1], b = +m[2]; return a > 12 || b <= 12 ? iso(+m[3], b, a) : iso(+m[3], a, b); }
  m = s.match(/^(\d{1,2})[-\s]([a-z]{3})[a-z]*[-\s,]+(\d{2,4})$/i); if (m && MON.includes(m[2].toLowerCase())) return iso(+m[3], MON.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*[-\s](\d{1,2})[,\s]+(\d{2,4})$/i); if (m && MON.includes(m[1].toLowerCase())) return iso(+m[3], MON.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
};
