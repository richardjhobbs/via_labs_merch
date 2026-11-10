// Layered agents, phase 5: what the agents learn and what they may spend. Pure functions, tested in
// learning-rules.test.ts.
// - Only lessons a person confirmed reach an agent; proposed, rejected and retired ones never do.
// - Past a company's daily spending cap, the work nobody is waiting on stops (the hourly sweep, the morning
//   brief, capacity decisions, the compliance pass, first briefs); chat and replies to incoming messages go on.

export type Lesson = { id: string; scope: 'company' | 'customer' | 'desk'; scope_id: string | null; text: string; status: string; created_at: string };

export function lessonsForPrompt(lessons: Lesson[], nameOf: (scope: Lesson['scope'], id: string | null) => string | null, max = 40) {
  const ok = lessons.filter((l) => l.status === 'confirmed').sort((a, b) => (a.scope === b.scope ? b.created_at.localeCompare(a.created_at) : a.scope === 'company' ? -1 : b.scope === 'company' ? 1 : a.scope.localeCompare(b.scope))).slice(0, max);
  if (!ok.length) return '';
  return ok.map((l) => { const who = l.scope === 'company' ? 'All work' : nameOf(l.scope, l.scope_id) || l.scope; return `- ${who}: ${l.text.replace(/\s+/g, ' ').trim().slice(0, 300)}`; }).join('\n');
}

export type Work = 'chat' | 'inbound' | 'event_brief' | 'sweep' | 'morning' | 'conflicts' | 'compliance' | 'first_briefs';
const ESSENTIAL: Work[] = ['chat', 'inbound', 'event_brief'];

export function capAllows(work: Work, spentToday: number, cap: number | null | undefined) {
  if (!cap || cap <= 0) return true;
  if (ESSENTIAL.includes(work)) return true;
  return spentToday < cap;
}
