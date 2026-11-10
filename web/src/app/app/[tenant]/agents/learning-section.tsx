// Agents page, learning: lessons the agents proposed from people's corrections (used only once confirmed),
// the company library the agents search, and the daily spending limit.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { decideLesson, addDoc, deleteDoc, setCap } from './learning-actions';
import { localDay } from '@/lib/work-hours';

const CUSTOMER = ['brand', 'retailer', 'store', 'buying_office', 'trading'];

export async function LearningSection({ slug, tenantId, role, tz }: { slug: string; tenantId: string; role: string; tz: string }) {
  const t = await getTranslations('agents.learn');
  const sb = await supabaseServer();
  const [{ data: lessons }, { data: docs }, { data: parties }, { data: tn }, { data: usage }] = await Promise.all([
    sb.from('agent_lessons').select('id, scope, scope_id, text, status, created_at, decided_at, drafts(seq)').eq('tenant_id', tenantId).in('status', ['proposed', 'confirmed']).order('created_at', { ascending: false }).limit(60),
    sb.from('knowledge_docs').select('id, title, scope, scope_id, filename, created_at, body').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenantId).is('archived_at', null).order('name'),
    sb.from('tenants').select('settings').eq('id', tenantId).single(),
    sb.from('usage_daily').select('cost_usd').eq('tenant_id', tenantId).eq('day', localDay(new Date(), tz)).maybeSingle(),
  ]);
  const director = ['owner', 'manager'].includes(role), owner = role === 'owner';
  const name = new Map((parties || []).map((p) => [p.id as string, p.name as string]));
  const customers = (parties || []).filter((p) => CUSTOMER.includes(p.kind));
  const appliesTo = (scope: string, id: string | null) => (scope === 'company' ? t('allWork') : (id && name.get(id)) || scope);
  const proposed = (lessons || []).filter((l) => l.status === 'proposed'), confirmed = (lessons || []).filter((l) => l.status === 'confirmed');
  const cap = Number((tn?.settings as { agents?: { daily_cap_usd?: number } } | null)?.agents?.daily_cap_usd) || 0;
  const spent = Number(usage?.cost_usd || 0);
  const when = (s: string) => new Date(s).toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short' });
  return (
    <div id="learning" className="grid gap-6">
      <div className="card">
        <div className="font-medium" style={{ fontSize: 16 }}>{t('lessons')}</div>
        <p className="muted small mt-1">{t('lessonsSub')}</p>
        {!proposed.length && !confirmed.length && <p className="muted small mt-3">{t('noLessons')}</p>}
        {proposed.map((l) => (
          <div key={l.id} className="small mt-3" style={{ borderTop: '1px solid var(--line2)', paddingTop: 8 }}>
            <div className="flex gap-2 flex-wrap items-center"><span className="pill warn">{t('proposed')}</span><span className="muted">{appliesTo(l.scope, l.scope_id)}{(l.drafts as unknown as { seq: number } | null)?.seq ? ` · Q-${(l.drafts as unknown as { seq: number }).seq}` : ''} · {when(l.created_at)}</span></div>
            {director ? <form action={decideLesson} className="grid gap-2 mt-2"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={l.id} />
              <textarea className="input" name="text" defaultValue={l.text} rows={2} maxLength={400} />
              <div className="flex gap-2 flex-wrap"><button className="btn primary sm" name="decision" value="confirm">{t('confirm')}</button><button className="btn sm" name="decision" value="reject">{t('reject')}</button></div>
            </form> : <p className="mt-1">{l.text}</p>}
          </div>))}
        {!!confirmed.length && <div className="mt-4">
          <div className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('inUse', { n: confirmed.length })}</div>
          <ul className="mt-1 grid gap-2 small">{confirmed.map((l) => (
            <li key={l.id} className="flex gap-2 items-start"><span className="min-w-0 flex-1"><b>{appliesTo(l.scope, l.scope_id)}:</b> {l.text}</span>
              {director && <form action={decideLesson}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={l.id} /><button className="btn sm" name="decision" value="retire">{t('retire')}</button></form>}</li>))}</ul>
        </div>}
      </div>

      <div className="card">
        <div className="font-medium" style={{ fontSize: 16 }}>{t('library')}</div>
        <p className="muted small mt-1">{t('librarySub')}</p>
        {!docs?.length && <p className="muted small mt-3">{t('noDocs')}</p>}
        {!!docs?.length && <ul className="mt-3 grid gap-2 small">{docs.map((d) => (
          <li key={d.id} className="flex gap-2 items-center flex-wrap" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
            <b className="min-w-0">{d.title}</b><span className="muted">{appliesTo(d.scope, d.scope_id)} · {t('words', { n: String(d.body || '').split(/\s+/).length })} · {when(d.created_at)}</span>
            {director && <form action={deleteDoc} className="ml-auto"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={d.id} /><button className="btn sm red">{t('remove')}</button></form>}
          </li>))}</ul>}
        {director && <details className="mt-4"><summary className="btn sm" style={{ listStyle: 'none', display: 'inline-flex' }}>{t('add')}</summary>
          <form action={addDoc} className="grid gap-3 mt-3"><input type="hidden" name="slug" value={slug} />
            <label className="f" style={{ margin: 0 }}><span>{t('title')}</span><input className="input" name="title" required maxLength={140} placeholder={t('titlePh')} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="f" style={{ margin: 0 }}><span>{t('appliesTo')}</span><select className="input" name="scope" defaultValue="company"><option value="company">{t('allWork')}</option><option value="customer">{t('oneCustomer')}</option></select></label>
              <label className="f" style={{ margin: 0 }}><span>{t('customer')}</span><select className="input" name="customer" defaultValue=""><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <label className="f" style={{ margin: 0 }}><span>{t('file')}</span><input type="file" name="file" accept=".pdf,.txt,.md,.csv,application/pdf,text/plain" className="small" /></label>
            <label className="f" style={{ margin: 0 }}><span>{t('text')}</span><textarea className="input" name="body" rows={6} placeholder={t('textPh')} /></label>
            <div><button className="btn primary sm">{t('save')}</button></div>
          </form></details>}
      </div>

      <div className="card">
        <div className="font-medium" style={{ fontSize: 16 }}>{t('limit')}</div>
        <p className="muted small mt-1">{t('limitSub')}</p>
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div className={`kpi ${cap && spent >= cap ? 'crit' : ''}`}><div className="n">${spent.toFixed(2)}</div><div className="l">{t('today')}</div></div>
          <div className="kpi"><div className="n">{cap ? `$${cap.toFixed(2)}` : t('none')}</div><div className="l">{t('dailyLimit')}</div></div>
        </div>
        {cap > 0 && spent >= cap && <div className="notice warn mt-3">{t('reached')}</div>}
        {owner ? <form action={setCap} className="flex gap-2 items-end flex-wrap mt-3"><input type="hidden" name="slug" value={slug} />
          <label className="f" style={{ margin: 0 }}><span>{t('setLimit')}</span><input className="input" name="cap" type="number" min={0} max={1000} step="0.5" defaultValue={cap || ''} placeholder="0" style={{ width: 140 }} /></label>
          <button className="btn sm">{t('save')}</button></form> : <p className="muted small mt-3">{t('ownerOnly')}</p>}
        <p className="muted small mt-2"><Link href={`/app/${slug}/agents/tree`}>{t('costByLayer')}</Link></p>
      </div>
    </div>
  );
}
