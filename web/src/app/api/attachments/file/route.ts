// Opens one mail attachment. The bucket is private; a one-minute signed link is issued once RLS has shown
// the attachment row to the signed-in person.
import { NextResponse, type NextRequest } from 'next/server';
import { me } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { ATTACHMENTS_BUCKET } from '@/lib/connectors/attachments';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const m = await me();
  if (!m) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const sb = await supabaseServer();
  const { data: a } = await sb.from('attachments').select('storage_path, filename').eq('id', id).maybeSingle();
  if (!a?.storage_path) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(ATTACHMENTS_BUCKET).createSignedUrl(a.storage_path, 60, { download: a.filename || undefined });
  if (error || !data) return NextResponse.json({ error: error?.message || 'unavailable' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
