'use server';
import { requireTenant } from '@/lib/tenant';
import { runAgent } from '@/lib/agents/run';
import { ingestInbound, processInbound } from '@/lib/agents/inbound';
import { hasLlm } from '@/lib/llm';
import { supabaseAdmin } from '@/lib/supabase/server';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };
export type AskResult = { text: string; calls: { name: string; ok: boolean; ms: number }[]; drafts: number; error?: string };

// Chat with the company's agent. The person's identity goes into the prompt and the ledger actor.
export async function askAgent(slug: string, history: ChatTurn[], question: string, lang: string): Promise<AskResult> {
  const { tenant, membership, user } = await requireTenant(slug);
  if (!hasLlm()) return { text: '', calls: [], drafts: 0, error: 'ANTHROPIC_API_KEY is not set in the Vercel project.' };
  const messages = [...history.slice(-12).map((h) => ({ role: h.role, content: h.text })), { role: 'user' as const, content: question }];
  const r = await runAgent({ tenantId: tenant.id, trigger: 'chat', userId: user.id, userName: membership.display_name || user.email, userEmail: user.email, userLang: lang, messages });
  return { text: r.text, calls: r.calls.map((c) => ({ name: c.name, ok: c.ok, ms: c.ms })), drafts: r.drafts.length, error: r.error };
}

export type SimResult = { ok: boolean; summary?: string; drafts?: number; partyId?: string | null; orderId?: string | null; stream?: string; error?: string };

// Run the inbound pipeline on a pasted message, synchronously, so the person sees the result now.
export async function simulateInbound(slug: string, f: { from: string; partyId: string; channel: string; subject: string; text: string }): Promise<SimResult> {
  const { tenant } = await requireTenant(slug);
  if (!hasLlm()) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in the Vercel project.' };
  if (!f.text.trim()) return { ok: false, error: 'Message is empty' };
  try {
    const sb = supabaseAdmin();
    const { data: p } = f.partyId ? await sb.from('parties').select('id, name').eq('tenant_id', tenant.id).eq('id', f.partyId).maybeSingle() : { data: null };
    const id = await ingestInbound({ tenantId: tenant.id, channelKind: f.channel, from: f.from.trim() || p?.name || 'unknown', senderName: f.from.trim() || null, partyId: p?.id || null, subject: f.subject.trim() || null, text: f.text.trim(), raw: { simulated: true } }, { enqueue: false });
    const r = await processInbound(id);
    return { ok: !('skipped' in r), summary: 'summary' in r ? r.summary : undefined, drafts: 'drafts' in r ? (r.drafts || []).length : 0, partyId: 'partyId' in r ? r.partyId : null, orderId: 'orderId' in r ? r.orderId : null, stream: 'stream' in r ? r.stream : undefined, error: 'error' in r ? r.error : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
