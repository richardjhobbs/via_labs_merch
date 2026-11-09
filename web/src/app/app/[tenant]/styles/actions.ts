'use server';
// Styles and their records (development track). Every write is a ledger row on the development track with
// the style attached. A tech pack or brief is read by the model and becomes final only when a person confirms
// it here; the original stays in the private bucket. The document is data, never instructions.
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { recordUsage, hasLlm, translate } from '@/lib/llm';
import { pickedFile } from '@/lib/connectors/drive';
import { DEV_BUCKET, MAX_RECORD_BYTES, RECORD_KINDS, signedUpload, readRecordJob, type RecordKind, type TechPack } from '@/lib/records';
import { STYLE_STATUSES, type StyleStatus } from '@/lib/styles';
import { isTrack } from '@/lib/tracks';

type Me = Awaited<ReturnType<typeof requireTenant>>;
const CAN_WRITE = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics'];
function back(path: string, q: Record<string, string>): never { redirect(`${path}?${new URLSearchParams(q)}`); }
const who = (me: Me) => me.membership.display_name || me.user.email || 'member';
async function ledger(me: Me, styleId: string | null, stream: string, what: string, gate: string, ref: Record<string, unknown> = {}) {
  const sb = await supabaseServer();
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who(me), p_actor_user: me.user.id, p_counterparty: null, p_stream: stream, p_order: null, p_what: what, p_gate: gate, p_gated: true, p_ref: ref, p_track: 'development', p_style: styleId });
}
const clean = (v: FormDataEntryValue | null, max = 200) => String(v || '').trim().slice(0, max) || null;
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v || '').replace(/[, ]/g, '')); return v && String(v).trim() && isFinite(n) ? n : null; };
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export async function createStyle(form: FormData) {
  const slug = String(form.get('tenant'));
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/new`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  const code = clean(form.get('code'), 60), customer_id = clean(form.get('customer_id'), 40);
  if (!code) back(path, { error: t('needCode') });
  const sb = await supabaseServer();
  const row = { tenant_id: me.tenant.id, code, name: clean(form.get('name')), season: clean(form.get('season'), 40), category: clean(form.get('category'), 80), customer_id: /^[0-9a-f-]{36}$/i.test(customer_id || '') ? customer_id : null, description: clean(form.get('description'), 2000), target_price: num(form.get('target_price')), currency: clean(form.get('currency'), 3) || me.tenant.currency || 'USD', target_delivery: date(form.get('target_delivery')), plm_ref: clean(form.get('plm_ref'), 200), status: 'brief', owner_user_id: me.user.id, created_by: me.user.id };
  const { data: s, error } = await sb.from('styles').insert(row).select('id').single();
  if (error || !s) back(path, { error: /duplicate|unique/i.test(error?.message || '') ? t('duplicate') : error?.message || 'failed' });
  await ledger(me, s.id, 'Design briefs', `Style ${code}${row.name ? ` ${row.name}` : ''}${row.season ? ` (${row.season})` : ''} opened`, 'PERSON', { style_id: s.id });
  revalidatePath(`/app/${slug}/styles`);
  redirect(`/app/${slug}/styles/${s.id}?saved=1`);
}

export async function updateStyle(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/${id}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  const sb = await supabaseServer();
  const { data: before } = await sb.from('styles').select('id, code, status, name, season, category, customer_id, target_price, currency, target_delivery, plm_ref, description').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!before) back(`/app/${slug}/styles`, { error: 'not found' });
  const status = String(form.get('status') || before.status);
  if (!(STYLE_STATUSES as readonly string[]).includes(status)) back(path, { error: 'status' });
  const customer_id = clean(form.get('customer_id'), 40);
  const patch = { status: status as StyleStatus, name: clean(form.get('name')), season: clean(form.get('season'), 40), category: clean(form.get('category'), 80), customer_id: /^[0-9a-f-]{36}$/i.test(customer_id || '') ? customer_id : null, description: clean(form.get('description'), 2000), target_price: num(form.get('target_price')), currency: clean(form.get('currency'), 3) || before.currency, target_delivery: date(form.get('target_delivery')), plm_ref: clean(form.get('plm_ref'), 200) };
  const { error } = await sb.from('styles').update(patch).eq('id', id).eq('tenant_id', me.tenant.id);
  if (error) back(path, { error: error.message });
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => String(patch[k] ?? '') !== String(before[k] ?? ''));
  if (changed.length) await ledger(me, id, 'Design briefs', `Style ${before.code}: ${changed.map((k) => `${k.replace('_', ' ')} ${before[k] ?? '—'} → ${patch[k] ?? '—'}`).join('; ')}`, 'PERSON', { fields: changed });
  revalidatePath(path); revalidatePath(`/app/${slug}/styles`);
  redirect(`${path}?saved=1`);
}

// Step 1 of an upload: a one-off signed link so the browser sends the file straight to the private bucket
// (tech packs run to tens of megabytes, more than a server action may receive on Vercel Hobby).
export type UploadLink = { ok: true; path: string; url: string } | { ok: false; error: string };
export async function prepareUpload(slug: string, styleId: string, filename: string, size: number): Promise<UploadLink> {
  const me = await requireTenant(slug), t = await getTranslations('styles');
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') return { ok: false, error: t('viewer') };
  if (!(size > 0) || size > MAX_RECORD_BYTES) return { ok: false, error: t('tooBig') };
  const sb = await supabaseServer();
  const { data: s } = await sb.from('styles').select('id').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle();
  if (!s) return { ok: false, error: 'not found' };
  try { const u = await signedUpload(me.tenant.id, styleId, filename); return { ok: true, path: u.path, url: u.url }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Step 2: keep the stored file as an unconfirmed record at once and read it after the response has gone out
// (next/server after()): a server action that waits a minute for the model is cut off by the platform with a 502.
export type ReadResult = { ok: true; recordId: string } | { ok: false; error: string };
export async function readUploaded(slug: string, styleId: string, path: string, filename: string, mime: string, kindHint: string, source: 'upload' | 'drive' = 'upload', sourceRef: string | null = null): Promise<ReadResult> {
  const me = await requireTenant(slug), t = await getTranslations('styles');
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') return { ok: false, error: t('viewer') };
  if (!path.startsWith(`${me.tenant.id}/${styleId}/`) || path.includes('..')) return { ok: false, error: 'bad path' };
  const admin = supabaseAdmin();
  const { data: blob, error: dlErr } = await admin.storage.from(DEV_BUCKET).download(path);
  if (dlErr || !blob) return { ok: false, error: dlErr?.message || t('unreadable') };
  const buf = Buffer.from(await blob.arrayBuffer());
  if (!buf.length || buf.length > MAX_RECORD_BYTES) { await admin.storage.from(DEV_BUCKET).remove([path]); return { ok: false, error: t('tooBig') }; }
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const kind: RecordKind = (RECORD_KINDS as readonly string[]).includes(kindHint) ? (kindHint as RecordKind) : 'tech_pack';
  const readable = /\.(pdf|xlsx?|xlsm|csv|png|jpe?g|webp)$/i.test(filename);
  const sb = await supabaseServer();
  const { data: r, error } = await sb.from('records').insert({ tenant_id: me.tenant.id, track: 'development', kind, style_id: styleId, version: 0, title: filename, source, source_ref: sourceRef, storage_path: path, filename: filename.slice(0, 200), mime: mime || null, bytes: buf.length, sha256, parsed: null, read_status: readable && hasLlm() ? 'pending' : 'skipped', created_by: me.user.id, created_by_name: who(me) }).select('id').single();
  if (error || !r) return { ok: false, error: error?.message || 'failed' };
  await ledger(me, styleId, 'Tech packs and specs', `${kind.replace('_', ' ')} received: ${filename}${readable && hasLlm() ? ', being read' : ', stored (not read)'}`, 'Logged', { record_id: r.id, sha256 });
  if (readable && hasLlm()) after(() => readRecordJob(r.id));
  revalidatePath(`/app/${slug}/styles/${styleId}`);
  return { ok: true, recordId: r.id };
}

// A file picked in Google Drive goes through the same reading as an upload (read server side, stored, then read).
export async function readFromDrive(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), driveId = String(form.get('drive_file_id') || ''), kindHint = String(form.get('kind') || 'auto');
  const me = await requireTenant(slug);
  const path = `/app/${slug}/styles/${styleId}`;
  if (!driveId) back(path, { error: 'no file' });
  const r = await pickedFile(supabaseAdmin(), me.tenant.id, me.user.id, driveId);
  if ('error' in r) back(path, { error: (await getTranslations('drive'))(r.error) });
  const up = await prepareUpload(slug, styleId, r.file.name, r.file.size);
  if (!up.ok) back(path, { error: up.error });
  const { error } = await supabaseAdmin().storage.from(DEV_BUCKET).upload(up.path, Buffer.from(await r.file.arrayBuffer()), { contentType: r.file.type || 'application/octet-stream', upsert: true });
  if (error) back(path, { error: error.message });
  const res = await readUploaded(slug, styleId, up.path, r.file.name, r.file.type, kindHint, 'drive', driveId);
  if (!res.ok) back(path, { error: res.error });
  redirect(`${path}/records/${res.recordId}`);
}

// The person has checked what was read: it becomes the next confirmed version of its kind on the style.
export async function confirmRecord(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id'));
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/${styleId}/records/${id}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  const sb = await supabaseServer();
  const [{ data: r }, { data: s }] = await Promise.all([
    sb.from('records').select('id, kind, parsed, filename, confirmed_at').eq('tenant_id', me.tenant.id).eq('id', id).eq('style_id', styleId).maybeSingle(),
    sb.from('styles').select('id, code, status, name, season, category').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle(),
  ]);
  if (!r || !s) back(`/app/${slug}/styles/${styleId}`, { error: 'not found' });
  if (r.confirmed_at) back(path, { error: t('alreadyConfirmed') });
  const kind = (RECORD_KINDS as readonly string[]).includes(String(form.get('kind'))) ? (String(form.get('kind')) as RecordKind) : (r.kind as RecordKind);
  const parsed = (r.parsed || null) as TechPack | null;
  const label = clean(form.get('version_label'), 60), title = clean(form.get('title'), 200) || r.filename, lang = clean(form.get('lang'), 5);
  if (parsed) { parsed.version_label = label; if (lang) parsed.lang = lang; }
  const { data: prev } = await sb.from('records').select('id, version').eq('tenant_id', me.tenant.id).eq('style_id', styleId).eq('kind', kind).not('confirmed_at', 'is', null).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (prev?.version || 0) + 1;
  const { error } = await sb.from('records').update({ kind, title, lang: lang || parsed?.lang || null, parsed, version, supersedes_id: prev?.id || null, confirmed_at: new Date().toISOString(), confirmed_by: me.user.id }).eq('id', id);
  if (error) back(path, { error: error.message });
  const note = clean(form.get('note'), 500);
  await ledger(me, styleId, 'Tech packs and specs', `${kind.replace('_', ' ')} v${version}${label ? ` (${label})` : ''} confirmed: ${title}${prev ? `, supersedes v${prev.version}` : ''}${note ? ` (${note})` : ''}`, 'CONFIRMED', { record_id: id, version, supersedes: prev?.id || null });
  // the first confirmed tech pack moves a brief into development and fills what the style still lacks
  const patch: Record<string, unknown> = {};
  if (kind === 'tech_pack' && s.status === 'brief') patch.status = 'developing';
  if (parsed) { if (!s.name && parsed.style_name) patch.name = parsed.style_name; if (!s.season && parsed.season) patch.season = parsed.season; if (!s.category && parsed.category) patch.category = parsed.category; }
  if (Object.keys(patch).length) await sb.from('styles').update(patch).eq('id', styleId);
  revalidatePath(`/app/${slug}/styles/${styleId}`); revalidatePath(`/app/${slug}/styles`);
  redirect(`/app/${slug}/styles/${styleId}?saved=1`);
}

// An unconfirmed record that was read wrongly or uploaded by mistake is removed with its file (a ledger row says so).
export async function discardRecord(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id'));
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/${styleId}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  const sb = await supabaseServer();
  const { data: r } = await sb.from('records').select('id, filename, storage_path, confirmed_at, kind').eq('tenant_id', me.tenant.id).eq('id', id).eq('style_id', styleId).maybeSingle();
  if (!r) back(path, { error: 'not found' });
  if (r.confirmed_at) back(path, { error: t('alreadyConfirmed') });
  const admin = supabaseAdmin();
  if (r.storage_path) await admin.storage.from(DEV_BUCKET).remove([r.storage_path]);
  await admin.from('records').delete().eq('id', id).eq('tenant_id', me.tenant.id);
  await ledger(me, styleId, 'Tech packs and specs', `Discarded unconfirmed ${r.kind.replace('_', ' ')}: ${r.filename}`, 'PERSON', { record_id: id });
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

// Construction notes and remarks of a confirmed tech pack in a factory's language, kept on the record.
export async function translateRecord(form: FormData) {
  const slug = String(form.get('tenant')), styleId = String(form.get('style')), id = String(form.get('id')), to = String(form.get('lang') || '').slice(0, 5);
  const me = await requireTenant(slug), t = await getTranslations('styles');
  const path = `/app/${slug}/styles/${styleId}/records/${id}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin') back(path, { error: t('viewer') });
  if (!/^[a-z]{2}$/.test(to)) back(path, { error: 'lang' });
  if (!hasLlm() && !process.env.DEEPSEEK_API_KEY) back(path, { error: t('noAgent') });
  const sb = await supabaseServer();
  const { data: r } = await sb.from('records').select('id, parsed, confirmed_at, version, kind').eq('tenant_id', me.tenant.id).eq('id', id).eq('style_id', styleId).maybeSingle();
  const parsed = (r?.parsed || null) as TechPack | null;
  if (!r || !parsed) back(path, { error: 'not found' });
  const lines = parsed.construction.length ? parsed.construction : [];
  const src = [...lines.map((l, i) => `${i + 1}. ${l}`), ...(parsed.notes ? [`N. ${parsed.notes}`] : [])].join('\n');
  if (!src.trim()) back(path, { error: t('nothingToTranslate') });
  const { text, usage } = await translate(src, to, parsed.lang || undefined);
  await recordUsage(me.tenant.id, { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: usage.cost });
  const out = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const construction = out.filter((l) => !/^N\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s*/, ''));
  const notes = out.find((l) => /^N\.\s/.test(l))?.replace(/^N\.\s*/, '') || null;
  const translations = { ...(parsed.translations || {}), [to]: { construction, notes, at: new Date().toISOString() } };
  // the record may already be confirmed (then only the service role may touch it), so this goes through the app
  const { error } = await supabaseAdmin().from('records').update({ parsed: { ...parsed, translations } }).eq('id', id).eq('tenant_id', me.tenant.id);
  if (error) back(path, { error: error.message });
  await ledger(me, styleId, 'Tech packs and specs', `${r.kind.replace('_', ' ')} v${r.version}: construction notes translated to ${to}`, 'PERSON', { record_id: id, lang: to, model: usage.model });
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

// Development or production for a conversation that was filed on the wrong track (a ledger row either way).
export async function moveThread(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id')), track = String(form.get('track'));
  const me = await requireTenant(slug);
  const path = `/app/${slug}/threads/${id}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin' || !isTrack(track)) back(path, { error: 'not allowed' });
  const sb = await supabaseServer();
  const { data: th } = await sb.from('threads').select('id, track, subject').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle();
  if (!th || th.track === track) redirect(path);
  await sb.from('threads').update({ track }).eq('id', id);
  await sb.from('messages').update({ track }).eq('thread_id', id).eq('tenant_id', me.tenant.id);
  await sb.rpc('ledger_append', { p_tenant: me.tenant.id, p_channel: 'Console', p_actor: who(me), p_actor_user: me.user.id, p_counterparty: null, p_stream: null, p_order: null, p_what: `Conversation "${th.subject || id.slice(0, 8)}" moved from ${th.track} to ${track}`, p_gate: 'PERSON', p_gated: true, p_ref: { thread_id: id }, p_track: track });
  revalidatePath(path); revalidatePath(`/app/${slug}/threads`);
  redirect(path);
}
