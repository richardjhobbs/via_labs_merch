// Compiling a compliance report for the issuer (the bank, fund, customer or certifier): a snapshot of every
// task in the period with its latest figure and evidence, and a covering summary the agent drafts and a
// person edits. Approval by an owner or manager fixes it (merch.esg_report_guard).
import type { SupabaseClient as SC } from '@supabase/supabase-js';
type SupabaseClient = SC<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import { anthropic, costOf, hasLlm, MODEL, recordUsage } from '@/lib/llm';

export type ReportRow = {
  task_id: string; code: string | null; title: string; discipline: string; period: string; period_end: string; due: string;
  measure: string; unit: string | null; target: number | null; target_note: string | null; baseline: number | null;
  value_num: number | null; value_text: string | null; note: string | null; evidence: { name: string; path: string }[];
  status: string; reviewed_by: string | null; version: number | null; party?: string | null; po?: string | null; valid_until?: string | null;
};

export async function gatherRows(sb: SupabaseClient, tenantId: string, programmeId: string, from: string, to: string): Promise<ReportRow[]> {
  const { data } = await sb.from('esg_tasks')
    .select('id, period_label, period_end, due_date, status, reviewed_by_name, parties(name), orders(po), esg_requirements!inner(code, title, discipline, measure, unit, target, target_note, baseline), sub:esg_submissions!esg_tasks_latest_fk(version, value_num, value_text, note, evidence, valid_until)')
    .eq('tenant_id', tenantId).eq('programme_id', programmeId).gte('period_end', from).lte('period_end', to).order('period_end');
  return (data || []).map((t) => {
    const r = t.esg_requirements as unknown as { code: string | null; title: string; discipline: string; measure: string; unit: string | null; target: number | null; target_note: string | null; baseline: number | null };
    const s = t.sub as unknown as { version: number; value_num: number | null; value_text: string | null; note: string | null; evidence: { name: string; path: string }[]; valid_until: string | null } | null;
    return { task_id: t.id, code: r.code, title: r.title, discipline: r.discipline, period: t.period_label, period_end: t.period_end, due: t.due_date, measure: r.measure, unit: r.unit, target: r.target, target_note: r.target_note, baseline: r.baseline, value_num: s?.value_num ?? null, value_text: s?.value_text ?? null, note: s?.note ?? null, evidence: (s?.evidence || []).map((e) => ({ name: e.name, path: e.path })), status: t.status, reviewed_by: t.reviewed_by_name, version: s?.version ?? null, party: (t.parties as unknown as { name: string } | null)?.name || null, po: (t.orders as unknown as { po: string } | null)?.po || null, valid_until: s?.valid_until ?? null };
  }).sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title, 'en', { numeric: true }) || a.period_end.localeCompare(b.period_end));
}

export const valueOf = (r: Pick<ReportRow, 'measure' | 'value_num' | 'value_text' | 'unit'>) =>
  r.value_num != null ? `${r.value_num.toLocaleString('en-GB', { maximumFractionDigits: 4 })}${r.unit ? ` ${r.unit}` : ''}` : r.value_text || '';

function plainSummary(programme: string, label: string, rows: ReportRow[]) {
  const accepted = rows.filter((r) => r.status === 'accepted').length;
  const open = rows.filter((r) => !['accepted', 'waived'].includes(r.status));
  return `${programme}: report for ${label}.\n\n${accepted} of ${rows.length} items are reported and checked.${open.length ? ` Still open: ${open.map((r) => `${r.code ? `${r.code} ` : ''}${r.title}`).join('; ')}.` : ''}\n\nThe table lists each requirement with the reported figure, the target and the evidence held.`;
}

const SUMMARY_SYSTEM = `You write the covering summary of an ESG and compliance report that a garment, footwear or accessories manufacturer sends to the bank, development fund, customer or certifier that set the requirements.
Use only the rows given. Never invent figures, causes or plans. State plainly which items are reported and checked, how figures compare with target and baseline where both exist, and which items are open, late or returned, with what the company will do only if a note says so.
Write in formal British English, in short paragraphs, no headings, no markdown, no bullet symbols, at most 220 words. Do not use em dashes or en dashes. Sign off with nothing; a person adds their name.`;

export async function draftSummary(tenantId: string, programme: { name: string; issuer: string | null; framework: string | null; purpose: string | null }, label: string, rows: ReportRow[]) {
  if (!hasLlm() || !rows.length) return plainSummary(programme.name, label, rows);
  const table = rows.map((r) => `${r.code || '-'} | ${r.title}${r.party ? ` (${r.party})` : ''}${r.po ? ` PO ${r.po}` : ''} | ${r.discipline} | ${r.period} | target ${r.target ?? r.target_note ?? '-'}${r.unit ? ` ${r.unit}` : ''} | baseline ${r.baseline ?? '-'} | value ${valueOf(r) || '-'} | status ${r.status} | evidence ${r.evidence.length} | note ${r.note || '-'}`).join('\n');
  try {
    const res = await anthropic().messages.create({ model: MODEL, max_tokens: 1200, output_config: { effort: 'low' }, system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: `Programme: ${programme.name}${programme.issuer ? `, for ${programme.issuer}` : ''}${programme.framework ? `; framework ${programme.framework}` : ''}${programme.purpose ? `; financing ${programme.purpose}` : ''}.\nPeriod: ${label}.\nRows (code | requirement | discipline | period | target | baseline | value | status | evidence files | note):\n${table}` }] });
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim().replace(/[–—]/g, ',');
    await recordUsage(tenantId, { runs: 1, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, cost: costOf(MODEL, res.usage.input_tokens, res.usage.output_tokens) });
    return text || plainSummary(programme.name, label, rows);
  } catch { return plainSummary(programme.name, label, rows); }
}
