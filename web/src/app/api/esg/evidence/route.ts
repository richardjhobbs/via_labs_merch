// Opens one ESG evidence file. The bucket is private with no storage policies; the file is served by a
// one-minute signed link after checking that the person is a member of the company the file belongs to
// (or VIA staff under an active support grant) and that the file is on a submission of that company.
import { NextResponse, type NextRequest } from 'next/server';
import { me } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { EVIDENCE_BUCKET } from '@/lib/esg';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('tenant') || '', path = req.nextUrl.searchParams.get('path') || '';
  const m = await me();
  if (!m) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  const tenantId = path.split('/')[0], taskId = path.split('/')[1];
  if (!tenantId || !taskId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // RLS decides: the submission is readable only to members (or a support grant), so this also checks access.
  const sb = await supabaseServer();
  const { data: subs } = await sb.from('esg_submissions').select('evidence, tenants(slug)').eq('tenant_id', tenantId).eq('task_id', taskId);
  const ok = (subs || []).some((s) => (s.tenants as unknown as { slug: string } | null)?.slug === slug && (s.evidence as { path: string }[]).some((e) => e.path === path));
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60);
  if (error || !data) return NextResponse.json({ error: error?.message || 'unavailable' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
