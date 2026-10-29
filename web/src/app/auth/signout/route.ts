import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { session } } = await sb.auth.getSession();
  const sid = sessionIdOf(session?.access_token);
  if (sid) await sb.from('sessions').update({ ended_at: new Date().toISOString(), ended_reason: 'logout' }).eq('session_id', sid);
  await sb.auth.signOut({ scope: 'global' });
  const dest = req.nextUrl.clone(); dest.pathname = '/login'; dest.search = '';
  return NextResponse.redirect(dest, { status: 303 });
}
function sessionIdOf(jwt?: string) { if (!jwt) return null; try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).session_id as string; } catch { return null; } }
