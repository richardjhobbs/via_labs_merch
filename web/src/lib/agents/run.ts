// The agent loop: Claude Sonnet with the company's tools, logged to agent_runs and usage_daily.
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, SMALL_MODEL, costOf, recordUsage } from '@/lib/llm';

const ALLOWED = [MODEL, SMALL_MODEL];
import { supabaseAdmin } from '@/lib/supabase/server';
import { toolsFor, type AgentCtx, type DraftRef } from './tools';
import { LANG_NAMES } from '@/lib/llm';
import { streamsOf, type Track } from '@/lib/tracks';

export type RunInput = {
  tenantId: string; trigger: AgentCtx['trigger'];
  track?: Track;                     // development or production; production when omitted
  userId?: string | null; userName?: string | null; userEmail?: string | null; userLang?: string;
  role?: string | null; scope?: string[] | null;
  messages: Anthropic.Beta.BetaMessageParam[];
  sourceMessageId?: string | null;
  extraSystem?: string;
};

export type RunResult = { text: string; calls: AgentCtx['calls']; drafts: DraftRef[]; nav: AgentCtx['nav']; runId: string | null; usage: { tokensIn: number; tokensOut: number; cost: number }; error?: string };

export async function runAgent(input: RunInput): Promise<RunResult> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const track: Track = input.track || 'production';
  const [{ data: tenant }, { data: agents }, { data: parties }, { data: gates }] = await Promise.all([
    sb.from('tenants').select('id, name, kind, locale, tz, currency').eq('id', input.tenantId).single(),
    sb.from('agents').select('id, name, model, languages, prompt_overrides, track').eq('tenant_id', input.tenantId).eq('scope_kind', 'tenant').eq('enabled', true).order('created_at'),
    sb.from('parties').select('id, name, short, kind, country, lang, channel_pref, tier, meta').eq('tenant_id', input.tenantId).is('archived_at', null).order('kind').order('name'),
    sb.from('gates').select('stream, level, locked').eq('tenant_id', input.tenantId).eq('track', track).order('stream'),
  ]);
  if (!tenant) throw new Error('tenant not found');
  // one agent per track when the company has set one up; otherwise the company agent runs both tracks
  const agent = (agents || []).find((a) => a.track === track) || (agents || []).find((a) => a.track === 'production') || (agents || [])[0] || null;
  const ctx: AgentCtx = { tenantId: tenant.id, agentId: agent?.id || null, agentName: agent?.name || 'Mira', track, trigger: input.trigger, userId: input.userId || null, userName: input.userName || null, userEmail: input.userEmail || null, sourceMessageId: input.sourceMessageId || null, role: input.role || null, scope: input.scope || null, calls: [], drafts: [], nav: null };

  const customers = (parties || []).filter((p) => ['brand', 'retailer', 'store', 'buying_office', 'trading'].includes(p.kind)).map((p) => `${(p.meta as { code?: string })?.code || p.short || p.name}=${p.name} (${p.kind}, ${p.country || '?'}, writes in ${p.lang})`).join('; ');
  const suppliers = (parties || []).filter((p) => ['factory', 'mill', 'fibre', 'forwarder', 'carrier', 'lab', 'auditor', 'sample_room', 'designer', 'trim_supplier'].includes(p.kind)).map((p) => `${(p.meta as { code?: string })?.code || p.short || p.name}=${p.name} (T${p.tier ?? '?'} ${p.kind}, ${p.country || '?'}, ${p.channel_pref || 'email'}, ${p.lang})`).join('; ');
  const gateLine = (gates || []).map((g) => `${g.stream} L${g.level}${g.locked != null ? ` (capped L${g.locked})` : ''}`).join('; ');
  const KIND: Record<string, string> = { buying_office: 'buying office', brand: 'brand', factory: 'garment factory', trading: 'trading company', retailer: 'retailer' };
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tenant.tz || 'UTC' });

  // Stable part first (cached), the date and person after.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', cache_control: { type: 'ephemeral' }, text: `You are ${ctx.agentName}, the merchandising agent on VIA Merch working for ${tenant.name}, a ${KIND[tenant.kind] || tenant.kind}.
Customers: ${customers || 'none yet'}.
Suppliers: ${suppliers || 'none yet'}.
${track === 'development' ? `Track: DEVELOPMENT. You work on styles before a PO exists: design briefs, tech packs and specs, materials and trims, sample schedules and rounds, costing. The anchor is the style (code, season, customer), not a PO; use search_styles, get_style, get_style_file, diff_tech_pack, get_samples, get_materials and get_schedule, and pass style= on queue_draft. record_sample_event records a sent, received or due date a maker or person states; never a decision. Streams on this track: ${streamsOf(track).join(', ')}.
Development rules: a sample approval, approval with comments or rejection is always a person's decision; you may report a customer's stated decision as theirs, never make one. Tech pack versions count only once a person has confirmed them in the workspace. When a new version arrives, say what changed (diff_tech_pack). Translate construction notes and comments for factories faithfully, keeping POM codes, measurements, tolerances and material names exactly; keep tables as data, not prose. Reference earlier versions and rounds by number.` : `Track: PRODUCTION. You work from the PO on: the critical path, WIP, QC, logistics, claims. Streams on this track: ${streamsOf(track).join(', ')}. Styles in development are visible through search_styles and get_style when a PO refers to one.`}
Autonomy by stream on this track (L0 record only, L1 draft and a person sends, L2 routine messages may be approved by you, L3 act within limits): ${gateLine}.
Rules:
- Use the tools to read the live record before answering. Never invent numbers, dates, names or PO numbers.
- You draft; people send. queue_draft creates a draft in the approval queue; request_approval only approves it yourself on an L2+ uncapped stream. Never say a message was sent.
- Price, quantities, dates promised to a customer, order confirmations and claims always wait for a person.
- When a person dictates or asks for a message, call queue_draft, then say it is in the queue. When a supplier or customer reports a clear new date for a milestone, record it with set_milestone and say what moved downstream.
- Reply in the language the person writes in. Messages to a party in another language go in their language with an English rendering in body_en.
- Be brief and concrete: short sentences, dates, PO numbers, ${tenant.currency || 'USD'}. One recommendation. British English. No markdown headings; at most 4 bullets.
- VIA sits on top of the company's existing tools (email, WhatsApp, spreadsheets, ERP, PLM, portals, forwarders) and replaces none of them.
- Costing: margin means the exporter's margin on FOB. Retail is a reference price only.${agent?.prompt_overrides ? `\n${agent.prompt_overrides}` : ''}` },
    { type: 'text', text: `Today is ${today} (${tenant.tz}).${input.userName ? ` You are talking with ${input.userName}${input.role ? ` (${input.role})` : ''}${input.userLang ? `, whose interface language is ${LANG_NAMES[input.userLang] || input.userLang}` : ''}.${input.scope ? ` They handle these customers only: ${(parties || []).filter((p) => input.scope!.includes((p as unknown as { id?: string }).id || '')).map((p) => p.name).join(', ') || 'see tools'}; the tools are already limited to them.` : ['owner', 'manager'].includes(input.role || '') ? ' They manage the whole team: use get_team for team questions.' : ''}` : ''}${input.extraSystem ? `\n${input.extraSystem}` : ''}` },
  ];

  const client = anthropic();
  let tokensIn = 0, tokensOut = 0, text = '', error: string | undefined;
  try {
    const runner = client.beta.messages.toolRunner({
      // Testing phase: Sonnet or Haiku only (no server-side fallback, which could route to Opus).
      model: ALLOWED.includes(agent?.model || '') ? agent!.model : MODEL,
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      system,
      tools: toolsFor(ctx),
      messages: input.messages,
      max_iterations: 10,
    });
    let last: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      last = message;
      tokensIn += message.usage.input_tokens + (message.usage.cache_read_input_tokens || 0) + (message.usage.cache_creation_input_tokens || 0);
      tokensOut += message.usage.output_tokens;
    }
    if (last?.stop_reason === 'refusal') error = 'The model declined this request.';
    text = (last?.content || []).filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const model = ALLOWED.includes(agent?.model || '') ? agent!.model : MODEL;
  const cost = costOf(model, tokensIn, tokensOut);
  const { data: run } = await sb.from('agent_runs').insert({ tenant_id: tenant.id, agent_id: ctx.agentId, user_id: ctx.userId, trigger: input.trigger, model, input: { track, messages: input.messages.slice(-2) }, tools_called: ctx.calls, output: text || null, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost, ms: Date.now() - t0, error: error || null }).select('id').single();
  await recordUsage(tenant.id, { runs: 1, tokensIn, tokensOut, cost });
  return { text, calls: ctx.calls, drafts: ctx.drafts, nav: ctx.nav, runId: run?.id || null, usage: { tokensIn, tokensOut, cost }, error };
}
