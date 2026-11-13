// One door to the models. Claude (Sonnet) runs the agent loop and drafting;
// DeepSeek does bulk translation and classification when its key is set, else Claude Haiku.
// Every call's tokens and cost are added to merch.usage_daily by the caller via recordUsage().
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';

export const MODEL = 'claude-sonnet-5-5';
export const SMALL_MODEL = 'claude-haiku-5-5';
// USD per million tokens [in, out]
const PRICE: Record<string, [number, number]> = { 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'deepseek-chat': [0.28, 0.42] };

export function hasLlm() { return !!process.env.ANTHROPIC_API_KEY; }

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in the Vercel project (Settings → Environment Variables), so the agents cannot run yet.');
  return new Anthropic();
}

export function costOf(model: string, tokensIn: number, tokensOut: number) {
  const [i, o] = PRICE[model] || [2, 10];
  return (tokensIn * i + tokensOut * o) / 1e6;
}

// Input read from the prompt cache bills at a tenth of the input price and a cache write at 1.25 times it
// (5-minute cache); thinking bills as output. Use this wherever the response reports cache tokens.
export function costOfUsage(model: string, u: { input: number; cacheRead: number; cacheWrite: number; output: number }) {
  const [i, o] = PRICE[model] || [2, 10];
  return (u.input * i + u.cacheRead * i * 0.1 + u.cacheWrite * i * 1.25 + u.output * o) / 1e6;
}

export async function recordUsage(tenantId: string, u: { runs?: number; messagesIn?: number; messagesOut?: number; tokensIn?: number; tokensOut?: number; cost?: number }) {
  await supabaseAdmin().rpc('usage_add', { p_tenant: tenantId, p_runs: u.runs || 0, p_in: u.messagesIn || 0, p_out: u.messagesOut || 0, p_tokens_in: u.tokensIn || 0, p_tokens_out: u.tokensOut || 0, p_cost: u.cost || 0 });
}

// Model input: text, or content blocks for a PDF or photo.
export type DocumentInput = string | Anthropic.ContentBlockParam[];
export type Usage = { model: string; tokensIn: number; tokensOut: number; cost: number };

// Structured extraction with a Zod schema (language detection, classification, parsing).
export async function extract<T extends z.ZodType>(schema: T, system: string, user: DocumentInput, opts: { model?: string; maxTokens?: number } = {}): Promise<{ data: z.infer<T> | null; usage: Usage }> {
  const model = opts.model || SMALL_MODEL;
  const r = await anthropic().messages.parse({ model, max_tokens: opts.maxTokens || 4096, output_config: { effort: 'low', format: zodOutputFormat(schema) }, system, messages: [{ role: 'user', content: user }] });
  const tokensIn = r.usage.input_tokens, tokensOut = r.usage.output_tokens;
  return { data: (r.parsed_output as z.infer<T> | null) ?? null, usage: { model, tokensIn, tokensOut, cost: costOf(model, tokensIn, tokensOut) } };
}

// Translation: DeepSeek when configured (cheap, strong on zh/vi/bn), otherwise Claude Haiku.
export async function translate(text: string, to: string, from?: string): Promise<{ text: string; usage: Usage }> {
  const sys = `Translate the message into ${LANG_NAMES[to] || to}${from ? ` from ${LANG_NAMES[from] || from}` : ''}. Keep PO numbers, style codes, figures, dates and company names exactly as they are. Return only the translation.`;
  if (process.env.DEEPSEEK_API_KEY) {
    const res = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.2 }) });
    if (res.ok) {
      const j = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      const tokensIn = j.usage?.prompt_tokens || 0, tokensOut = j.usage?.completion_tokens || 0;
      return { text: j.choices[0]?.message?.content?.trim() || text, usage: { model: 'deepseek-chat', tokensIn, tokensOut, cost: costOf('deepseek-chat', tokensIn, tokensOut) } };
    }
  }
  const r = await anthropic().messages.create({ model: SMALL_MODEL, max_tokens: 4096, output_config: { effort: 'low' }, system: sys, messages: [{ role: 'user', content: text }] });
  const out = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { text: out || text, usage: { model: SMALL_MODEL, tokensIn: r.usage.input_tokens, tokensOut: r.usage.output_tokens, cost: costOf(SMALL_MODEL, r.usage.input_tokens, r.usage.output_tokens) } };
}

export const LANG_NAMES: Record<string, string> = { en: 'English', de: 'German', bn: 'Bangla', zh: 'Chinese (Simplified)', vi: 'Vietnamese', es: 'Spanish', tr: 'Turkish', pt: 'Portuguese', ur: 'Urdu', ta: 'Tamil', hi: 'Hindi', fr: 'French', it: 'Italian' };

// DeepSeek with tools, for agents that run on it (the support desk): the same runnable tools the Claude tool
// runner takes (name, description, input_schema, parse, run), driven through OpenAI-compatible tool calling.
// Text only: DeepSeek's chat model does not read images.
export const DEEPSEEK_MODEL = 'deepseek-chat';
export function hasDeepseek() { return !!process.env.DEEPSEEK_API_KEY; }
export type LoopTool = { name: string; description?: string; input_schema: unknown; parse: (args: unknown) => unknown; run: (args: never) => unknown };
type DsMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };

export async function deepseekToolLoop(opts: { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; tools: LoopTool[]; maxIterations?: number; maxTokens?: number }): Promise<{ text: string; usage: Usage; error?: string }> {
  const msgs: DsMessage[] = [{ role: 'system', content: opts.system }, ...opts.messages];
  const tools = opts.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description || '', parameters: t.input_schema } }));
  let tokensIn = 0, tokensOut = 0, text = '', error: string | undefined;
  const usage = () => ({ model: DEEPSEEK_MODEL, tokensIn, tokensOut, cost: costOf(DEEPSEEK_MODEL, tokensIn, tokensOut) });
  for (let i = 0; i < (opts.maxIterations || 6); i++) {
    const res = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: msgs, tools, temperature: 0.3, max_tokens: opts.maxTokens || 4000 }) });
    if (!res.ok) { error = `deepseek ${res.status} ${(await res.text()).slice(0, 200)}`; break; }
    const j = await res.json() as { choices: { message: DsMessage; finish_reason: string }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    tokensIn += j.usage?.prompt_tokens || 0; tokensOut += j.usage?.completion_tokens || 0;
    const m = j.choices[0]?.message;
    if (!m) { error = 'deepseek returned no message'; break; }
    if (!m.tool_calls?.length) { text = (m.content || '').trim(); if (j.choices[0].finish_reason === 'length') error = 'Cut off at the output limit before finishing.'; break; }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls });
    for (const c of m.tool_calls) {
      const t = opts.tools.find((x) => x.name === c.function.name);
      let out: string;
      if (!t) out = JSON.stringify({ error: `no tool called ${c.function.name}` });
      else {
        try { out = String(await t.run(t.parse(JSON.parse(c.function.arguments || '{}')) as never)); }
        catch (e) { out = JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
      }
      msgs.push({ role: 'tool', tool_call_id: c.id, content: out });
    }
    if (i === (opts.maxIterations || 6) - 1) error = 'Stopped after too many tool steps.';
  }
  return { text, usage: usage(), error };
}
