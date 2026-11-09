// Delogue PLM (Nexos API), read only: styles, tech pack files and sample requests of the connected organisation
// come into VIA as styles, records (read in the background, confirmed by a person) and sample rounds.
// Auth is a personal API key made in Delogue under Personal settings > Integrations, sent as
// X-Auth-Token: Bearer <key>; it carries the permissions of the person who made it. Responses are an
// envelope { status, data, pagination { hasMore, cursor } }. No rate limit is enforced today; this sync runs at
// most hourly per connection and stops at the drain's deadline. Nothing is written back to Delogue.
// Docs: https://integration.delogue.com (summary of 9 Nov 2026 in docs/development-merchandising.md).
import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from '@/lib/crypto';
import { DEV_BUCKET } from '@/lib/records';
import type { Channel } from './mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const DELOGUE_API = 'https://service.my.delogue.com/api';
type Envelope<T> = { status: string; code?: string; data: T; pagination?: { hasMore?: boolean; cursor?: string } };

async function api<T>(key: string, path: string): Promise<Envelope<T>> {
  const r = await fetch(`${DELOGUE_API}${path}`, { headers: { 'X-Auth-Token': `Bearer ${key}`, accept: 'application/json' }, cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as Envelope<T> & { error?: { details?: unknown[] } };
  if (r.status === 401) throw new Error('Delogue rejected the API key (401).');
  if (r.status === 403) throw new Error('The Delogue key has no permission for this (403).');
  if (!r.ok || j.status === 'error') throw new Error(`Delogue ${path}: ${r.status} ${j.code || ''}`.trim());
  return j;
}

export type DelogueStyle = { id: number; name: string; customId?: string | null; state?: string; season?: { id: number; name: string; project?: string | null } | null; brand?: { id: number; name: string } | null; supplier?: { id?: number; name?: string } | null; lastUpdated?: string; categories?: { name: string }[] };
type DelogueFile = { id: number; name: string; note?: string | null; state?: string; url?: string | null; folderType?: string; folderId?: number; createdOn?: string };
type DelogueSample = { id: number; styleId: number; status?: string; deadline?: string | null; etd?: string | null; sendDate?: string | null; lastStateChange?: string | null; note?: string | null; trackingNumber?: string | null; sampleType?: { id: number; name: string } | null; properties?: { is_archived?: boolean } };

// Does the key work, and whose styles does it see.
export async function checkKey(key: string) {
  const r = await api<DelogueStyle[]>(key, '/styles?pageSize=1&pageNumber=1');
  const first = r.data?.[0];
  return { ok: true, brand: first?.brand?.name || null, sample: first ? `${first.customId || first.id} ${first.name}` : null };
}

const SAMPLE_TYPE: [RegExp, string][] = [[/proto|first|development/i, 'proto'], [/size.?set|grad/i, 'size_set'], [/sales|sms|showroom/i, 'sms'], [/\bpp\b|pre.?prod/i, 'pp'], [/\btop\b|top of/i, 'top'], [/ship|final/i, 'shipment'], [/lab.?dip|colou?r/i, 'labdip'], [/strike/i, 'strikeoff'], [/hand ?loom|knit ?down/i, 'handloom'], [/trim/i, 'trim_card'], [/wash/i, 'wash'], [/fit/i, 'fit']];
export const sampleTypeOf = (name: string | null | undefined) => SAMPLE_TYPE.find(([re]) => re.test(name || ''))?.[1] || 'other';
const d10 = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const READABLE = /\.(pdf|xlsx?|xlsm|csv|png|jpe?g|webp)$/i;

// One sync pass for one connection: styles changed since the last pass (all on the first), their files and sample requests.
export async function syncDelogue(sb: Client, ch: Channel, deadline: number) {
  const cfg = (ch.config || {}) as unknown as { connector: 'delogue'; customer_id?: string | null; connected_by?: string; last_run?: string | null; page?: number };
  const key = open<{ token: string }>(ch.auth_enc)?.token;
  const out = { styles: 0, files: 0, samples: 0, pages: 0, complete: true };
  if (!key) { await sb.from('channels').update({ status: 'reauth', error: 'no key' }).eq('id', ch.id); return out; }
  const since = cfg.last_run ? Date.parse(cfg.last_run) : 0;
  const startedAt = new Date().toISOString();
  const { data: parties } = await sb.from('parties').select('id, name, short').eq('tenant_id', ch.tenant_id).is('archived_at', null);
  const partyByName = (n: string | null | undefined) => { if (!n) return null; const q = n.toLowerCase(); return (parties || []).find((p) => p.name.toLowerCase() === q || (p.short || '').toLowerCase() === q)?.id || (parties || []).find((p) => q.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(q))?.id || null; };
  try {
    let page = cfg.page || 1;
    for (;;) {
      if (Date.now() > deadline - 5000) { out.complete = false; break; }
      const r = await api<DelogueStyle[]>(key, `/styles?pageSize=50&pageNumber=${page}`);
      out.pages++;
      for (const s of r.data || []) {
        if (Date.now() > deadline - 5000) { out.complete = false; break; }
        if (since && s.lastUpdated && Date.parse(s.lastUpdated) < since) continue;
        if (s.state && ['deleted', 'cancelled'].includes(s.state)) continue;
        const code = (s.customId || String(s.id)).trim().slice(0, 60);
        const plmRef = `delogue:style:${s.id}`;
        const { data: existing } = await sb.from('styles').select('id, status').eq('tenant_id', ch.tenant_id).eq('plm_ref', plmRef).maybeSingle();
        const base = { name: s.name?.slice(0, 200) || null, season: s.season?.name?.slice(0, 40) || null, category: s.categories?.[0]?.name?.slice(0, 80) || null, plm_ref: plmRef, meta: { delogue: { id: s.id, state: s.state, brand: s.brand?.name, supplier: s.supplier?.name, lastUpdated: s.lastUpdated } } };
        let styleId = existing?.id as string | undefined;
        if (existing) await sb.from('styles').update(base).eq('id', existing.id);
        else {
          const { data: ins, error } = await sb.from('styles').insert({ tenant_id: ch.tenant_id, customer_id: cfg.customer_id || null, code, status: s.state === 'delivered' ? 'handed_over' : 'developing', currency: 'USD', ...base }).select('id').single();
          if (error) { console.error('[delogue] style', code, error.message); continue; }
          styleId = ins.id; out.styles++;
          await sb.rpc('ledger_append', { p_tenant: ch.tenant_id, p_channel: 'PLM', p_actor: 'Delogue PLM', p_actor_user: null, p_counterparty: s.brand?.name || null, p_stream: 'Design briefs', p_order: null, p_what: `Style ${code}${s.name ? ` ${s.name}` : ''}${s.season?.name ? ` (${s.season.name})` : ''} synced from Delogue`, p_gate: 'AUTO · sync', p_gated: false, p_ref: { delogue_id: s.id }, p_track: 'development', p_style: ins.id });
        }
        if (!styleId) continue;
        // files: anything readable with a download URL that VIA has not got yet
        const files = await api<{ files?: DelogueFile[] }[] | DelogueFile[]>(key, `/styles/${s.id}/files`).catch(() => null);
        const flat: DelogueFile[] = Array.isArray(files?.data) ? (files!.data as unknown[]).flatMap((f) => (f && typeof f === 'object' && 'files' in (f as object) ? ((f as { files?: DelogueFile[] }).files || []) : [f as DelogueFile])) : [];
        for (const f of flat) {
          if (Date.now() > deadline - 5000) { out.complete = false; break; }
          if (!f?.url || !READABLE.test(f.name || '') || (f.state && f.state !== 'active')) continue;
          const ref = `delogue:file:${f.id}`;
          const { data: have } = await sb.from('records').select('id').eq('tenant_id', ch.tenant_id).eq('source_ref', ref).limit(1).maybeSingle();
          if (have) continue;
          try {
            const res = await fetch(f.url);
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length || buf.length > 30 * 1024 * 1024) continue;
            const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
            const path = `${ch.tenant_id}/${styleId}/delogue-${f.id}.${ext}`;
            const up = await sb.storage.from(DEV_BUCKET).upload(path, buf, { contentType: res.headers.get('content-type') || 'application/octet-stream', upsert: true });
            if (up.error) continue;
            const kind = /\.(png|jpe?g|webp)$/i.test(f.name) ? 'photo' : /bom/i.test(f.name) ? 'bom' : /spec|measure/i.test(f.name) ? 'spec' : 'tech_pack';
            const { data: rec } = await sb.from('records').insert({ tenant_id: ch.tenant_id, track: 'development', kind, style_id: styleId, version: 0, title: f.name, source: 'plm', source_ref: ref, storage_path: path, filename: f.name.slice(0, 200), mime: res.headers.get('content-type'), bytes: buf.length, parsed: null, read_status: process.env.ANTHROPIC_API_KEY && !/\.(png|jpe?g|webp)$/i.test(f.name) ? 'pending' : 'skipped', created_by_name: 'Delogue PLM' }).select('id').single();
            if (rec) { out.files++; await sb.rpc('ledger_append', { p_tenant: ch.tenant_id, p_channel: 'PLM', p_actor: 'Delogue PLM', p_actor_user: null, p_counterparty: null, p_stream: 'Tech packs and specs', p_order: null, p_what: `${kind.replace('_', ' ')} from Delogue: ${f.name}${f.folderType ? ` (${f.folderType})` : ''}, being read, awaiting a check`, p_gate: 'AUTO · sync', p_gated: false, p_ref: { record_id: rec.id, delogue_file: f.id }, p_track: 'development', p_style: styleId }); }
          } catch (e) { console.error('[delogue] file', f.name, e instanceof Error ? e.message : String(e)); }
        }
        // sample requests: one round per request, status mapped to dates; decisions are never taken from the PLM
        const sr = await api<DelogueSample[]>(key, `/styles/${s.id}/sample-requests`).catch(() => null);
        for (const q of sr?.data || []) {
          if (q.properties?.is_archived) continue;
          const ref = `delogue:sample:${q.id}`;
          const type = sampleTypeOf(q.sampleType?.name);
          const row = { tenant_id: ch.tenant_id, style_id: styleId, type, maker_party_id: partyByName(s.supplier?.name), due_at: d10(q.deadline) || d10(q.etd), sent_at: d10(q.sendDate) || (q.status === 'sent' ? d10(q.lastStateChange) : null), received_at: ['received', 'commented'].includes(q.status || '') ? d10(q.lastStateChange) : null, awb: q.trackingNumber?.slice(0, 80) || null, note: [q.sampleType?.name, q.status, q.note].filter(Boolean).join(' · ').slice(0, 500) || null, plm_ref: ref };
          const { data: have } = await sb.from('samples').select('id, round').eq('tenant_id', ch.tenant_id).eq('plm_ref', ref).maybeSingle();
          if (have) { await sb.from('samples').update(row).eq('id', have.id); continue; }
          const { data: last } = await sb.from('samples').select('round').eq('style_id', styleId).eq('type', type).order('round', { ascending: false }).limit(1).maybeSingle();
          const { data: ins, error } = await sb.from('samples').insert({ ...row, round: (last?.round || 0) + 1, requested_at: d10(q.lastStateChange) || new Date().toISOString().slice(0, 10) }).select('id').single();
          if (error) { console.error('[delogue] sample', q.id, error.message); continue; }
          out.samples++;
          await sb.rpc('ledger_append', { p_tenant: ch.tenant_id, p_channel: 'PLM', p_actor: 'Delogue PLM', p_actor_user: null, p_counterparty: s.supplier?.name || null, p_stream: 'Sample schedule', p_order: null, p_what: `${type.replace('_', ' ')} request from Delogue (${q.sampleType?.name || 'sample'}, ${q.status || 'requested'}${row.due_at ? `, due ${row.due_at}` : ''})`, p_gate: 'AUTO · sync', p_gated: false, p_ref: { sample_id: ins.id, delogue_sample: q.id }, p_track: 'development', p_style: styleId });
        }
      }
      if (!r.pagination?.hasMore || !(r.data || []).length) { page = 1; break; }
      page++;
      if (!out.complete) break;
    }
    await sb.from('channels').update({ last_sync_at: new Date().toISOString(), error: null, config: { ...cfg, page: out.complete ? 1 : page, last_run: out.complete ? startedAt : cfg.last_run || null, last_pass: { at: startedAt, ...out } } }).eq('id', ch.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('channels').update({ status: /401/.test(msg) ? 'reauth' : 'error', error: msg.slice(0, 300), last_sync_at: new Date().toISOString() }).eq('id', ch.id);
  }
  return out;
}
