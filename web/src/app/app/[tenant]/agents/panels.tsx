'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { askAgent, simulateInbound, type ChatTurn, type SimResult } from './actions';

type L = Record<string, string>;

export function AgentChat({ slug, lang, agentName, live, labels }: { slug: string; lang: string; agentName: string; live: boolean; labels: L }) {
  const [turns, setTurns] = useState<(ChatTurn & { calls?: { name: string; ok: boolean; ms: number }[]; drafts?: number; error?: string })[]>([]);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const submit = () => {
    const question = q.trim(); if (!question || pending) return;
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text: question }]); setQ('');
    start(async () => {
      const r = await askAgent(slug, history, question, lang);
      setTurns((t) => [...t, { role: 'assistant', text: r.text || (r.error ? `(${r.error})` : ''), calls: r.calls, drafts: r.drafts, error: r.error }]);
    });
  };
  return (
    <div className="card">
      <div className="flex items-center gap-2"><span className="pill agent">{agentName.slice(0, 1)}</span><span className="font-medium">{labels.chat} · {agentName}</span>{!!turns.length && <button className="btn sm ml-auto" onClick={() => setTurns([])}>{labels.clear}</button>}</div>
      <div className="grid gap-3 mt-3" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {turns.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-auto' : ''} style={{ maxWidth: '85%' }}>
            <div className="small muted mb-1">{m.role === 'user' ? labels.you : agentName}</div>
            <div className="p-3" style={{ background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--paper)', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: 14, color: m.error ? 'var(--crit)' : 'inherit' }}>{m.text}</div>
            {m.role === 'assistant' && !!m.calls?.length && <div className="small muted mt-1 mono" style={{ fontSize: 11 }}>{labels.tools}: {m.calls.map((c) => `${c.name}${c.ok ? '' : '✗'}`).join(', ')}</div>}
            {m.role === 'assistant' && !!m.drafts && <Link className="btn sm mt-2" href={`/app/${slug}/queue`}>{labels.drafted} → {labels.openQueue}</Link>}
          </div>
        ))}
        {pending && <div className="small muted">{labels.thinking}</div>}
      </div>
      <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.placeholder} disabled={!live || pending} />
        <button className="btn primary" disabled={!live || pending || !q.trim()}>{labels.send}</button>
      </form>
    </div>
  );
}

export function InboundSim({ slug, live, parties, labels }: { slug: string; live: boolean; parties: { id: string; name: string; kind: string }[]; labels: L }) {
  const [f, setF] = useState({ from: '', partyId: '', channel: 'email', subject: '', text: '' });
  const [res, setRes] = useState<SimResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="card">
      <div className="font-medium">{labels.title}</div>
      <p className="muted small mt-1">{labels.sub}</p>
      <form className="grid gap-2 mt-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (pending) return; start(async () => setRes(await simulateInbound(slug, f))); }}>
        <label className="grid gap-1 small"><span className="muted">{labels.from}</span><input className="input" value={f.from} onChange={set('from')} placeholder="Ms Chen" /></label>
        <label className="grid gap-1 small"><span className="muted">{labels.party}</span><select className="input" value={f.partyId} onChange={set('partyId')}><option value="">—</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}</select></label>
        <label className="grid gap-1 small"><span className="muted">{labels.channel}</span><select className="input" value={f.channel} onChange={set('channel')}>{['email', 'whatsapp', 'wecom', 'zalo', 'portal'].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="grid gap-1 small"><span className="muted">{labels.subject}</span><input className="input" value={f.subject} onChange={set('subject')} placeholder="PO 48812 fabric" /></label>
        <label className="grid gap-1 small md:col-span-2"><span className="muted">{labels.text}</span><textarea className="input" rows={5} value={f.text} onChange={set('text')} placeholder={'Hi, fabric for 48812 delayed, mill says delivery 4 Nov now. We will start cutting 6 Nov. Can you confirm the carton marking?'} /></label>
        <div className="md:col-span-2 flex items-center gap-3"><button className="btn primary" disabled={!live || pending || !f.text.trim()}>{labels.run}</button>{pending && <span className="small muted">{labels.thinking}</span>}</div>
      </form>
      {res && (
        <div className={`notice mt-3 ${res.ok && !res.error ? 'ok' : 'crit'}`} style={{ whiteSpace: 'pre-wrap' }}>
          <div className="font-medium small">{labels.result}{res.stream ? ` · ${res.stream}` : ''}</div>
          <div className="small mt-1">{res.error || res.summary}</div>
          {!!res.drafts && <Link className="btn sm mt-2" href={`/app/${slug}/queue`}>{labels.openQueue}</Link>}
        </div>
      )}
    </div>
  );
}
