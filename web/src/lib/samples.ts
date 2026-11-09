// Sample rounds, materials and the development schedule (migration 0019). Reads for screens and the agent;
// writes live in app/[tenant]/styles/[id]/sample-actions.ts and material-actions.ts after a role check.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';
import { num, type TechPack } from './records';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SAMPLE_TYPES = ['proto', 'fit', 'size_set', 'sms', 'pp', 'top', 'shipment', 'labdip', 'strikeoff', 'handloom', 'trim_card', 'wash', 'other'] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];
export const DECISIONS = ['approved', 'approved_with_comments', 'rejected', 'resubmit'] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_SOURCES = ['workspace', 'customer_email', 'customer_plm', 'customer_meeting', 'other'] as const;
export const MATERIAL_STATUSES = ['to_source', 'swatch_requested', 'swatch_received', 'labdip_pending', 'approved', 'rejected', 'not_needed'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];
export const DECISION_PILL: Record<Decision, string> = { approved: 'ok', approved_with_comments: 'ok', rejected: 'crit', resubmit: 'warn' };
export const MATERIAL_PILL: Record<MaterialStatus, string> = { to_source: '', swatch_requested: 'warn', swatch_received: 'agent', labdip_pending: 'warn', approved: 'ok', rejected: 'crit', not_needed: '' };

export type SampleRow = {
  id: string; style_id: string | null; order_id: string | null; type: SampleType; round: number; size: string | null; colourway: string | null;
  maker_party_id: string | null; against_record_id: string | null; requested_at: string | null; due_at: string | null; sent_at: string | null; courier: string | null; awb: string | null;
  received_at: string | null; reviewed_at: string | null; decision: Decision | null; decided_by_name: string | null; decision_source: string | null; comments: string | null; note: string | null; created_at: string; updated_at: string;
  maker: { id: string; name: string; short: string | null; lang: string } | null; style: { id: string; code: string; name: string | null; customer_id: string | null } | null; order: { po: string } | null;
};
const SAMPLE_SELECT = 'id, style_id, order_id, type, round, size, colourway, maker_party_id, against_record_id, requested_at, due_at, sent_at, courier, awb, received_at, reviewed_at, decision, decided_by_name, decision_source, comments, note, created_at, updated_at, maker:parties!samples_maker_party_id_fkey(id, name, short, lang), style:styles!samples_style_id_fkey(id, code, name, customer_id), order:orders!samples_order_id_fkey(po)';

// The state of a round for lists: awaiting a decision, in transit, overdue, planned, decided.
export type SampleState = 'planned' | 'overdue' | 'in_transit' | 'awaiting' | 'approved' | 'rejected' | 'resubmit';
export function sampleState(s: SampleRow, todayIso = new Date().toISOString().slice(0, 10)): SampleState {
  if (s.decision === 'approved' || s.decision === 'approved_with_comments') return 'approved';
  if (s.decision === 'rejected') return 'rejected';
  if (s.decision === 'resubmit') return 'resubmit';
  if (s.received_at) return 'awaiting';
  if (s.sent_at) return 'in_transit';
  if (s.due_at && s.due_at < todayIso) return 'overdue';
  return 'planned';
}
export const STATE_PILL: Record<SampleState, string> = { planned: '', overdue: 'crit', in_transit: 'agent', awaiting: 'warn', approved: 'ok', rejected: 'crit', resubmit: 'warn' };

export async function listSamples(tenantId: string, opts: { styleId?: string; orderId?: string; open?: boolean } = {}, client?: Client): Promise<SampleRow[]> {
  const sb = client || await supabaseServer();
  let q = sb.from('samples').select(SAMPLE_SELECT).eq('tenant_id', tenantId).order('created_at', { ascending: false });
  if (opts.styleId) q = q.eq('style_id', opts.styleId);
  if (opts.orderId) q = q.eq('order_id', opts.orderId);
  if (opts.open) q = q.is('decision', null);
  const { data } = await q;
  return (data || []) as unknown as SampleRow[];
}

export async function getSample(tenantId: string, id: string, client?: Client): Promise<SampleRow | null> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('samples').select(SAMPLE_SELECT).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  return (data as unknown as SampleRow) || null;
}

export type MeasurementRow = { id: string; pom_code: string | null; pom_name: string; size: string | null; spec: number | null; tol_minus: number | null; tol_plus: number | null; measured: number | null; unit: string | null; pass: boolean | null; comment: string | null };
export async function sampleMeasurements(sb: Client, sampleId: string): Promise<MeasurementRow[]> {
  const { data } = await sb.from('measurements').select('id, pom_code, pom_name, size, spec, tol_minus, tol_plus, measured, unit, pass, comment').eq('sample_id', sampleId).order('created_at');
  return (data || []) as unknown as MeasurementRow[];
}

// The spec rows for a review form: the tech pack's points of measure for one size (base size by default).
export function specRows(tp: TechPack | null, size: string | null) {
  if (!tp) return [] as { pom_code: string | null; pom_name: string; spec: number | null; tol_minus: number | null; tol_plus: number | null; unit: string | null }[];
  return tp.poms.map((p) => {
    let spec = p.base_value;
    if (size && p.base_size && size.toLowerCase() !== p.base_size.toLowerCase() && p.by_size) {
      const m = p.by_size.split(/[,;]\s*/).map((x) => x.split(':').map((y) => y.trim())).find((x) => x[0]?.toLowerCase() === size.toLowerCase());
      if (m && m[1]) spec = num(m[1]);
    }
    return { pom_code: p.code, pom_name: p.name, spec, tol_minus: p.tol_minus, tol_plus: p.tol_plus, unit: p.unit };
  });
}

export type MaterialRow = { id: string; style_id: string; kind: string; item: string; description: string | null; composition: string | null; construction: string | null; weight: string | null; colour: string | null; placement: string | null; qty: string | null; supplier_id: string | null; supplier_name: string | null; status: MaterialStatus; moq: string | null; lead_days: number | null; price: number | null; currency: string | null; note: string | null; updated_at: string; supplier: { id: string; name: string; lang: string } | null };
export async function listMaterials(tenantId: string, styleId: string, client?: Client): Promise<MaterialRow[]> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('materials').select('id, style_id, kind, item, description, composition, construction, weight, colour, placement, qty, supplier_id, supplier_name, status, moq, lead_days, price, currency, note, updated_at, supplier:parties!materials_supplier_id_fkey(id, name, lang)').eq('tenant_id', tenantId).eq('style_id', styleId).order('kind').order('item');
  return (data || []) as unknown as MaterialRow[];
}

export type DevMilestoneRow = { id: string; key: string; label: string | null; owner_kind: string | null; owner_party_id: string | null; plan_date: string; expected_date: string | null; actual_date: string | null; sample_id: string | null; note: string | null };
export async function listDevMilestones(tenantId: string, styleId: string, client?: Client): Promise<DevMilestoneRow[]> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('dev_milestones').select('id, key, label, owner_kind, owner_party_id, plan_date, expected_date, actual_date, sample_id, note').eq('tenant_id', tenantId).eq('style_id', styleId).order('plan_date');
  return (data || []) as unknown as DevMilestoneRow[];
}
