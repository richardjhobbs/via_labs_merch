// One sign-in for the workspace and the support desk. The two live on different hosts (merch.getvia.xyz and
// support.getvia.xyz), and session cookies are per host, so a link between them goes through here: for a
// person already signed in on this host, mint a single-use sign-in token for that same person and send them
// to the other host's /auth/callback, which exchanges it for a session there. Nothing is emailed, the token
// works once and only for the signed-in person, and the destination is one of our two hosts, never a URL
// from the request. The session cookie is never widened to .getvia.xyz, where other VIA apps live.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser, supabaseAdmin } from '@/lib/supabase/server';

const clean = (u?: string) => (u || '').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') || '/support';
  // only paths inside the desk or the workspace, never a full URL
  const path = /^\/(support|app)(\/[A-Za-z0-9\-._~/]*)?$/.test(to) ? to : '/support';
  const here = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
  const target = path.startsWith('/support') ? clean(process.env.NEXT_PUBLIC_SUPPORT_URL) : clean(process.env.NEXT_PUBLIC_APP_URL);
  const local = () => { const u = req.nextUrl.clone(); u.pathname = path; u.search = ''; return NextResponse.redirect(u); };
  let targetHost = '';
  try { targetHost = target ? new URL(target).host.toLowerCase() : ''; } catch { /* unset or malformed: stay on this host */ }
  if (!targetHost || targetHost === here) return local();

  const user = await currentUser();
  // not signed in here: the other host asks for the code itself
  if (!user?.email) return NextResponse.redirect(`${target}${path}`);
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) return NextResponse.redirect(`${target}${path}`);
  const dest = new URL(`${target}/auth/callback`);
  dest.searchParams.set('token_hash', hash);
  dest.searchParams.set('type', 'magiclink');
  dest.searchParams.set('next', path);
  const res = NextResponse.redirect(dest);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
