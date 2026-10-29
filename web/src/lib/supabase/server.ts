// Supabase clients for server components, route handlers and server actions.
// All Merch tables live in the "merch" schema of the shared VIA Labs project.
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Session cookies: no maxAge, so the browser drops them when it closes.
// The 2-hour idle rule is enforced in middleware against merch.sessions.
export const COOKIE_OPTS = { path: '/', sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', httpOnly: true };

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    db: { schema: 'merch' },
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
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user;
}
