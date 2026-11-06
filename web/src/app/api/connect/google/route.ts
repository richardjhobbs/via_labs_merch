// Start the Gmail connection: a member signs in with Google for their own mailbox.
// PKCE verifier and state travel in a short-lived httpOnly cookie scoped to this path.
import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { requireTenant } from '@/lib/tenant';
import { authUrl, googleConfigured } from '@/lib/connectors/google';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('tenant') || '';
  const me = await requireTenant(slug);
  const back = (q: string) => NextResponse.redirect(new URL(`/app/${slug}/connections?${q}`, req.nextUrl.origin));
  if (!googleConfigured()) return back('gerror=notReady');
  if (me.membership.id === 'admin') return back('gerror=support');
  if (me.membership.role === 'viewer') return back('gerror=viewer');
  const state = randomBytes(18).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = new URL('/api/connect/google/callback', req.nextUrl.origin).toString();
  const res = NextResponse.redirect(authUrl({ state, challenge, redirectUri, loginHint: me.user.email || undefined }));
  res.cookies.set('merch_goauth', JSON.stringify({ state, verifier, slug }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/connect/google', maxAge: 600 });
  return res;
}
