// Start the triage task the moment the founder greenlights a proposal, so the build does not wait for the
// hourly run. This calls the scheduled task's own API trigger (claude.ai/code/routines, the task's Edit dialog,
// Trigger, API): TRIAGE_FIRE_URL is its Fire URL and TRIAGE_FIRE_TOKEN the token generated there, which fires
// that one task and nothing else. Nothing about the proposal is sent: the task reads its work from the
// database, as on the hourly run. With either variable unset this does nothing and the hourly run picks it up.
export const canFireTriage = () => !!(process.env.TRIAGE_FIRE_URL && process.env.TRIAGE_FIRE_TOKEN);

export async function fireTriage(): Promise<{ fired: boolean; reason?: string }> {
  const url = process.env.TRIAGE_FIRE_URL, token = process.env.TRIAGE_FIRE_TOKEN;
  if (!url || !token) return { fired: false, reason: 'not configured' };
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
