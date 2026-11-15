// Greenlight is the only thing that starts the triage task (founder, 15 Nov 2026): no schedule, no polling.
// When the founder greenlights a proposal, this calls the API trigger of the scheduled task
// "VIA Merch support triage (on Greenlight)", which wakes the triage session. Nothing about the proposal is
// sent: the task reads its work from the database. TRIAGE_FIRE_TOKEN is the token generated for that task in
// the Claude app (its Edit dialog, Trigger, API); it fires that one task and nothing else. Without it the
// greenlight is recorded and the console says the build has not started.
const DEFAULT_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_011PgKre3tNkWjLDToYSiAwe/fire';
const fireUrl = () => process.env.TRIAGE_FIRE_URL || DEFAULT_FIRE_URL;
export const canFireTriage = () => !!process.env.TRIAGE_FIRE_TOKEN;

export async function fireTriage(): Promise<{ fired: boolean; reason?: string }> {
  const url = fireUrl(), token = process.env.TRIAGE_FIRE_TOKEN;
  if (!token) return { fired: false, reason: 'not connected' };
  if (!/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_]+\/fire$/.test(url)) return { fired: false, reason: 'TRIAGE_FIRE_URL is not a routine fire URL' };
  try {
    const r = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'A proposal was greenlit in the VIA Merch console. Run the triage now.' }),
    });
    if (r.ok) return { fired: true };
    return { fired: false, reason: `the trigger answered ${r.status}` };
  } catch (e) {
    return { fired: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
