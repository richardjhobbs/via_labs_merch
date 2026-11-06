// Bank accounts of customers and suppliers (merch.party_bank_accounts, migration 0007). Every account starts
// pending; see the migration for the rules. Ledger rows and table pills only ever carry the masked number.
import { z } from 'zod';

export const BankFields = z.object({ beneficiary: z.string().trim().max(160).optional(), bank_name: z.string().trim().max(160).optional(), bank_address: z.string().trim().max(240).optional(), account_no: z.string().trim().min(4).max(40), swift: z.string().trim().max(60).optional(), bank_code: z.string().trim().max(20).optional(), branch_code: z.string().trim().max(20).optional(), currency: z.string().trim().max(3).optional() });
export type BankInput = z.infer<typeof BankFields>;
export type BankRow = BankInput & { id: string; party_id: string; status: string; source: string; source_file: string | null; added_by_name: string | null; created_at: string; decided_by_name: string | null; decided_at: string | null; confirm_method: string | null; confirm_note: string | null };

export const BANK_COLUMNS = 'id, party_id, beneficiary, bank_name, bank_address, account_no, swift, bank_code, branch_code, currency, status, source, source_file, added_by_name, created_at, decided_by_name, decided_at, confirm_method, confirm_note';
export const CONFIRM_METHODS = ['known_phone', 'in_person', 'known_contact', 'other'] as const;
export const canAddBank = (role: string) => ['owner', 'manager', 'merchandiser'].includes(role);
export const canDecideBank = (role: string) => ['owner', 'manager'].includes(role);

const norm = (s: string | null | undefined) => (s || '').replace(/[\s-]/g, '').toUpperCase();
export const sameAccount = (a: Pick<BankInput, 'account_no'>, b: Pick<BankInput, 'account_no'>) => norm(a.account_no) === norm(b.account_no);
export const maskAccount = (no: string) => `••••${norm(no).slice(-4)}`;
export const bankFrom = (form: FormData, prefix = '') => BankFields.safeParse(Object.fromEntries(Object.keys(BankFields.shape).map((k) => [k, form.get(prefix + k) || undefined])));
