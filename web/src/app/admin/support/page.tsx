// VIA Labs console: the support desk across companies. Change proposals first (they wait for a decision),
// then tickets that need a person, then the rest.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { TICKET_COLS, DONE, type Ticket } from '@/lib/helpdesk/desk';
import { decideProposal } from './actions';

type Proposal = { id: string; number: number; kind: string; title: string; problem: string; affected: string | null; suggested: string | null; repro: string | null; status: string; lane: string | null; scope: string | null; plan: string | null; risk_flags: string[]; github_issue: number | null; pr_url: string | null; decided_by_email: string | null; decision_note: string | null; created_at: string; ticket_id: string | null; tenants: { name: string } | null; support_tickets: { number: number; opened_by_name: string | null } | null };
const OPEN_P = ['proposed', 'planned', 'greenlit', 'building', 'pr_open'];
const NEXT: Record<string, [string, string][]> = {
  proposed: [['planned', 'Plan it'], ['greenlit', 'Greenlight'], ['declined', 'Decline']],
  planned: [['greenlit', 'Greenlight'], ['declined', 'Decline']],
  greenlit: [['building', 'Building'], ['declined', 'Decline']],
  building: [['pr_open', 'PR open'], ['shipped', 'Shipped']],
  pr_open: [['shipped', 'Shipped'], ['declined', 'Decline']],
};

export default async function SupportDesk({ searchParams }: { searchParams: Promise<{ saved?: string; all?: string }> }) {
  const { saved, all } = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: pr }, { data: tk }] = await Promise.all([
    sb.from('change_proposals').select('*, tenants(name), support_tickets(number, opened_by_name)').order('created_at', { ascending: false }).limit(200),
    sb.from('support_tickets').select(`${TICKET_COLS}, tenants(name)`).order('last_message_at', { ascending: false }).limit(300),
  ]);
  const proposals = (pr || []) as unknown as Proposal[];
  const tickets = (tk || []) as unknown as (Ticket & { tenants: { name: string } | null })[];
  const openP = proposals.filter((p) => OPEN_P.includes(p.status)), closedP = proposals.filter((p) => !OPEN_P.includes(p.status));
  const waiting = tickets.filter((x) => x.status === 'with_via');
  const rest = tickets.filter((x) => x.status !== 'with_via' && (all || !DONE.includes(x.status)));
  const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const head = (s: string) => <div className="small font-medium muted mt-8" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{s}</div>;
  const ticketRow = (x: (typeof tickets)[number]) => (
    <Link key={x.id} href={`/admin/support/${x.id}`} className="card flex flex-wrap items-center gap-x-3 gap-y-1 no-underline" style={{ color: 'inherit', padding: '10px 14px' }}>
      <span className="mono muted">#{x.number}</span>
      <b className="min-w-0" style={{ flex: '1 1 220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</b>
      <span className="muted small">{x.tenants?.name} · {x.opened_by_name} · {x.kind} · {day(x.last_message_at)}</span>
      <span className={`pill ${x.status === 'with_via' ? 'warn' : ''}`}>{x.status.replace('_', ' ')}</span>
    </Link>
  );
  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Support desk</h1>
      {saved && <div className="notice mt-3">Saved.</div>}

      {head(`Change proposals (${openP.length})`)}
      <div className="grid gap-3 mt-3">
        {!openP.length && <div className="muted small">None waiting.</div>}
        {openP.map((p) => (
          <div key={p.id} className="card">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="mono muted">P{p.number}</span><b style={{ fontSize: 15 }}>{p.title}</b>
              <span className="pill">{p.kind}</span><span className="pill agent">{p.status.replace('_', ' ')}</span>
              {p.lane && <span className={`pill ${p.lane === 'proceed' ? 'ok' : 'warn'}`}>{p.lane === 'proceed' ? 'safe to proceed' : 'needs greenlight'}</span>}
              <span className="muted small ml-auto">{p.tenants?.name}{p.support_tickets ? <> · <Link href={`/admin/support/${p.ticket_id}`}>#{p.support_tickets.number} {p.support_tickets.opened_by_name}</Link></> : null} · {day(p.created_at)}</span>
            </div>
            <p className="small mt-2" style={{ whiteSpace: 'pre-wrap', color: 'var(--fg2)' }}>{p.problem}</p>
            {p.affected && <p className="small mt-1"><b>Affected:</b> {p.affected}</p>}
            {p.suggested && <p className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}><b>Suggested:</b> {p.suggested}</p>}
            {p.repro && <p className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}><b>Steps:</b> {p.repro}</p>}
            {p.plan && <details className="mt-2"><summary className="small" style={{ cursor: 'pointer' }}>Plan{p.scope ? ` · ${p.scope}` : ''}</summary><p className="small mt-1" style={{ whiteSpace: 'pre-wrap' }}>{p.plan}</p></details>}
            {!!p.risk_flags?.length && <div className="flex flex-wrap gap-1 mt-2">{p.risk_flags.map((f) => <span key={f} className="pill crit">{f}</span>)}</div>}
            {p.github_issue && <p className="small mt-1"><a href={`https://github.com/richardjhobbs/via_labs_merch/issues/${p.github_issue}`} target="_blank" rel="noopener">Issue #{p.github_issue}</a></p>}
            {p.pr_url && <p className="small mt-1"><a href={p.pr_url} target="_blank" rel="noopener">{p.pr_url}</a></p>}
            {p.status === 'proposed' && !p.lane && <p className="muted small mt-2">Waiting for triage (hourly): the plan and lane appear here.</p>}
            {p.status === 'greenlit' && !p.pr_url && <p className="muted small mt-2">Greenlit: the next hourly run builds it and opens a PR.</p>}
            <form action={decideProposal} className="flex flex-wrap items-center gap-2 mt-3">
              <input type="hidden" name="id" value={p.id} />
              <input className="input" name="note" placeholder="Note (shown to the person only on decline)" defaultValue={p.decision_note || ''} style={{ flex: '1 1 220px', padding: '5px 8px', fontSize: 12.5 }} />
              {(NEXT[p.status] || []).map(([v, label]) => <button key={v} name="status" value={v} className={`btn sm ${v === 'greenlit' ? 'primary' : v === 'declined' ? 'red' : ''}`}>{label}</button>)}
            </form>
          </div>
        ))}
      </div>

      {head(`Waiting for VIA Labs (${waiting.length})`)}
      <div className="grid gap-2 mt-3">{waiting.length ? waiting.map(ticketRow) : <div className="muted small">None.</div>}</div>

      {head(all ? 'All other tickets' : 'Other open tickets')}
      <div className="grid gap-2 mt-3">{rest.length ? rest.map(ticketRow) : <div className="muted small">None.</div>}</div>
      <p className="small mt-3">{all ? <Link href="/admin/support">Open only</Link> : <Link href="/admin/support?all=1">Show closed too</Link>}</p>

      {!!closedP.length && <>
        {head('Decided proposals')}
        <div className="grid gap-1 mt-3 small">{closedP.slice(0, 50).map((p) => <div key={p.id}><span className="mono muted">P{p.number}</span> {p.title} · <span className="muted">{p.status}{p.decided_by_email ? ` · ${p.decided_by_email}` : ''}{p.decision_note ? ` · ${p.decision_note}` : ''}</span>{p.pr_url && <> · <a href={p.pr_url} target="_blank" rel="noopener">PR</a></>}</div>)}</div>
      </>}
    </div>
  );
}
