'use server';
import { requireTenant } from '@/lib/tenant';
import { ingestInbound, processInbound } from '@/lib/agents/inbound';
import { hasLlm } from '@/lib/llm';
import { supabaseAdmin } from '@/lib/supabase/server';

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
