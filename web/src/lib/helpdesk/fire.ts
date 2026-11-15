// Greenlight is the only thing that starts the triage task (founder, 15 Nov 2026): no schedule, no polling.
// When the founder greenlights a proposal, this calls the API trigger of the scheduled task
// "VIA Merch support triage (on Greenlight)", which wakes the triage session. Nothing about the proposal is
// sent: the task reads its work from the database. The token is generated for that task in the Claude app
// (its Edit dialog, Trigger, API) and fires that one task and nothing else. It is pasted into the VIA console
// (/admin/support, "Build agent link") and kept in merch.app_config (service role only, like jobs_secret);
// TRIAGE_FIRE_TOKEN in Vercel overrides it. Without either, a greenlight is recorded and not built.
import { supabaseAdmin } from '@/lib/supabase/server';

export const TOKEN_KEY = 'triage_fire_token';
async function token(): Promise<string | null> {
  if (process.env.TRIAGE_FIRE_TOKEN) return process.env.TRIAGE_FIRE_TOKEN;
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', TOKEN_KEY).maybeSingle();
  return data?.value || null;
}
export async function triageLink(): Promise<{ connected: boolean; since: string | null; source: 'env' | 'console' | null }> {
  if (process.env.TRIAGE_FIRE_TOKEN) return { connected: true, since: null, source: 'env' };
  const { data } = await supabaseAdmin().from('app_config').select('updated_at').eq('key', TOKEN_KEY).maybeSingle();
  return { connected: !!data, since: data?.updated_at || null, source: data ? 'console' : null };
}
const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_011PgKre3tNkWjLDToYSiAwe/fire';
const fireUrl = () => process.env.TRIAGE_FIRE_URL || DEFAULT_FIRE_URL;

export async function fireTriage(note = 'A proposal was greenlit in the VIA Merch console. Run the triage now.'): Promise<{ fired: boolean; reason?: string }> {
  const url = fireUrl(), tok = await token();
  if (!tok) return { fired: false, reason: 'the build agent link is not set up' };
  if (!/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_]+\/fire$/.test(url)) return { fired: false, reason: 'TRIAGE_FIRE_URL is not a routine fire URL' };
  try {
    const r = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${tok}`, 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text: note }),
    });
    if (r.ok) return { fired: true };
    return { fired: false, reason: r.status === 401 ? 'the token was refused (401): generate a new one and paste it again' : `the trigger answered ${r.status}` };
  } catch (e) {
    return { fired: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
