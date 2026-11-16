// When a greenlit proposal counts as stuck (lib/helpdesk/stuck.ts). Pure, so it is tested.
const MIN = 60_000;
export const STOP_FLAGS = ['needs the founder', 'checks failed', 'deploy failed', 'steering text'];

export type StuckRow = { id: string; number: number; title: string; status: string; risk_flags: string[] | null; merged_sha: string | null; decided_at: string | null; updated_at: string; plan: string | null; stuck_reason: string | null };

export function stuckReason(p: StuckRow, now = Date.now()): string | null {
  const age = (s: string | null) => (s ? now - new Date(s).getTime() : 0);
  const flags = (p.risk_flags || []).filter((f) => STOP_FLAGS.includes(f));
  if (p.status === 'greenlit' && age(p.decided_at) > 15 * MIN) return 'The build did not start within 15 minutes of the Greenlight.';
  if (p.status === 'building' && !p.merged_sha && age(p.updated_at) > 90 * MIN) return 'The build started but stopped without a merged pull request.';
  if (['planned', 'pr_open', 'building'].includes(p.status) && flags.length) return `The build stopped: ${flags.join(', ')}.`;
  if (p.status === 'pr_open' && p.merged_sha && age(p.updated_at) > 25 * MIN) return `Merged as ${p.merged_sha.slice(0, 7)}, but production has not been running it for 25 minutes: the Vercel deployment most likely failed.`;
  return null;
}

