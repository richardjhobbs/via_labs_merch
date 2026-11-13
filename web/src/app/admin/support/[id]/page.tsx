// VIA Labs console: one support ticket. Staff read the conversation (it is addressed to VIA Labs), reply,
// and move the status. The company's own records stay behind support access as before.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { MESSAGE_COLS, STATUSES, TICKET_COLS, type Message, type Ticket } from '@/lib/helpdesk/desk';
import { Thread } from '@/app/support/thread';
import { setTicketStatus, viaReply } from '../actions';

export default async function AdminTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  const m = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();
  const [{ data: tk }, { data: ms }, { data: runs }] = await Promise.all([
    sb.from('support_tickets').select(`${TICKET_COLS}, tenants(id, name, slug)`).eq('id', id).maybeSingle(),
    sb.from('support_messages').select(`${MESSAGE_COLS}, agent_run_id`).eq('ticket_id', id).order('created_at'),
    sb.from('agent_runs').select('id, tools_called, cost_usd, ms, error, created_at').eq('trigger', 'support').eq('input->>ticket', id).order('created_at'),
  ]);
  if (!tk) notFound();
  await sb.from('support_tickets').update({ via_seen_at: new Date().toISOString() }).eq('id', id);
  const ticket = tk as unknown as Ticket & { tenants: { id: string; name: string; slug: string } };
  const messages = (ms || []) as unknown as Message[];
  const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cost = (runs || []).reduce((n, r) => n + Number(r.cost_usd || 0), 0);
  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/admin/support" className="small">← Support desk</Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        <span className="mono muted">#{ticket.number}</span><h1 style={{ fontSize: 20 }}>{ticket.title}</h1><span className="pill">{ticket.kind}</span>
      </div>
      <div className="muted small mt-1"><Link href={`/admin/tenants/${ticket.tenants.id}`}>{ticket.tenants.name}</Link> · {ticket.opened_by_name} ({ticket.opened_by_role}) · {ticket.opened_by_email} · {when(ticket.created_at)}{ticket.page ? ` · from ${ticket.page}` : ''} · {ticket.locale}</div>
      {saved && <div className="notice mt-3">Saved.</div>}
      {error && <div className="notice crit mt-3">{error}</div>}
      <form action={setTicketStatus} className="flex items-center gap-2 mt-3">
        <input type="hidden" name="id" value={ticket.id} />
        <select className="input" name="status" defaultValue={ticket.status} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        <button className="btn sm">Set status</button>
      </form>
      <Thread messages={messages.map((x) => ({ id: x.id, kind: x.author_kind, name: x.author_kind === 'agent' ? 'VIA Support (agent)' : x.author_kind === 'via' ? `VIA Labs · ${x.author_name || ''}` : x.author_name || '?', body: x.body, files: (x.attachments || []).length, when: when(x.created_at) }))} />
      <form action={viaReply} className="card mt-4">
        <input type="hidden" name="id" value={ticket.id} />
        <textarea className="input" name="body" rows={4} maxLength={8000} required placeholder="Reply as VIA Labs. The person is emailed." />
        <div className="flex items-center gap-2 mt-3">
          <input className="input" name="name" defaultValue={(m.user.email || '').split('@')[0]} style={{ width: 160, padding: '5px 8px', fontSize: 12.5 }} aria-label="Shown as" />
          <button className="btn primary ml-auto">Send reply</button>
        </div>
      </form>
      <details className="mt-6"><summary className="small muted" style={{ cursor: 'pointer' }}>Agent runs ({(runs || []).length}) · USD {cost.toFixed(4)}</summary>
        <div className="grid gap-1 mt-2 small mono">{(runs || []).map((r) => <div key={r.id}>{when(r.created_at)} · {r.ms} ms · {((r.tools_called || []) as { name: string; ok: boolean }[]).map((c) => `${c.name}${c.ok ? '' : ' (failed)'}`).join(', ') || 'no tools'}{r.error ? ` · ${r.error}` : ''}</div>)}</div>
      </details>
    </div>
  );
}
