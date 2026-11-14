'use server';
// The tester programme's server actions (docs/testers.md): join, open a practice company, change the role
// you work as, start a company again, and send feedback to VIA Labs.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin, currentUser } from '@/lib/supabase/server';
import { requireMe, requireTenant } from '@/lib/tenant';
import { getProgram, isSandbox, isWorld, PERSONAS, provision, testerOf, type Persona } from '@/lib/testers';

const Join = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(160), company: z.string().trim().max(120).optional(), trade: z.enum(['brand', 'buying_office', 'factory', 'trading', 'other']), k: z.string().max(80).optional(), ref: z.string().max(40).optional(), locale: z.string().max(5).optional() });
export type JoinResult = { ok: true; email: string; signedIn: boolean } | { ok: false; error: 'form' | 'closed' | 'code' | 'full' | 'failed' };

// Registers a tester. The sign-in itself is the usual emailed code; this only makes sure the person may ask for one.
export async function joinTesters(form: FormData): Promise<JoinResult> {
  const p = Join.safeParse(Object.fromEntries([...form].filter(([, v]) => typeof v === 'string' && v !== '')));
  if (!p.success) return { ok: false, error: 'form' };
  const d = p.data, sb = supabaseAdmin();
  const me = await currentUser();
  const email = me?.email?.toLowerCase() || d.email;
  const program = await getProgram();
  if (!program.open) return { ok: false, error: 'closed' };
  if (program.code && (d.k || '') !== program.code) return { ok: false, error: 'code' };
  let userId = me?.id || null;
  if (!userId) {
    await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => null);
    // the id of the (new or existing) person, without sending anything
    const { data: link } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
    userId = link?.user?.id || null;
  }
  if (!userId) return { ok: false, error: 'failed' };
  const { data: have } = await sb.from('testers').select('user_id').eq('user_id', userId).maybeSingle();
  if (!have) {
    const { count } = await sb.from('testers').select('user_id', { count: 'exact', head: true });
    if ((count || 0) >= program.max) return { ok: false, error: 'full' };
  }
  const { error } = await sb.from('testers').upsert({ user_id: userId, email, name: d.name, company: d.company || null, trade: d.trade, ref: d.ref || null, locale: d.locale || null });
  if (error) return { ok: false, error: 'failed' };
  return { ok: true, email, signedIn: !!me };
}

async function tester() {
  const me = await requireMe();
  const t = await testerOf(me.user.id);
  if (!t) redirect('/try');
  await supabaseAdmin().from('testers').update({ last_seen_at: new Date().toISOString() }).eq('user_id', me.user.id);
  return t!;
}

export async function openWorld(form: FormData) {
  const world = String(form.get('world')), fresh = form.get('fresh') === '1';
  const t = await tester();
  if (!isWorld(world)) redirect('/try/start');
  const r = await provision(t, world, { fresh });
  if ('error' in r) redirect(`/try/start?error=${r.error}`);
  revalidatePath('/try/start');
  redirect(`/app/${r.slug}`);
}

const TITLES: Record<Persona, string> = { owner: 'Managing director', manager: 'Merchandising manager', merchandiser: 'Merchandiser', qc: 'Quality controller', compliance: 'Compliance officer', logistics: 'Logistics coordinator' };

// In your own practice company you can work as any role, to see what each one sees.
export async function setPersona(form: FormData) {
  const slug = String(form.get('tenant')), role = String(form.get('role')) as Persona;
  const { tenant, user } = await requireTenant(slug);
  const sb = supabaseAdmin();
  const { data: mine } = await sb.from('tester_sandboxes').select('id').eq('tenant_id', tenant.id).eq('user_id', user.id).is('retired_at', null).maybeSingle();
  if (!isSandbox(tenant.settings) || !mine || !PERSONAS.includes(role)) redirect(`/app/${slug}`);
  await sb.from('memberships').update({ role, title: TITLES[role], scopes: {} }).eq('tenant_id', tenant.id).eq('user_id', user.id);
  revalidatePath(`/app/${slug}`, 'layout');
  redirect(`/app/${slug}`);
}

const MOODS = ['good', 'confusing', 'missing', 'broken'];
export type FeedbackResult = { ok: boolean };

// Feedback goes to VIA Labs only: a typed or dictated note, or a recording, with the page it was left on.
export async function sendFeedback(form: FormData): Promise<FeedbackResult> {
  const me = await requireMe();
  const sb = supabaseAdmin();
  const slug = String(form.get('tenant') || ''), body = String(form.get('body') || '').trim().slice(0, 8000), mood = String(form.get('mood') || '');
  const audio = form.get('audio');
  const hasAudio = audio instanceof File && audio.size > 0 && audio.size <= 4_000_000 && /^audio\//.test(audio.type);
  if (!body && !hasAudio) return { ok: false };
  const m = slug ? me.memberships.find((x) => x.tenants.slug === slug) : null;
  let audioPath: string | null = null;
  if (hasAudio) {
    const ext = /mp4|aac|m4a/.test(audio.type) ? 'm4a' : /ogg/.test(audio.type) ? 'ogg' : 'webm';
    audioPath = `${me.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('merch-feedback').upload(audioPath, Buffer.from(await audio.arrayBuffer()), { contentType: audio.type.split(';')[0] });
    if (error) { console.error('[feedback] upload', error.message); audioPath = null; if (!body) return { ok: false }; }
  }
  const { error } = await sb.from('tester_feedback').insert({
    user_id: me.user.id, tenant_id: m?.tenant_id || null, world: (m?.tenants.settings as { world?: string } | null)?.world || null, role: m?.role || null,
    track: String(form.get('track') || '').slice(0, 20) || null, path: String(form.get('path') || '').slice(0, 300) || null, locale: String(form.get('locale') || '').slice(0, 5) || null,
    mood: MOODS.includes(mood) ? mood : null, body: body || null, audio_path: audioPath, audio_seconds: Math.min(600, Math.max(0, Number(form.get('seconds')) || 0)) || null,
    user_agent: String(form.get('ua') || '').slice(0, 200) || null,
  });
  return { ok: !error };
}
