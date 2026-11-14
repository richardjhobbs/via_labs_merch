// The open tester programme (docs/testers.md, migration 0034). People the founder invites try VIA Merch in
// practice companies. A practice company is a private copy of a frozen template (one per kind of business),
// made for one tester by merch.sandbox_clone, so no tester ever sees another tester or what they did.
// Nothing leaves a practice company: no channels, no invitations, no tokens, no email to anyone but the tester.
import { supabaseAdmin } from '@/lib/supabase/server';

export const WORLDS = ['brand', 'buying_office', 'factory'] as const;
export type World = (typeof WORLDS)[number];
export const isWorld = (v: unknown): v is World => (WORLDS as readonly string[]).includes(v as string);

// What marks a company in tenants.settings.
export type SandboxSettings = { sandbox?: boolean; world?: World; template?: { world?: World; frozen_at?: string | null }; agents?: { daily_cap_usd?: number } } | null | undefined;
export const isSandbox = (s: unknown) => !!(s as SandboxSettings)?.sandbox;
export const isFrozenTemplate = (s: unknown) => !!(s as SandboxSettings)?.template?.frozen_at;
// Background work (sweeps, briefs, alerts, compliance passes, update emails) skips these companies.
export const isQuiet = (s: unknown) => isSandbox(s) || isFrozenTemplate(s);

// A tester's copy may spend this much on the agents in a day; chat stops with a plain message past it.
export const SANDBOX_DAILY_CAP_USD = 1.5;
// The roles a tester can step into in their own practice company.
export const PERSONAS = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics'] as const;
export type Persona = (typeof PERSONAS)[number];

export type Program = { open: boolean; code: string; max: number };
const KEY = 'tester_program';
export async function getProgram(): Promise<Program> {
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', KEY).maybeSingle();
  let p: Partial<Program> = {};
  try { p = data?.value ? JSON.parse(data.value) : {}; } catch { p = {}; }
  return { open: !!p.open, code: typeof p.code === 'string' ? p.code : '', max: Number(p.max) > 0 ? Number(p.max) : 60 };
}
export async function setProgram(p: Program) {
  await supabaseAdmin().from('app_config').upsert({ key: KEY, value: JSON.stringify(p), updated_at: new Date().toISOString() });
}

export type Template = { id: string; slug: string; name: string; world: World; frozen_at: string | null };
// The template companies, one per kind of business at most (the newest wins if two were marked).
export async function templates(): Promise<Template[]> {
  const { data } = await supabaseAdmin().from('tenants').select('id, slug, name, settings, created_at').not('settings->template', 'is', null).order('created_at', { ascending: false });
  const out: Template[] = [];
  for (const t of data || []) {
    const tpl = (t.settings as SandboxSettings)?.template;
    if (!tpl || !isWorld(tpl.world) || out.some((x) => x.world === tpl.world)) continue;
    out.push({ id: t.id, slug: t.slug, name: t.name, world: tpl.world, frozen_at: tpl.frozen_at || null });
  }
  return out;
}

export type Tester = { user_id: string; email: string; name: string; company: string | null; trade: string | null };
export async function testerOf(userId: string): Promise<Tester | null> {
  const { data } = await supabaseAdmin().from('testers').select('user_id, email, name, company, trade').eq('user_id', userId).maybeSingle();
  return (data as Tester) || null;
}

export type Sandbox = { world: World; tenant_id: string; slug: string; name: string };
export async function sandboxesOf(userId: string): Promise<Sandbox[]> {
  const { data } = await supabaseAdmin().from('tester_sandboxes').select('world, tenant_id, tenants(slug, name)').eq('user_id', userId).is('retired_at', null);
  return (data || []).map((r) => { const t = r.tenants as unknown as { slug: string; name: string }; return { world: r.world as World, tenant_id: r.tenant_id, slug: t.slug, name: t.name }; });
}

// A tester's own copy of the template for one kind of business. Returns the slug to open.
export async function provision(tester: Tester, world: World, opts: { fresh?: boolean } = {}): Promise<{ slug: string } | { error: 'notReady' | 'failed' }> {
  const sb = supabaseAdmin();
  const mine = (await sandboxesOf(tester.user_id)).find((s) => s.world === world);
  if (mine && !opts.fresh) return { slug: mine.slug };
  const tpl = (await templates()).find((t) => t.world === world && t.frozen_at);
  if (!tpl) return { error: 'notReady' };
  if (mine) {
    // start again: the old copy is set aside (its rows stay; the ledger is never deleted) and the person leaves it
    await sb.from('tester_sandboxes').update({ retired_at: new Date().toISOString() }).eq('tenant_id', mine.tenant_id);
    await sb.from('memberships').delete().eq('tenant_id', mine.tenant_id).eq('user_id', tester.user_id);
  }
  const slug = `try-${world.replace('_', '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const { data: id, error } = await sb.rpc('sandbox_clone', {
    p_source: tpl.id, p_user: tester.user_id, p_user_name: tester.name, p_user_email: tester.email, p_slug: slug, p_name: tpl.name,
    p_settings: { sandbox: true, world, agents: { daily_cap_usd: SANDBOX_DAILY_CAP_USD } },
  });
  if (error || !id) { console.error('[testers] clone failed', error?.message); return { error: 'failed' }; }
  const { error: e2 } = await sb.from('tester_sandboxes').insert({ user_id: tester.user_id, tenant_id: id as string, world });
  if (e2) { console.error('[testers] sandbox row failed', e2.message); return { error: 'failed' }; }
  return { slug };
}
