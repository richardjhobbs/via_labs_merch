// Opens one record's original file (tech pack, brief, photo). The bucket is private with no storage policies;
// the file is served by a one-minute signed link after RLS has shown the record to the signed-in person.
import { NextResponse, type NextRequest } from 'next/server';
import { me } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { DEV_BUCKET } from '@/lib/records';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const m = await me();
  if (!m) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const sb = await supabaseServer();
  const { data: r } = await sb.from('records').select('storage_path, filename').eq('id', id).maybeSingle();
  if (!r?.storage_path) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(DEV_BUCKET).createSignedUrl(r.storage_path, 60, { download: r.filename || undefined });
  if (error || !data) return NextResponse.json({ error: error?.message || 'unavailable' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
