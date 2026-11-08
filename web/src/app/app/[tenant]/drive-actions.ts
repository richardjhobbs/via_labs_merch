'use server';
// What Google's file picker needs in the browser: a short-lived access token for the member's own Drive
// connection (drive.file only), the picker API key and the Cloud project number.
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { driveChannel, driveConfigured, driveToken } from '@/lib/connectors/drive';

export type PickerConfig = { ok: true; token: string; apiKey: string; appId: string } | { ok: false; reason: 'notReady' | 'notConnected' | 'viewer' };

export async function pickerConfig(slug: string): Promise<PickerConfig> {
  const me = await requireTenant(slug);
  if (me.membership.role === 'viewer' || me.membership.id === 'admin') return { ok: false, reason: 'viewer' };
  if (!driveConfigured()) return { ok: false, reason: 'notReady' };
  const sb = supabaseAdmin();
  const ch = await driveChannel(sb, me.tenant.id, me.user.id);
  if (!ch) return { ok: false, reason: 'notConnected' };
  try { return { ok: true, token: await driveToken(sb, ch), apiKey: process.env.GOOGLE_PICKER_API_KEY!, appId: process.env.GOOGLE_PROJECT_NUMBER! }; }
  catch { await sb.from('channels').update({ status: 'reauth' }).eq('id', ch.id); return { ok: false, reason: 'notConnected' }; }
}
