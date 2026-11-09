// Mail attachments (migration 0022). The connectors store readable files from known senders (PDF, spreadsheet,
// image, up to 20 MB) in the private bucket merch-attachments against the message. When the message is filed on
// a style, an attachment becomes a record (source 'plm' when the sender is a PLM system, else 'email') in the
// development bucket, read in the background through the records_read_notify trigger.
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEV_BUCKET, type RecordKind } from '@/lib/records';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ATTACHMENTS_BUCKET = 'merch-attachments';
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const READABLE = /\.(pdf|xlsx?|xlsm|csv|png|jpe?g|webp)$/i;
export const readableAttachment = (name: string, bytes: number) => READABLE.test(name) && bytes > 0 && bytes <= MAX_ATTACHMENT_BYTES;

export type IncomingFile = { name: string; mime: string | null; data: Buffer };

export async function storeAttachments(sb: Client, tenantId: string, messageId: string, source: string, files: IncomingFile[]) {
  let stored = 0;
  for (const f of files) {
    if (!readableAttachment(f.name, f.data.length)) continue;
    const sha256 = createHash('sha256').update(f.data).digest('hex');
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const path = `${tenantId}/${messageId}/${sha256.slice(0, 16)}.${ext}`;
    const { error } = await sb.storage.from(ATTACHMENTS_BUCKET).upload(path, f.data, { contentType: f.mime || 'application/octet-stream', upsert: true });
    if (error) { console.error('[attachments] upload failed', f.name, error.message); continue; }
    await sb.from('attachments').insert({ tenant_id: tenantId, message_id: messageId, storage_path: path, filename: f.name.slice(0, 200), mime: f.mime, bytes: f.data.length, sha256, source });
    stored++;
  }
  return stored;
}

// What kind of record a file most likely is, from its name.
export function recordKindOf(name: string): RecordKind {
  const n = name.toLowerCase();
  if (/\.(png|jpe?g|webp)$/.test(n)) return /scan/.test(n) ? 'scan' : 'photo';
  if (/bom|bill.?of.?material/.test(n)) return 'bom';
  if (/spec|measure|pom|grading/.test(n)) return 'spec';
  if (/fit|comment/.test(n)) return 'fit_comment';
  if (/brief|mood|inspiration/.test(n)) return 'brief';
  if (/test|report/.test(n)) return 'test_report';
  return 'tech_pack';
}

// File one stored attachment on a style as a record. The file is copied into the development bucket; the
// attachment row points at the record so it is not filed twice. Returns the record id.
export async function fileAttachmentAsRecord(sb: Client, a: { id: string; tenant_id: string; message_id: string | null; storage_path: string; filename: string; mime: string | null; bytes: number | null; sha256: string | null; record_id: string | null }, styleId: string, opts: { source: 'email' | 'plm' | 'forward'; actor: string; actorUser?: string | null; kind?: RecordKind; sourceRef?: string | null }) {
  if (a.record_id) return a.record_id;
  const { data: blob, error } = await sb.storage.from(ATTACHMENTS_BUCKET).download(a.storage_path);
  if (error || !blob) throw new Error(error?.message || 'download failed');
  const buf = Buffer.from(await blob.arrayBuffer());
  const ext = (a.filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const path = `${a.tenant_id}/${styleId}/${(a.sha256 || createHash('sha256').update(buf).digest('hex')).slice(0, 16)}-${Date.now().toString(36)}.${ext}`;
  const up = await sb.storage.from(DEV_BUCKET).upload(path, buf, { contentType: a.mime || 'application/octet-stream', upsert: true });
  if (up.error) throw new Error(up.error.message);
  const kind = opts.kind || recordKindOf(a.filename);
  const readable = READABLE.test(a.filename) && !!process.env.ANTHROPIC_API_KEY;
  const { data: r, error: insErr } = await sb.from('records').insert({ tenant_id: a.tenant_id, track: 'development', kind, style_id: styleId, version: 0, title: a.filename, source: opts.source, source_message_id: a.message_id, source_ref: opts.sourceRef || null, storage_path: path, filename: a.filename.slice(0, 200), mime: a.mime, bytes: buf.length, sha256: a.sha256, parsed: null, read_status: readable ? 'pending' : 'skipped', created_by: opts.actorUser || null, created_by_name: opts.actor }).select('id').single();
  if (insErr || !r) throw new Error(insErr?.message || 'record failed');
  await sb.from('attachments').update({ record_id: r.id }).eq('id', a.id);
  await sb.rpc('ledger_append', { p_tenant: a.tenant_id, p_channel: opts.source === 'plm' ? 'PLM' : 'Email', p_actor: opts.actor, p_actor_user: opts.actorUser || null, p_counterparty: null, p_stream: 'Tech packs and specs', p_order: null, p_what: `${kind.replace('_', ' ')} received by ${opts.source === 'plm' ? 'PLM notification' : 'email'}: ${a.filename}${readable ? ', being read' : ', stored (not read)'}`, p_gate: 'Logged', p_gated: false, p_ref: { record_id: r.id, attachment_id: a.id, sha256: a.sha256 }, p_track: 'development', p_style: styleId });
  return r.id as string;
}
