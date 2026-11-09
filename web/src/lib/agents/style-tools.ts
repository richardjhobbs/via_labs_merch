// Development track tools: styles, tech pack versions and the style file. Read-only except nothing:
// sample decisions, tech pack confirmation and style status are a person's actions in the workspace, so
// the agent has no tool that writes them. Drafting to a party goes through queue_draft with `style`.
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { listStyles, styleByCode, getStyle, styleBrief, styleFile, styleSignals } from '@/lib/styles';
import { styleRecords, techPackVersions, diffTechPack } from '@/lib/records';
import { partyByRef, type AgentCtx } from './tools';

const brief = (s: Awaited<ReturnType<typeof listStyles>>[number]) => ({ id: s.id, code: s.code, name: s.name, season: s.season, category: s.category, status: s.status, customer: s.customer?.name, target_price: s.target_price, currency: s.currency, target_delivery: s.target_delivery, plm_ref: s.plm_ref, updated_at: s.updated_at });

export function styleTools(ctx: AgentCtx, wrap: <I, O>(name: string, fn: (i: I) => Promise<O>) => (i: I) => Promise<string>) {
  const sb = supabaseAdmin(), T = ctx.tenantId;
  const resolve = async (ref: string) => (/^[0-9a-f-]{36}$/i.test(ref.trim()) ? getStyle(T, ref.trim(), sb) : styleByCode(T, ref, sb));

  const search_styles = betaZodTool({
    name: 'search_styles',
    description: 'Development track: list styles in development with customer, season, status (brief, developing, sampling, costing, adopted, handed_over, dropped), the latest confirmed tech pack version and records awaiting a check. Filter by free text, customer, season or status.',
    inputSchema: z.object({ query: z.string().optional().describe('style code, name or description text'), customer: z.string().optional(), season: z.string().optional(), status: z.string().optional() }),
    run: wrap('search_styles', async (a) => {
      let L = await listStyles(T, { customers: ctx.scope, status: a.status, season: a.season }, sb);
      const q = (a.query || '').toLowerCase();
      if (q) L = L.filter((s) => `${s.code} ${s.name || ''} ${s.description || ''} ${s.category || ''}`.toLowerCase().includes(q));
      if (a.customer) { const p = await partyByRef(T, a.customer); L = L.filter((s) => s.customer?.id === p?.id || (s.customer?.name || '').toLowerCase().includes(a.customer!.toLowerCase())); }
      L = L.slice(0, 40);
      const sig = await styleSignals(T, L.map((s) => s.id), sb);
      return L.map((s) => ({ ...brief(s), tech_pack_version: sig.get(s.id)?.techPack?.version ?? null, records_awaiting_check: sig.get(s.id)?.pending ?? 0 }));
    }),
  });

  const get_style = betaZodTool({
    name: 'get_style',
    description: 'Development track: one style in full: the record, the latest confirmed tech pack (fabric, BOM, colourways, points of measure with tolerances, construction notes, labelling, packaging, testing), every tech pack version, and other records (briefs, photos, comments) with whether a person has confirmed them.',
    inputSchema: z.object({ style: z.string().describe('style code as the customer writes it, or the style id') }),
    run: wrap('get_style', async ({ style }) => {
      const s = await resolve(style);
      if (!s) return { error: `No style matching "${style}"` };
      if (ctx.scope && s.customer && !ctx.scope.includes(s.customer.id)) return { error: 'This style belongs to a customer outside your scope.' };
      const b = await styleBrief(T, s.id);
      if (!b) return { error: 'not found' };
      const tp = b.techPack?.parsed || null;
      return { ...brief(s), description: s.description, tech_pack: tp ? { version: b.techPack!.version, label: tp.version_label, date: tp.date, lang: tp.lang, fabric: tp.fabric_summary, sizes: tp.sizes, colourways: tp.colourways, bom: tp.bom, poms: tp.poms, construction: tp.construction, labelling: tp.labelling, packaging: tp.packaging, testing: tp.testing, notes: tp.notes, translations: Object.keys(tp.translations || {}) } : null, tech_pack_versions: b.techPackVersions, other_records: b.records };
    }),
  });

  const get_style_file = betaZodTool({
    name: 'get_style_file',
    description: 'Development track: every conversation on a style with the customer\'s design, tech and buying people, the mills, the sample room and the factory, who said what and when. Use for "where are we with the customer on 2201", "what did the mill say about the swatch".',
    inputSchema: z.object({ style: z.string() }),
    run: wrap('get_style_file', async ({ style }) => {
      const s = await resolve(style);
      if (!s) return { error: `No style matching "${style}"` };
      const file = await styleFile(T, s.id);
      return { style: s.code, customer: s.customer?.name, threads: file.map((t) => ({ party: t.party?.name, kind: t.party?.kind, subject: t.subject, channel: t.channel, summary: t.summary, messages: t.messages.slice(-12) })) };
    }),
  });

  const diff_tech_pack = betaZodTool({
    name: 'diff_tech_pack',
    description: 'Development track: what changed between two confirmed tech pack versions of a style (BOM lines, points of measure and tolerances, colourways, construction notes, fabric, sizes, labelling, packaging, price, delivery). Defaults to the latest version against the one before it.',
    inputSchema: z.object({ style: z.string(), from_version: z.number().int().optional(), to_version: z.number().int().optional() }),
    run: wrap('diff_tech_pack', async (a) => {
      const s = await resolve(a.style);
      if (!s) return { error: `No style matching "${a.style}"` };
      const tps = techPackVersions(await styleRecords(sb, T, s.id));
      if (tps.length < 2 && a.from_version == null) return { error: 'Only one confirmed tech pack version so far.', versions: tps.map((r) => r.version) };
      const to = a.to_version != null ? tps.find((r) => r.version === a.to_version) : tps[0];
      const from = a.from_version != null ? tps.find((r) => r.version === a.from_version) : tps[1];
      if (!to || !from) return { error: 'No such version', versions: tps.map((r) => r.version) };
      return { style: s.code, from: { version: from.version, label: from.parsed?.version_label, confirmed_at: from.confirmed_at }, to: { version: to.version, label: to.parsed?.version_label, confirmed_at: to.confirmed_at }, changes: diffTechPack(from.parsed, to.parsed) };
    }),
  });

  return [search_styles, get_style, get_style_file, diff_tech_pack];
}
