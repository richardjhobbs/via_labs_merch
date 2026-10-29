// Called every minute by Supabase pg_cron (merch.tick) with a shared secret.
// Drains small batches from the pgmq queues. Workers arrive in build step 3;
// for now it reports queue depth so the plumbing can be verified end to end.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 55;

export async function POST(req: NextRequest) {
  if (!process.env.JOBS_SECRET || req.headers.get('x-merch-jobs') !== process.env.JOBS_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await supabaseAdmin().rpc('queue_depth');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, at: new Date().toISOString(), depth: data });
}

export async function GET() { return NextResponse.json({ ok: true, service: 'via-merch jobs' }); }
