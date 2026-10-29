// Refreshes the Supabase session on every request and enforces the idle rule:
// a session that has not been seen for IDLE_MINUTES is signed out, and the
// person asks for a new code. Public routes pass through.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const IDLE_MINUTES = 120;
const PUBLIC = [/^\/$/, /^\/login/, /^\/auth\//, /^\/invite\//, /^\/request-access/, /^\/api\/(webhooks|jobs|mcp|health)/, /^\/legal/];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: 'merch' },
    cookieOptions: { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, { ...options, maxAge: undefined, expires: undefined }));
      },
    },
  });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return redirectToLogin(req, path);

  // idle check against merch.sessions (one row per Supabase session id)
  const { data: { session } } = await sb.auth.getSession();
  const sid = sessionIdOf(session?.access_token);
  if (sid) {
    const { data: row } = await sb.from('sessions').select('last_seen_at, ended_at').eq('session_id', sid).maybeSingle();
    const now = Date.now();
    if (row?.ended_at) { await sb.auth.signOut({ scope: 'local' }); return redirectToLogin(req, path, 'ended'); }
    if (row && now - new Date(row.last_seen_at).getTime() > IDLE_MINUTES * 60_000) {
      await sb.from('sessions').update({ ended_at: new Date().toISOString(), ended_reason: 'idle' }).eq('session_id', sid);
      await sb.auth.signOut({ scope: 'global' });
      return redirectToLogin(req, path, 'idle');
    }
    // touch at most once a minute to keep writes low
    if (!row || now - new Date(row.last_seen_at).getTime() > 60_000) {
      await sb.from('sessions').upsert({ user_id: user.id, session_id: sid, last_seen_at: new Date().toISOString(), user_agent: req.headers.get('user-agent')?.slice(0, 200) }, { onConflict: 'session_id' });
    }
  }
  return res;
}

function sessionIdOf(jwt?: string) {
  if (!jwt) return null;
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id as string; } catch { return null; }
}

function redirectToLogin(req: NextRequest, next: string, reason?: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login'; url.search = '';
  url.searchParams.set('next', next);
  if (reason) url.searchParams.set('reason', reason);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|txt|xml)).*)'] };
