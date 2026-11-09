// Styles: the development file (migration 0016). One row per style per season per customer; tech packs,
// briefs and other records hang off it, and after handover the orders point back to it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer, supabaseAdmin } from './supabase/server';
import { styleRecords, techPackVersions, type RecordRow } from './records';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const STYLE_STATUSES = ['brief', 'developing', 'sampling', 'costing', 'adopted', 'handed_over', 'dropped'] as const;
export type StyleStatus = (typeof STYLE_STATUSES)[number];
export const STATUS_PILL: Record<StyleStatus, string> = { brief: '', developing: 'agent', sampling: 'warn', costing: 'warn', adopted: 'ok', handed_over: 'ok', dropped: 'crit' };

export type StyleRow = {
  id: string; code: string; name: string | null; season: string | null; category: string | null; status: StyleStatus; description: string | null;
  target_price: number | null; currency: string; target_delivery: string | null; plm_ref: string | null; owner_user_id: string | null; created_at: string; updated_at: string;
  customer: { id: string; name: string; short: string | null; lang: string } | null;
};
const SELECT = 'id, code, name, season, category, status, description, target_price, currency, target_delivery, plm_ref, owner_user_id, created_at, updated_at, customer:parties!styles_customer_id_fkey(id, name, short, lang)';

export async function listStyles(tenantId: string, opts: { customers?: string[] | null; status?: string; season?: string } = {}, client?: Client): Promise<StyleRow[]> {
  const sb = client || await supabaseServer();
  let q = sb.from('styles').select(SELECT).eq('tenant_id', tenantId).order('updated_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.season) q = q.eq('season', opts.season);
  const { data } = await q;
  return ((data || []) as unknown as StyleRow[]).filter((s) => !opts.customers || (s.customer && opts.customers.includes(s.customer.id)));
}

export async function getStyle(tenantId: string, id: string, client?: Client): Promise<StyleRow | null> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('styles').select(SELECT).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  return (data as unknown as StyleRow) || null;
}

// A style by its code as written (the customer's number), newest season first.
export async function styleByCode(tenantId: string, code: string, client?: Client): Promise<StyleRow | null> {
  const sb = client || await supabaseServer();
  const { data } = await sb.from('styles').select(SELECT).eq('tenant_id', tenantId).ilike('code', code.trim()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as unknown as StyleRow) || null;
}

// Latest confirmed tech pack and the count of records awaiting a check, per style, for lists.
export async function styleSignals(tenantId: string, styleIds: string[], client?: Client) {
  const sb = client || await supabaseServer();
  if (!styleIds.length) return new Map<string, { techPack: RecordRow | null; pending: number; records: number }>();
  const { data } = await sb.from('records').select('id, style_id, kind, version, confirmed_at, created_at, filename, title').eq('tenant_id', tenantId).in('style_id', styleIds).order('created_at', { ascending: false });
  const out = new Map<string, { techPack: RecordRow | null; pending: number; records: number }>();
  for (const r of (data || []) as unknown as (RecordRow & { style_id: string })[]) {
    const s = out.get(r.style_id) || { techPack: null, pending: 0, records: 0 };
    s.records++; if (!r.confirmed_at) s.pending++;
    if (r.kind === 'tech_pack' && r.confirmed_at && (!s.techPack || r.version > s.techPack.version)) s.techPack = r;
    out.set(r.style_id, s);
  }
  return out;
}

// Every conversation on a style with its messages: the style file, for the screen and the agent.
export async function styleFile(tenantId: string, styleId: string) {
  const sb = supabaseAdmin();
  const [{ data: threads }, { data: msgs }] = await Promise.all([
    sb.from('threads').select('id, subject, kind, party_id, summary, last_message_at, parties(name, kind, lang)').eq('tenant_id', tenantId).eq('style_id', styleId).order('last_message_at', { ascending: false }),
    sb.from('messages').select('id, thread_id, direction, sender_name, lang, text, text_en, stream, received_at, sent_at, contacts(role)').eq('tenant_id', tenantId).eq('style_id', styleId).order('received_at'),
  ]);
  return (threads || []).map((th) => ({ id: th.id, subject: th.subject, channel: th.kind, party: th.parties as unknown as { name: string; kind: string; lang: string } | null, summary: th.summary,
    messages: (msgs || []).filter((m) => m.thread_id === th.id).map((m) => ({ at: m.received_at.slice(0, 16).replace('T', ' '), from: m.direction === 'in' ? `${m.sender_name || ''}${(m.contacts as unknown as { role: string } | null)?.role ? ` (${(m.contacts as unknown as { role: string }).role})` : ''}` : `us (${m.sender_name || 'VIA'})`, direction: m.direction, stream: m.stream, text: (m.text_en || m.text).slice(0, 600) })) }));
}

// For the agent: the style, its confirmed tech pack (latest), the other records and the file.
export async function styleBrief(tenantId: string, id: string) {
  const sb = supabaseAdmin();
  const s = await getStyle(tenantId, id, sb);
  if (!s) return null;
  const records = await styleRecords(sb, tenantId, id);
  const tps = techPackVersions(records);
  return { style: s, techPack: tps[0] || null, techPackVersions: tps.map((r) => ({ id: r.id, version: r.version, label: r.parsed?.version_label, filename: r.filename, confirmed_at: r.confirmed_at })), records: records.filter((r) => r.kind !== 'tech_pack' || !r.confirmed_at).map((r) => ({ id: r.id, kind: r.kind, title: r.title || r.filename, source: r.source, confirmed: !!r.confirmed_at, created_at: r.created_at })) };
}
