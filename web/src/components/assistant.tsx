'use client';
// The assistant panel: the company's agent, available on every workspace screen.
// Conversation lives in sessionStorage per company (gone when the browser closes, like the session).
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { askAgent, decideFromAssistant, type ChatTurn, type AskResult } from '@/app/app/[tenant]/assistant-actions';
import type { DraftRef } from '@/lib/agents/tools';

type Turn = ChatTurn & { calls?: AskResult['calls']; drafts?: (DraftRef & { decided?: 'approved' | 'rejected' })[]; error?: string };
type Labels = Record<string, string>;

export function Assistant({ slug, agentName, lang, live, labels }: { slug: string; agentName: string; lang: string; live: boolean; labels: Labels }) {
  const path = usePathname(), router = useRouter();
  const key = `merch_chat_${slug}`;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem(key); if (s) setTurns(JSON.parse(s)); setOpen(sessionStorage.getItem(key + '_open') === '1'); } catch {} }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(turns.slice(-30))); } catch {} ; logRef.current?.scrollTo({ top: 1e6 }); }, [turns, key]);
  useEffect(() => { try { sessionStorage.setItem(key + '_open', open ? '1' : '0'); } catch {} }, [open, key]);

  const base = `/app/${slug}`;
  const screen = path === base ? 'day' : path.startsWith(`${base}/orders/`) ? 'order' : path.startsWith(`${base}/orders`) ? 'orders' : path.startsWith(`${base}/parties`) ? 'parties' : path.startsWith(`${base}/queue`) ? 'queue' : path.startsWith(`${base}/ledger`) ? 'ledger' : 'other';
  const po = screen === 'order' ? decodeURIComponent(path.split('/').pop() || '') : '';
  const suggestions = [screen === 'order' ? `${labels.s_order} (${po})` : labels[`s_${screen}`] || labels.s_day, labels.s_any1, labels.s_any2].filter(Boolean);

  const ask = (question: string) => {
    const text = question.trim(); if (!text || pending || !live) return;
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text }]); setQ('');
    start(async () => {
      const r = await askAgent(slug, history, text, lang, screen === 'order' ? `PO ${po}` : screen);
      setTurns((t) => [...t, { role: 'assistant', text: r.text || (r.error ? `(${r.error})` : ''), calls: r.calls, drafts: r.drafts, error: r.error }]);
      if (r.nav) {
        const to = r.nav.screen === 'day' ? base : r.nav.screen === 'order' && r.nav.id ? `${base}/orders/${encodeURIComponent(r.nav.id)}` : `${base}/${r.nav.screen}`;
        if (to !== path) router.push(to);
      }
      if (r.drafts.length) router.refresh();
    });
  };
  const decide = (draftId: string, status: 'approved' | 'rejected', ti: number) => start(async () => {
    const r = await decideFromAssistant(slug, draftId, status);
    if (r.ok) setTurns((t) => t.map((m, i) => i !== ti ? m : { ...m, drafts: m.drafts?.map((d) => d.id === draftId ? { ...d, decided: status } : d) }));
    router.refresh();
  });

  if (!open) return <button className="asst-fab" onClick={() => setOpen(true)} aria-label={labels.open.replace('{name}', agentName)}><span className="pill" style={{ background: '#fff', color: 'var(--accent)', border: 0 }}>{agentName.slice(0, 1)}</span>{labels.open.replace('{name}', agentName)}</button>;

  return (
    <div className="asst" role="dialog" aria-label={agentName}>
      <div className="hd">
        <span className="pill agent">{agentName.slice(0, 1)}</span>
        <b style={{ fontSize: 14 }}>{agentName}</b>
        <span className="muted small">· {labels.title}</span>
        {!!turns.length && <button className="btn sm ml-auto" onClick={() => setTurns([])}>{labels.clear}</button>}
        <button className={`btn sm ${turns.length ? '' : 'ml-auto'}`} onClick={() => setOpen(false)} aria-label={labels.close}>×</button>
      </div>
      <div className="log" ref={logRef}>
        {!live && <div className="notice warn">{labels.noKey}</div>}
        {turns.map((m, i) => (
          <div key={i} style={{ display: 'grid', gap: 6 }}>
            <div className={`msg ${m.role === 'user' ? 'me' : 'ai'}`} style={m.error ? { color: 'var(--crit)' } : undefined}>{m.text}</div>
            {m.role === 'assistant' && !!m.calls?.length && <div className="small muted mono" style={{ fontSize: 11 }}>{labels.used}: {m.calls.map((c) => `${c.name}${c.ok ? '' : ' ✗'}`).join(', ')}</div>}
            {m.drafts?.map((d) => (
              <div key={d.id} className="card">
                <div className="flex items-center gap-2 flex-wrap"><span className="mono small muted">Q-{d.seq}</span><span className="pill">{d.stream}</span><span className="pill agent">L{d.gate_level}</span>{d.po && <span className="pill">PO {d.po}</span>}</div>
                <div className="mt-1 font-medium">{d.title}</div>
                {d.party && <div className="small muted">→ {d.party}</div>}
                {d.decided ? <div className={`notice mt-2 ${d.decided === 'approved' ? 'ok' : 'crit'}`} style={{ padding: '6px 10px' }}>{d.decided === 'approved' ? labels.approved : labels.rejected}</div> : (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button className="btn primary sm" disabled={pending} onClick={() => decide(d.id, 'approved', i)}>{labels.approve}</button>
                    <button className="btn sm" onClick={() => router.push(`${base}/queue`)}>{labels.hold} · {labels.inQueue}</button>
                    <button className="btn sm" disabled={pending} onClick={() => decide(d.id, 'rejected', i)}>{labels.reject}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {pending && <div className="msg ai muted">{labels.working}</div>}
        {!pending && live && (
          <div className="sug">{suggestions.map((s) => <button key={s} onClick={() => ask(s.replace(/ \(.*\)$/, screen === 'order' ? ` ${po}` : ''))}>{s}</button>)}</div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.placeholder} disabled={!live || pending} />
        <button className="btn primary" disabled={!live || pending || !q.trim()}>{labels.send}</button>
      </form>
    </div>
  );
}
