// All tester feedback as a CSV, for analysis outside the console. VIA Labs only.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  await requireAdmin();
  const sb = supabaseAdmin();
  const [{ data: rows }, { data: testers }] = await Promise.all([
    sb.from('tester_feedback').select('created_at, user_id, world, role, track, path, locale, mood, body, audio_path, audio_seconds, status').order('created_at', { ascending: false }).limit(5000),
    sb.from('testers').select('user_id, name, email, company, trade'),
  ]);
  // values that could be read as a formula by a spreadsheet are prefixed with an apostrophe
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const head = ['when', 'name', 'email', 'company', 'works_in', 'practice_company', 'working_as', 'track', 'page', 'language', 'tag', 'note', 'recording_seconds', 'status'];
  const lines = (rows || []).map((r) => { const t = (testers || []).find((x) => x.user_id === r.user_id); return [r.created_at, t?.name, t?.email, t?.company, t?.trade, r.world, r.role, r.track, (r.path || '').replace(/^\/app\/[^/]+/, '') || '/', r.locale, r.mood, r.body, r.audio_path ? r.audio_seconds || 0 : '', r.status].map(cell).join(','); });
  return new NextResponse('﻿' + [head.join(','), ...lines].join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="via-merch-tester-feedback-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}
