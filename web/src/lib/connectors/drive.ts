// Google Drive and Sheets: runtime half of the 'drive' and 'sheets' manifests in catalog.ts.
// One connection per member (merch.channels, kind 'sheets', config.connector 'gdrive') holding only the
// drive.file permission: VIA Merch can open a file only after the person picks it in Google's file picker.
// A picked Google Sheet is exported as .xlsx and goes through the same orders import as an uploaded file;
// a picked PDF, photo, spreadsheet or Google Doc goes through the same document reader as an upload.
import type { SupabaseClient } from '@supabase/supabase-js';
import { googleConfigured, googleToken } from './google';
import { channelToken, CHANNEL_COLS, ReauthError, type Channel } from './mail';

type Client = SupabaseClient<any, 'merch', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DRIVE = 'https://www.googleapis.com/drive/v3';
export const MAX_BYTES = 4_000_000;

// The picker runs in the browser and needs a browser API key and the Cloud project number (so files
// picked are granted to this app) as well as the OAuth client.
export function driveConfigured() { return googleConfigured() && !!process.env.GOOGLE_PICKER_API_KEY && !!process.env.GOOGLE_PROJECT_NUMBER; }

export async function driveAccount(accessToken: string) {
  const r = await fetch(`${DRIVE}/about?fields=user(emailAddress)`, { headers: { authorization: `Bearer ${accessToken}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.user?.emailAddress) throw new Error(`Google Drive: ${j?.error?.message || r.status}`);
  return String(j.user.emailAddress).toLowerCase();
}

export async function driveChannel(sb: Client, tenantId: string, userId: string) {
  const { data } = await sb.from('channels').select(CHANNEL_COLS).eq('tenant_id', tenantId).eq('owner_user_id', userId).eq('kind', 'sheets').eq('status', 'connected').contains('config', { connector: 'gdrive' }).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Channel | null) || null;
}

export const driveToken = (sb: Client, ch: Channel) => channelToken(sb, ch, (refresh_token) => googleToken({ grant_type: 'refresh_token', refresh_token }));

const EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
};

// Download one picked file as a File, ready for the same code paths as an upload.
export async function driveFile(token: string, fileId: string): Promise<{ file: File } | { error: 'tooBig' | 'badType' | 'notFound' }> {
  if (!/^[\w-]{10,200}$/.test(fileId)) return { error: 'notFound' };
  const h = { authorization: `Bearer ${token}` };
  const metaRes = await fetch(`${DRIVE}/files/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: h });
  if (!metaRes.ok) return { error: 'notFound' };
  const meta = await metaRes.json() as { name: string; mimeType: string; size?: string };
  const ex = EXPORT[meta.mimeType];
  if (!ex && meta.mimeType.startsWith('application/vnd.google-apps.')) return { error: 'badType' };
  if (!ex && Number(meta.size || 0) > MAX_BYTES) return { error: 'tooBig' };
  const url = ex ? `${DRIVE}/files/${fileId}/export?mimeType=${encodeURIComponent(ex.mime)}` : `${DRIVE}/files/${fileId}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: h });
  if (!res.ok) return { error: res.status === 403 ? 'tooBig' : 'notFound' };   // export refuses very large files with 403
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { error: 'tooBig' };
  const name = ex && !meta.name.toLowerCase().endsWith(`.${ex.ext}`) ? `${meta.name}.${ex.ext}` : meta.name;
  return { file: new File([bytes], name, { type: ex?.mime || meta.mimeType }) };
}

// Read a picked file for a member. Returns the file or an error key (strings live in the caller's namespace).
export async function pickedFile(sb: Client, tenantId: string, userId: string, fileId: string) {
  const ch = await driveChannel(sb, tenantId, userId);
  if (!ch) return { error: 'notConnected' as const };
  try { return await driveFile(await driveToken(sb, ch), fileId); }
  catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await sb.from('channels').update(e instanceof ReauthError ? { status: 'reauth', error: msg } : { error: msg }).eq('id', ch.id);
    return { error: e instanceof ReauthError ? 'notConnected' as const : 'notFound' as const };
  }
}
