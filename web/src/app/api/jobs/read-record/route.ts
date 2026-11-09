// Reads one record's file with the model (BOM, colourways, points of measure, construction). Called by the
// database trigger merch.records_read_notify through pg_net when a job stores a record with read_status pending,
// with the same shared secret as the minute tick. Browser uploads do not come here: they read in after().
import { NextResponse, type NextRequest } from 'next/server';
import { readRecordJob } from '@/lib/records';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.JOBS_SECRET || req.headers.get('x-merch-jobs') !== process.env.JOBS_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { record_id } = (await req.json().catch(() => ({}))) as { record_id?: string };
  if (!record_id || !/^[0-9a-f-]{36}$/i.test(record_id)) return NextResponse.json({ error: 'record_id' }, { status: 400 });
  const t0 = Date.now();
  await readRecordJob(record_id);
  return NextResponse.json({ ok: true, record_id, ms: Date.now() - t0 });
}
