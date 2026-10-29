// Verifies the emailed code on the server and sets the session cookies in the response,
// so sign-in does not depend on the browser writing cookies from script.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { email, token, next } = (await req.json().catch(() => ({}))) as { email?: string; token?: string; next?: string };
  if (!email || !token) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
  if (error || !data.session) return NextResponse.json({ ok: false, error: error?.message || 'invalid' }, { status: 401 });
  const dest = next && next.startsWith('/') ? next : '/app';
  return NextResponse.json({ ok: true, next: dest });
}
