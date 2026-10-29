// Loads the sample world into a company (admin console action). Idempotent per
// company: refuses when the company already has orders.
import { supabaseAdmin } from '@/lib/supabase/server';
import { MILESTONES, GAP, TRANSIT, OWNERS, isoOf, today, type MilestoneKey } from '@/lib/core/path';
import { SAMPLE_BRANDS, SAMPLE_SUPPLIERS, SAMPLE_LINES, SAMPLE_STORY, POL, POD } from './meridian';
import { seedSampleInbound } from '@/lib/agents/proactive';
import { loadSampleThreads } from './threads-load';

export async function loadSample(tenantId: string, byUser: string, byEmail: string) {
  const sb = supabaseAdmin();
  const { count } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (count) return { ok: false, error: 'This company already has orders; sample data is only loaded into an empty company.' };
  const T = today();

  // Bulk inserts send null for any key a row lacks (not the column default), so both shapes carry the same keys.
  const brandRows = SAMPLE_BRANDS.map((b) => ({ tenant_id: tenantId, kind: 'brand', name: b.name, short: b.name, country: b.country, city: null, tier: null, lang: b.lang, channel_pref: b.channel, policy: b.policy, score: {}, meta: { code: b.code, segment: b.segment, sample: true } }));
  const supRows = SAMPLE_SUPPLIERS.map((s) => ({ tenant_id: tenantId, kind: s.tier === 1 ? 'factory' : s.tier === 2 ? 'mill' : 'fibre', name: s.name, short: s.short, country: s.country, city: s.city, tier: s.tier, lang: s.lang, channel_pref: s.channel, policy: {}, score: s.score, meta: { code: s.code, type: s.type, verified: !('unverified' in s), sample: true } }));
  const { data: parties, error: pe } = await sb.from('parties').insert([...brandRows, ...supRows]).select('id, meta');
  if (pe || !parties) return { ok: false, error: pe?.message || 'parties failed' };
  const idOf = Object.fromEntries(parties.map((p) => [(p.meta as { code: string }).code, p.id]));
  const contacts = SAMPLE_SUPPLIERS.filter((s) => s.contact).map((s) => ({ tenant_id: tenantId, party_id: idOf[s.code], name: s.contact as string, role: 'Merchandising', lang: s.lang, is_primary: true }));
  await sb.from('contacts').insert(contacts);

  const orderRows = SAMPLE_LINES.map((l) => {
    const [brand, factory, mill, fibre, po, style, desc, category, composition, qty, fob, etdOff] = l;
    const country = SAMPLE_SUPPLIERS.find((s) => s.code === factory)!.country;
    const transit = TRANSIT[country] ?? 30;
    const kids = category === 'Baby' || category === 'Kids';
    const sizeKeys = category === 'Baby' ? ['0-3m', '3-6m', '6-12m', '12-18m', '18-24m'] : kids ? ['3-4y', '5-6y', '7-8y', '9-10y', '11-12y'] : ['XS', 'S', 'M', 'L', 'XL'];
    const ratio = [0.1, 0.22, 0.32, 0.24, 0.12];
    const sizes = Object.fromEntries(sizeKeys.map((s, j) => [s, Math.round(qty * ratio[j] / 10) * 10]));
    return { tenant_id: tenantId, po, customer_id: idOf[brand], factory_id: idOf[factory], mill_id: idOf[mill], fibre_id: idOf[fibre], style, description: desc, category, composition, qty, sizes, colours: ['Black', 'Navy', 'Stone'].slice(0, 1 + (qty % 3)), fob, currency: 'USD', incoterm: brand === 'OK' ? 'FOB, LC at sight' : 'FOB', pol: POL[country], pod: POD[brand], instore_date: isoOf(T + etdOff + transit + 14), season: 'SS27', status: etdOff < -3 ? 'shipped' : 'open', source: 'sample', meta: { sample: true, etdOff, transit } };
  });
  const { data: orders, error: oe } = await sb.from('orders').insert(orderRows).select('id, po, meta');
  if (oe || !orders) return { ok: false, error: oe?.message || 'orders failed' };

  const ms: object[] = [];
  for (const o of orders) {
    const { etdOff, transit } = o.meta as { etdOff: number; transit: number };
    const story = SAMPLE_STORY[o.po] || {};
    for (const k of MILESTONES) {
      const planOff = k === 'eta' ? etdOff + transit : etdOff + GAP[k as Exclude<MilestoneKey, 'eta'>];
      const s = story[k] || {};
      const row: Record<string, unknown> = { tenant_id: tenantId, order_id: o.id, key: k, owner_kind: OWNERS[k], plan_date: isoOf(T + planOff) };
      if (s.expected !== undefined) row.expected_date = isoOf(T + s.expected);
      else if (!s.late && planOff <= -1) row.actual_date = isoOf(T + planOff);
      ms.push(row);
    }
  }
  const { error: me } = await sb.from('milestones').insert(ms);
  if (me) return { ok: false, error: me.message };
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Console', p_actor: `VIA admin (${byEmail})`, p_actor_user: byUser, p_counterparty: null, p_stream: 'Setup', p_order: null, p_what: `Sample data loaded: ${brandRows.length} customers, ${supRows.length} suppliers, ${orders.length} POs`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  // Messages start arriving and the agent gets its first pass; both run from the minute tick.
  try { await loadSampleThreads(tenantId, byEmail); await seedSampleInbound(tenantId); } catch { /* the loader succeeded; the agent side is best effort */ }
  return { ok: true, orders: orders.length };
}
