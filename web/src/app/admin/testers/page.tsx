// Console: the open tester programme. The link to send, the three practice companies testers get copies of,
// and who has joined. Feedback has its own page.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getProgram, templates, WORLDS, type World } from '@/lib/testers';
import { SAMPLE_WORLDS } from '@/lib/sample/worlds';
import { createTemplate, freezeTemplate, markTemplate, saveProgram } from './actions';

const KIND: Record<World, string> = { brand: 'Brand', buying_office: 'Buying office / trading company', factory: 'Manufacturer' };
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://merch.getvia.xyz').replace(/\/$/, '');

export default async function Testers({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { msg, error } = await searchParams;
  const sb = supabaseAdmin();
  const [program, tpls, { data: testers }, { data: boxes }, { data: fb }] = await Promise.all([
    getProgram(), templates(),
    sb.from('testers').select('user_id, email, name, company, trade, ref, created_at, last_seen_at').order('created_at', { ascending: false }),
    sb.from('tester_sandboxes').select('user_id, world, tenant_id, retired_at'),
    sb.from('tester_feedback').select('user_id, status'),
  ]);
  // how far the agents are with first briefs in each practice company
  const progress = new Map<string, { open: number; briefed: number }>();
  for (const t of tpls) {
    const [{ count: open }, { data: mem }] = await Promise.all([
      sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('status', 'open'),
      sb.from('agent_memory').select('order_id').eq('tenant_id', t.id).not('order_id', 'is', null),
    ]);
    progress.set(t.id, { open: open || 0, briefed: new Set((mem || []).map((m) => m.order_id)).size });
  }
  const link = `${APP}/try${program.code ? `?k=${program.code}` : ''}`;
  const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const newNotes = (fb || []).filter((f) => f.status === 'new').length;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3"><h1>Testers</h1><Link className="btn sm" href="/admin/testers/feedback">Feedback{newNotes ? ` (${newNotes} new)` : ''} →</Link></div>
      <p className="muted small mt-1" style={{ maxWidth: '80ch' }}>People you invite try VIA Merch in practice companies. Each tester gets a private copy of each company, so nobody sees another tester or what they did. Nothing leaves a practice company: no mailboxes, no invitations, no messages to anyone.</p>
      {msg && <div className="notice mt-3">{msg}</div>}
      {error && <div className="notice crit mt-3">{error}</div>}

      <div className="grid gap-5 mt-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card">
          <h2>Practice companies</h2>
          <p className="muted small mt-1">Set each one up, open it and adjust it as you like, then freeze it. A tester’s copy is the company as it stood when frozen, with every date moved forward to the day they open it.</p>
          <div className="grid gap-3 mt-3">
            {WORLDS.map((w) => {
              const t = tpls.find((x) => x.world === w), p = t ? progress.get(t.id) : null, W = SAMPLE_WORLDS[w];
              const copies = (boxes || []).filter((b) => b.world === w && !b.retired_at).length;
              return (
                <div key={w} className="flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--line2)', paddingTop: 12 }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <b>{t?.name || W.tenant.name}</b> <span className="muted">· {KIND[w]}</span>
                    <div className="small mt-1">{!t ? <span className="pill">not set up</span> : t.frozen_at ? <span className="pill ok">frozen {when(t.frozen_at)}</span> : <span className="pill warn">being prepared</span>}
                      {p && <span className="muted"> · briefs {p.briefed}/{p.open}</span>}{t && <span className="muted"> · {copies} tester {copies === 1 ? 'copy' : 'copies'}</span>}</div>
                  </div>
                  {!t && <form action={createTemplate}><input type="hidden" name="world" value={w} /><button className="btn sm primary">Set up</button></form>}
                  {t && <Link className="btn sm" href={`/app/${t.slug}`}>Open</Link>}
                  {t && <form action={freezeTemplate}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="on" value={t.frozen_at ? '0' : '1'} /><button className={`btn sm ${t.frozen_at ? '' : 'primary'}`}>{t.frozen_at ? 'Thaw to edit' : 'Freeze for testers'}</button></form>}
                </div>
              );
            })}
          </div>
          <details className="mt-4"><summary className="small muted" style={{ cursor: 'pointer' }}>Use an existing company instead</summary>
            <form action={markTemplate} className="flex flex-wrap items-end gap-2 mt-2">
              <label className="f" style={{ margin: 0 }}><span>Company slug</span><input className="input mono" name="slug" required placeholder="meridian-practice" /></label>
              <label className="f" style={{ margin: 0 }}><span>Kind</span><select className="input" name="world">{WORLDS.map((w) => <option key={w} value={w}>{KIND[w]}</option>)}</select></label>
              <button className="btn sm">Use as practice company</button>
            </form>
            <p className="muted small mt-2">Real people in that company are replaced by the tester in every copy; made-up colleagues (sign-ins on .example addresses) stay. Connected mailboxes are never copied, but messages already in the company are: only mark a company whose messages are all sample ones.</p>
          </details>
        </div>

        <form action={saveProgram} className="card self-start">
          <h2>Invitation</h2>
          <label className="flex items-center gap-2 mt-3"><input type="checkbox" name="open" defaultChecked={program.open} /> <span>Open to new testers</span></label>
          <label className="f mt-3"><span>Access word in the link</span><input className="input mono" name="code" defaultValue={program.code} placeholder="for example ss27" pattern="[A-Za-z0-9_-]{0,40}" /></label>
          <label className="f"><span>Most testers</span><input className="input" name="max" type="number" min={1} max={500} defaultValue={program.max} /></label>
          <button className="btn primary">Save</button>
          <div className="mt-4 small"><div className="muted">Link to send</div><div className="mono" style={{ wordBreak: 'break-all' }}>{link}</div>
            <p className="muted mt-2">Add <span className="mono">&amp;ref=name</span> to a link to see where a tester came from. Without the access word the page says the programme is by invitation.</p></div>
        </form>
      </div>

      <h2 className="mt-6">Who has joined ({testers?.length || 0} of {program.max})</h2>
      <div className="card mt-3 tw" style={{ padding: 0 }}>
        <table className="t stack"><thead><tr><th>Name</th><th>Company</th><th>Works in</th><th>Opened</th><th>Notes</th><th>Joined</th><th>Last seen</th></tr></thead>
          <tbody>{(testers || []).map((x) => {
            const mine = (boxes || []).filter((b) => b.user_id === x.user_id && !b.retired_at).map((b) => KIND[b.world as World].split(' ')[0]);
            const notes = (fb || []).filter((f) => f.user_id === x.user_id).length;
            return (
              <tr key={x.user_id}><td><b>{x.name}</b><div className="muted small">{x.email}{x.ref ? ` · ${x.ref}` : ''}</div></td><td data-l="Company">{x.company || ''}</td><td data-l="Works in">{(x.trade || '').replace('_', ' ')}</td>
                <td data-l="Opened">{mine.join(', ') || <span className="muted">nothing yet</span>}</td><td data-l="Notes">{notes ? <Link href={`/admin/testers/feedback?who=${x.user_id}`}>{notes}</Link> : 0}</td><td className="muted" data-l="Joined">{when(x.created_at)}</td><td className="muted" data-l="Last seen">{when(x.last_seen_at)}</td></tr>
            );
          })}{!testers?.length && <tr><td colSpan={7} className="muted">Nobody yet.</td></tr>}</tbody></table>
      </div>
    </div>
  );
}
