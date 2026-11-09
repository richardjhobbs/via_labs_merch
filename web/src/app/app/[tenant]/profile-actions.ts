'use server';
// Settings: day/night view (a cookie on this browser), each member's own avatar and phone number, and the company
// logo (owner only). Members cannot write merch.tenants and only managers can write merch.memberships, so these go
// through the service role after the check here, with a ledger row. The name is fixed: it comes from the invite.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { MEDIA_BUCKET, MEDIA_MAX, MEDIA_TYPES } from '@/lib/media';

export type Theme = 'light' | 'dark' | 'system';
const back = (slug: string, q: string) => redirect(`/app/${slug}/settings?${q}#profile`);

export async function setTheme(slug: string, theme: Theme) {
  if (!['light', 'dark', 'system'].includes(theme)) return;
  (await cookies()).set('merch_theme', theme, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath(`/app/${slug}`, 'layout');
}

// The signed-in person's own membership in this workspace; VIA staff walking a workspace have none to edit.
async function own(slug: string) {
  const ctx = await requireTenant(slug);
  const mine = ctx.memberships.find((x) => x.tenant_id === ctx.tenant.id);
  if (!mine || ctx.viewingAs) back(slug, 'perr=own');
  return { ...ctx, mine: mine! };
}

async function log(tenantId: string, actor: string, userId: string, what: string, ref: Record<string, unknown>) {
  await supabaseAdmin().rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Workspace', p_actor: actor, p_actor_user: userId, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: what, p_gate: 'Logged', p_gated: false, p_ref: ref });
}

async function readImage(form: FormData, slug: string) {
  const f = form.get('file');
  if (!(f instanceof File) || !f.size) back(slug, 'perr=file');
  const file = f as File;
  const ext = MEDIA_TYPES[file.type];
  if (!ext) back(slug, 'perr=type');
  if (file.size > MEDIA_MAX) back(slug, 'perr=size');
  return { buf: Buffer.from(await file.arrayBuffer()), type: file.type, ext };
}

async function store(path: string, img: { buf: Buffer; type: string }, old: string | null) {
  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, img.buf, { contentType: img.type, upsert: false });
  if (error) return error.message;
  if (old) await admin.storage.from(MEDIA_BUCKET).remove([old]);
  return null;
}

export async function savePhone(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, mine } = await own(slug);
  const phone = String(form.get('phone') || '').trim().replace(/\s+/g, ' ');
  if (phone && !/^\+?[0-9][0-9 ().-]{5,23}$/.test(phone)) back(slug, 'perr=phone');
  const { error } = await supabaseAdmin().from('memberships').update({ phone: phone || null }).eq('id', mine.id).eq('user_id', user.id);
  if (error) back(slug, `perr=${encodeURIComponent(error.message)}`);
  await log(tenant.id, mine.display_name || user.email || 'member', user.id, phone ? 'Updated their phone number' : 'Removed their phone number', { membership: mine.id });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'psaved=1');
}

export async function saveAvatar(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, mine } = await own(slug);
  const img = await readImage(form, slug);
  const { data: cur } = await supabaseAdmin().from('memberships').select('avatar_path').eq('id', mine.id).single();
  const path = `${tenant.id}/avatars/${mine.id}-${randomUUID().slice(0, 8)}.${img.ext}`;
  const err = await store(path, img, null);
  if (err) back(slug, `perr=${encodeURIComponent(err)}`);
  const { error } = await supabaseAdmin().from('memberships').update({ avatar_path: path }).eq('id', mine.id).eq('user_id', user.id);
  if (error) { await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([path]); back(slug, `perr=${encodeURIComponent(error.message)}`); }
  if (cur?.avatar_path) await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([cur.avatar_path]);
  await log(tenant.id, mine.display_name || user.email || 'member', user.id, 'Changed their profile picture', { membership: mine.id });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'psaved=1');
}

export async function removeAvatar(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, mine } = await own(slug);
  const { data: cur } = await supabaseAdmin().from('memberships').select('avatar_path').eq('id', mine.id).single();
  await supabaseAdmin().from('memberships').update({ avatar_path: null }).eq('id', mine.id).eq('user_id', user.id);
  if (cur?.avatar_path) await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([cur.avatar_path]);
  await log(tenant.id, mine.display_name || user.email || 'member', user.id, 'Removed their profile picture', { membership: mine.id });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'psaved=1');
}

// Company logo: the owner only.
async function owner(slug: string) {
  const ctx = await own(slug);
  if (ctx.mine.role !== 'owner') back(slug, 'perr=owner');
  return ctx;
}

export async function saveLogo(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, mine } = await owner(slug);
  const img = await readImage(form, slug);
  const { data: cur } = await supabaseAdmin().from('tenants').select('logo_path').eq('id', tenant.id).single();
  const path = `${tenant.id}/logo/${randomUUID().slice(0, 8)}.${img.ext}`;
  const err = await store(path, img, null);
  if (err) back(slug, `perr=${encodeURIComponent(err)}`);
  const { error } = await supabaseAdmin().from('tenants').update({ logo_path: path }).eq('id', tenant.id);
  if (error) { await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([path]); back(slug, `perr=${encodeURIComponent(error.message)}`); }
  if (cur?.logo_path) await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([cur.logo_path]);
  await log(tenant.id, mine.display_name || user.email || 'owner', user.id, 'Changed the company logo', { logo: path });
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'psaved=1');
}

export async function removeLogo(form: FormData) {
  const slug = String(form.get('slug'));
  const { tenant, user, mine } = await owner(slug);
  const { data: cur } = await supabaseAdmin().from('tenants').select('logo_path').eq('id', tenant.id).single();
  await supabaseAdmin().from('tenants').update({ logo_path: null }).eq('id', tenant.id);
  if (cur?.logo_path) await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([cur.logo_path]);
  await log(tenant.id, mine.display_name || user.email || 'owner', user.id, 'Removed the company logo', {});
  revalidatePath(`/app/${slug}`, 'layout');
  back(slug, 'psaved=1');
}
