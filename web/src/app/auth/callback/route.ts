// Magic-link landing: exchanges the token hash for a session, then sends the person on.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get('next') || '/app';
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as 'email' | 'magiclink' | 'invite' | null;
  const code = url.searchParams.get('code');
  const sb = await supabaseServer();
  let ok = false;
  if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  else if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  const dest = url.clone(); dest.search = '';
  dest.pathname = ok ? (next.startsWith('/') ? next : '/app') : '/login';
  if (!ok) dest.searchParams.set('reason', 'ended');
  return NextResponse.redirect(dest);
}
