// VIA Labs console: updates for the support desk. Write a draft, choose who it is for, publish. A published
// update is fixed; to change it, take it back to draft (people stop seeing it), edit, and publish again.
import { supabaseAdmin } from '@/lib/supabase/server';
import { FEATURES } from '@/lib/features';
import type { Audience } from '@/lib/helpdesk/updates-rules';
import { publishUpdate, saveUpdate, withdrawUpdate } from './actions';

export const maxDuration = 60;

type Row = { id: string; number: number; title: string; body: string; audience: Audience; status: string; translations: Record<string, unknown>; published_at: string | null; published_by_email: string | null; proposal_id: string | null; change_proposals: { number: number } | null };

export default async function Updates({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: rows }, { data: tenants }] = await Promise.all([
    sb.from('announcements').select('id, number, title, body, audience, status, translations, published_at, published_by_email, proposal_id, change_proposals(number)').order('created_at', { ascending: false }).limit(100),
    sb.from('tenants').select('id, name').order('name'),
  ]);
  const list = (rows || []) as unknown as Row[];
  const names = new Map((tenants || []).map((t) => [t.id, t.name]));
  const audienceValue = (a: Audience) => (a.kind === 'all' || a.kind === 'tenants' ? a.kind : `${a.kind}:${a.key}`);
  const audienceLabel = (a: Audience) => a.kind === 'all' ? 'Everyone' : a.kind === 'tenants' ? a.ids.map((i) => names.get(i) || '?').join(', ') : a.kind === 'addon' ? `Add-on: ${a.key}` : a.kind === 'track' ? `Track: ${a.key}` : `Feature: ${a.key}`;
  const form = (r?: Row) => (
    <form action={saveUpdate} className="grid gap-2">
      {r && <input type="hidden" name="id" value={r.id} />}
      <input className="input" name="title" maxLength={160} required placeholder="Title, in English" defaultValue={r?.title} />
      <textarea className="input" name="body" rows={5} maxLength={6000} required placeholder="What changed and what people do with it, in English. Plain text. It is translated when you publish." defaultValue={r?.body} />
      <div className="flex flex-wrap items-start gap-2">
        <select className="input" name="audience" defaultValue={r ? audienceValue(r.audience) : 'all'} style={{ width: 'auto' }}>
          <option value="all">Everyone</option>
          <option value="addon:esg">Companies with ESG and compliance (others see it as available on request)</option>
          <option value="track:development">Companies with the development track (others: on request)</option>
          {FEATURES.map((f) => <option key={f.key} value={`feature:${f.key}`}>Feature: {f.name} (others: on request)</option>)}
          <option value="tenants">Only the companies ticked here</option>
        </select>
        <input className="input" name="proposal" placeholder="Proposal no. (optional)" defaultValue={r?.change_proposals?.number ? `P${r.change_proposals.number}` : ''} style={{ width: 190 }} />
      </div>
      <details open={r?.audience.kind === 'tenants'}><summary className="small" style={{ cursor: 'pointer' }}>Companies (used only with the last option above)</summary>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 small">{(tenants || []).map((t) => <label key={t.id} className="flex items-center gap-1"><input type="checkbox" name="tenant_ids" value={t.id} defaultChecked={r?.audience.kind === 'tenants' && r.audience.ids.includes(t.id)} />{t.name}</label>)}</div>
      </details>
      <div><button className="btn sm">{r ? 'Save draft' : 'Create draft'}</button></div>
    </form>
  );
  const drafts = list.filter((r) => r.status === 'draft'), live = list.filter((r) => r.status === 'published'), gone = list.filter((r) => r.status === 'withdrawn');
  const head = (s: string) => <div className="small font-medium muted mt-8" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{s}</div>;
  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Updates</h1>
      <p className="muted small mt-2">What people see under Updates on the support desk. Nothing is shown until you publish it.</p>
      {saved && <div className="notice mt-3">{saved === '1' ? 'Saved.' : saved}</div>}
      {error && <div className="notice crit mt-3">{error}</div>}
      <div className="card mt-4"><h2 style={{ fontSize: 15 }} className="mb-3">New update</h2>{form()}</div>

      {head(`Drafts (${drafts.length})`)}
      <div className="grid gap-3 mt-3">{drafts.map((r) => (
        <div key={r.id} className="card">
          <div className="muted small mb-2">U{r.number} · {audienceLabel(r.audience)}</div>
          {form(r)}
          <form action={publishUpdate} className="mt-3 flex items-center gap-2"><input type="hidden" name="id" value={r.id} /><button className="btn primary sm">Publish</button><span className="muted small">Save first if you edited. Publishing translates it and shows it to: {audienceLabel(r.audience)}.</span></form>
        </div>
      ))}{!drafts.length && <div className="muted small">None.</div>}</div>

      {head(`Published (${live.length})`)}
      <div className="grid gap-3 mt-3">{live.map((r) => (
        <div key={r.id} className="card">
          <div className="flex flex-wrap items-baseline gap-x-3"><span className="mono muted">U{r.number}</span><b>{r.title}</b><span className="pill">{audienceLabel(r.audience)}</span>
            <span className="muted small ml-auto">{r.published_at ? new Date(r.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {r.published_by_email} · {Object.keys(r.translations || {}).length + 1} languages</span></div>
          <p className="small mt-2" style={{ whiteSpace: 'pre-wrap', color: 'var(--fg2)' }}>{r.body}</p>
          <div className="flex gap-2 mt-3">
            <form action={withdrawUpdate}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value="draft" /><button className="btn sm">Back to draft</button></form>
            <form action={withdrawUpdate}><input type="hidden" name="id" value={r.id} /><button className="btn sm red">Withdraw</button></form>
          </div>
        </div>
      ))}{!live.length && <div className="muted small">None.</div>}</div>

      {!!gone.length && <>{head('Withdrawn')}<div className="grid gap-1 mt-3 small">{gone.map((r) => <form key={r.id} action={withdrawUpdate} className="flex items-center gap-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="to" value="draft" /><span className="mono muted">U{r.number}</span> {r.title} <button className="btn sm ml-auto">Back to draft</button></form>)}</div></>}
    </div>
  );
}
