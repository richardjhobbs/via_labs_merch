// Supabase clients for server components, route handlers and server actions.
// All Merch tables live in the "merch" schema of the shared VIA Labs project.
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { membersPrivate, maskerOf } from '../private-members-core';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Session cookies: no maxAge, so the browser drops them when it closes.
// The 2-hour idle rule is enforced in middleware against merch.sessions.
export const COOKIE_OPTS = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', httpOnly: true };

// The signed-in person's client. In a company with private member lists (lib/private-members.ts) every database
// response is passed through the masker first, so no page shows a non-owner another member's name.
export async function supabaseServer() {
  const raw = await rawServer();
  let maskP: Promise<((s: string) => string) | null> | null = null;
  const masker = () => (maskP ??= viewerMasker(raw));
  const maskedFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/rest/v1/') || !(res.headers.get('content-type') || '').includes('json')) return res;
    const mask = await masker();
    if (!mask) return res;
    const body = mask(await res.text());
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  return rawServer(maskedFetch);
}

async function rawServer(f?: typeof fetch) {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    db: { schema: 'merch' },
    ...(f ? { global: { fetch: f } } : {}),
    cookieOptions: COOKIE_OPTS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, { ...options, maxAge: undefined, expires: undefined })); } catch {} },
    },
  });
}

// Service role: bypasses RLS. Only for admin provisioning, webhooks and job workers.
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'merch' }, auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser() {
  const sb = await rawServer();
  const { data } = await sb.auth.getUser();
  return data.user;
}

// Names to hide from this person: in each company with private member lists where they are not an owner,
// every other member and pending invite. Null when there is nothing to hide (most companies).
async function viewerMasker(raw: Awaited<ReturnType<typeof rawServer>>) {
  const { data: { user } } = await raw.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data: mine } = await admin.from('memberships').select('tenant_id, role, display_name, tenants(settings)').eq('user_id', user.id).neq('role', 'owner');
  const priv = (mine || []).filter((m) => membersPrivate((m.tenants as unknown as { settings: unknown } | null)?.settings));
  if (!priv.length) return null;
  const ids = priv.map((m) => m.tenant_id as string);
  const [{ data: members }, { data: invites }] = await Promise.all([
    admin.from('memberships').select('user_id, display_name').in('tenant_id', ids).neq('user_id', user.id),
    admin.from('invites').select('display_name').in('tenant_id', ids).is('accepted_at', null),
  ]);
  const own = new Set(priv.map((m) => (m.display_name || '').trim()));
  return maskerOf([...(members || []), ...(invites || [])].map((m) => (m.display_name || '').trim()).filter((n) => !own.has(n)));
}
