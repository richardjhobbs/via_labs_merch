'use server';
// The track switch: a cookie per workspace, like the language cookie, so lists, queue, briefing and the
// assistant all read the same track. Only a track the person holds can be chosen.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { isTrack, memberTracks, trackCookie } from '@/lib/tracks';

export async function switchTrack(form: FormData) {
  const slug = String(form.get('tenant')), track = String(form.get('track'));
  const { tenant, membership } = await requireTenant(slug);
  const sb = await supabaseServer();
  const { data: t } = await sb.from('tenants').select('settings').eq('id', tenant.id).single();
  const allowed = memberTracks(membership, t?.settings as { tracks?: { development?: boolean } });
  if (isTrack(track) && allowed.includes(track)) (await cookies()).set(trackCookie(slug), track, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  redirect(`/app/${slug}`);
}
