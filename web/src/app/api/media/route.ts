// Serves one avatar or company logo from the private bucket merch-media. The first path segment is the tenant id;
// the person must be able to read that tenant (member, partner or VIA staff, by RLS). Redirects to a one-hour
// signed link; file names change on every upload, so the browser may cache the redirect.
import { NextResponse, type NextRequest } from 'next/server';
import { me } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/media';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('p') || '';
  const m = await me();
  if (!m) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  const [tenantId, kind, file] = path.split('/');
  if (!/^[0-9a-f-]{36}$/.test(tenantId || '') || !['avatars', 'logo'].includes(kind || '') || !file || path.split('/').length !== 3) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const sb = await supabaseServer();
  const { data: t } = await sb.from('tenants').select('id').eq('id', tenantId).maybeSingle();
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set('Cache-Control', 'private, max-age=3000');
  return res;
}
