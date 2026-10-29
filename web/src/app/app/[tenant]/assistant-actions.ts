'use server';
// The assistant panel's server actions: ask the company's agent, decide a draft it queued.
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { runAgent } from '@/lib/agents/run';
import { hasLlm } from '@/lib/llm';
import { decideDraft } from '@/lib/drafts';
import type { DraftRef } from '@/lib/agents/tools';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };
export type AskResult = { text: string; calls: { name: string; ok: boolean; ms: number }[]; drafts: DraftRef[]; nav: { screen: string; id?: string } | null; error?: string };

export async function askAgent(slug: string, history: ChatTurn[], question: string, lang: string, page: string): Promise<AskResult> {
  const { tenant, membership, user } = await requireTenant(slug);
  if (!hasLlm()) return { text: '', calls: [], drafts: [], nav: null, error: 'ANTHROPIC_API_KEY is not set in the Vercel project.' };
  const messages = [...history.slice(-12).map((h) => ({ role: h.role, content: h.text })), { role: 'user' as const, content: question }];
  const r = await runAgent({ tenantId: tenant.id, trigger: 'chat', userId: user.id, userName: membership.display_name || user.email, userEmail: user.email, userLang: lang, messages, extraSystem: `The person is looking at: ${page}.` });
  if (r.drafts.length) { revalidatePath(`/app/${slug}/queue`); revalidatePath(`/app/${slug}`); }
  return { text: r.text, calls: r.calls.map((c) => ({ name: c.name, ok: c.ok, ms: c.ms })), drafts: r.drafts, nav: r.nav, error: r.error };
}

export async function decideFromAssistant(slug: string, id: string, status: 'approved' | 'rejected') {
  const me = await requireTenant(slug);
  const r = await decideDraft(me, id, status);
  revalidatePath(`/app/${slug}/queue`); revalidatePath(`/app/${slug}`); revalidatePath(`/app/${slug}/ledger`);
  return r;
}
