// Start connecting a mailbox: a member signs in with Google or Microsoft for their own mailbox.
// PKCE verifier and state travel in a short-lived httpOnly cookie scoped to this provider's path.
import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { requireTenant } from '@/lib/tenant';
import { providerOf } from './providers';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const slug = req.nextUrl.searchParams.get('tenant') || '';
  const me = await requireTenant(slug);
  const back = (q: string) => NextResponse.redirect(new URL(`/app/${slug}/connections?${q}`, req.nextUrl.origin));
  const p = providerOf(provider);
  if (!p) return back('gerror=failed');
  if (!p.configured()) return back(`gerror=notReady&gp=${provider}`);
  if (me.membership.id === 'admin') return back('gerror=support');
  if (me.membership.role === 'viewer') return back('gerror=viewer');
  const state = randomBytes(18).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = new URL(`/api/connect/${provider}/callback`, req.nextUrl.origin).toString();
  const res = NextResponse.redirect(p.authUrl({ state, challenge, redirectUri, loginHint: me.user.email || undefined }));
  res.cookies.set('merch_oauth', JSON.stringify({ state, verifier, slug }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: `/api/connect/${provider}`, maxAge: 600 });
  return res;
}
