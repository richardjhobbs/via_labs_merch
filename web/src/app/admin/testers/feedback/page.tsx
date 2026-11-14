// Console: everything testers said, newest first, with the page it was left on. Typed and dictated notes
// are text; recordings play here. The summary reads all the text at once.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { WORLDS } from '@/lib/testers';
import { setFeedbackStatus, summariseFeedback } from '../actions';

const MOODS = ['good', 'confusing', 'missing', 'broken'];
const TONE: Record<string, string> = { good: 'ok', confusing: 'warn', missing: 'agent', broken: 'crit' };

export default async function Feedback({ searchParams }: { searchParams: Promise<{ who?: string; world?: string; mood?: string; status?: string; error?: string }> }) {
  const sp = await searchParams;
  const sb = supabaseAdmin();
  let q = sb.from('tester_feedback').select('id, user_id, world, role, track, path, locale, mood, body, audio_path, audio_seconds, status, created_at').order('created_at', { ascending: false }).limit(300);
  if (/^[0-9a-f-]{36}$/i.test(sp.who || '')) q = q.eq('user_id', sp.who!);
  if ((WORLDS as readonly string[]).includes(sp.world || '')) q = q.eq('world', sp.world!);
  if (MOODS.includes(sp.mood || '')) q = q.eq('mood', sp.mood!);
  if (['new', 'read', 'actioned'].includes(sp.status || '')) q = q.eq('status', sp.status!);
  const [{ data: rows }, { data: testers }, { data: sum }] = await Promise.all([q, sb.from('testers').select('user_id, name, company'), sb.from('app_config').select('value').eq('key', 'tester_feedback_summary').maybeSingle()]);
  const nameOf = (id: string | null) => { const t = (testers || []).find((x) => x.user_id === id); return t ? `${t.name}${t.company ? `, ${t.company}` : ''}` : 'Someone'; };
  // recordings: short-lived signed links, made here so the page plays them directly
  const audio = new Map<string, string>();
  const paths = (rows || []).filter((r) => r.audio_path).map((r) => r.audio_path as string);
  if (paths.length) { const { data: signed } = await sb.storage.from('merch-feedback').createSignedUrls(paths, 3600); for (const s of signed || []) if (s.signedUrl && s.path) audio.set(s.path, s.signedUrl); }
  let summary: { at: string; notes: number; testers: number; text: string } | null = null;
  try { summary = sum?.value ? JSON.parse(sum.value) : null; } catch { summary = null; }
  const href = (k: string, v: string) => { const p = new URLSearchParams(Object.entries({ ...sp, [k]: v }).filter(([key, val]) => val && key !== 'error') as [string, string][]); return `/admin/testers/feedback${p.size ? `?${p}` : ''}`; };
  const chip = (k: 'world' | 'mood' | 'status', v: string, label: string) => <Link key={k + v} href={href(k, sp[k] === v ? '' : v)} className={`pill ${sp[k] === v ? 'agent' : ''}`} style={{ textDecoration: 'none' }}>{label}</Link>;
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3"><h1>Tester feedback</h1><Link className="btn sm" href="/admin/testers">← Testers</Link><a className="btn sm" href="/admin/testers/feedback/export">Download CSV</a></div>
      {sp.error && <div className="notice crit mt-3">{sp.error}</div>}
      <div className="card mt-4" id="summary">
        <div className="flex flex-wrap items-center gap-3"><h2 style={{ flex: 1 }}>Summary</h2>{summary && <span className="muted small">{summary.notes} notes from {summary.testers} testers · {when(summary.at)}</span>}<form action={summariseFeedback}><button className="btn sm primary">{summary ? 'Summarise again' : 'Summarise all feedback'}</button></form></div>
        {summary ? <div className="mt-3" style={{ whiteSpace: 'pre-wrap', maxWidth: '90ch' }}>{summary.text}</div> : <p className="muted small mt-2">Reads every written and dictated note and groups them: what to fix first, what confused people, what is missing, what they liked.</p>}
      </div>
      <div className="flex flex-wrap gap-1 mt-5 chips">
        {chip('world', 'brand', 'Brand')}{chip('world', 'buying_office', 'Buying office')}{chip('world', 'factory', 'Manufacturer')}
        <span style={{ width: 8 }} />{MOODS.map((m) => chip('mood', m, m))}
        <span style={{ width: 8 }} />{chip('status', 'new', 'new')}{chip('status', 'read', 'read')}{chip('status', 'actioned', 'actioned')}
        {sp.who && <Link className="pill agent" style={{ textDecoration: 'none' }} href={href('who', '')}>{nameOf(sp.who)} ✕</Link>}
      </div>
      <div className="grid gap-3 mt-3">
        {(rows || []).map((r) => (
          <div key={r.id} className="card" style={r.status === 'new' ? { borderLeft: '3px solid var(--accent)' } : undefined}>
            <div className="flex flex-wrap items-center gap-2 small">
              <Link href={href('who', r.user_id || '')}><b>{nameOf(r.user_id)}</b></Link>
              {r.mood && <span className={`pill ${TONE[r.mood] || ''}`}>{r.mood}</span>}
              {r.world && <span className="pill">{r.world.replace('_', ' ')}</span>}{r.role && <span className="pill">as {r.role}</span>}{r.track && <span className="pill">{r.track}</span>}
              <span className="muted mono" style={{ overflowWrap: 'anywhere' }}>{(r.path || '').replace(/^\/app\/[^/]+/, '') || '/'}</span>
              <span className="muted ml-auto">{when(r.created_at)}{r.locale && r.locale !== 'en' ? ` · ${r.locale}` : ''}</span>
            </div>
            {r.body && <p className="mt-2" style={{ whiteSpace: 'pre-wrap', maxWidth: '90ch' }}>{r.body}</p>}
            {r.audio_path && (audio.get(r.audio_path) ? <audio className="mt-2" controls preload="none" src={audio.get(r.audio_path)} style={{ width: 'min(420px, 100%)' }} /> : <div className="muted small mt-2">Recording unavailable.</div>)}
            <form action={setFeedbackStatus} className="flex gap-1 mt-3"><input type="hidden" name="id" value={r.id} />
              {['new', 'read', 'actioned'].filter((s) => s !== r.status).map((s) => <button key={s} name="status" value={s} className="btn sm">Mark {s}</button>)}
            </form>
          </div>
        ))}
        {!rows?.length && <div className="card muted">No feedback yet.</div>}
      </div>
    </div>
  );
}
