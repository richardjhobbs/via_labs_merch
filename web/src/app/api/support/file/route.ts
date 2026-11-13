// Opens one screenshot from a support ticket. The bucket is private with no storage policies; the file is
// served by a one-minute signed link after RLS has shown the message to the signed-in person.
import { NextResponse, type NextRequest } from 'next/server';
import { me } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { SUPPORT_BUCKET, type Attachment } from '@/lib/helpdesk/desk';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('m') || '';
  const i = Number(req.nextUrl.searchParams.get('i') || 0);
  if (!(await me())) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const sb = await supabaseServer();
  const { data: msg } = await sb.from('support_messages').select('attachments').eq('id', id).maybeSingle();
  const a = ((msg?.attachments || []) as Attachment[])[i];
  if (!a?.path) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(SUPPORT_BUCKET).createSignedUrl(a.path, 60);
  if (error || !data) return NextResponse.json({ error: 'unavailable' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
