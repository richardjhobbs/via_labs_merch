'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { simulateInbound, type SimResult } from './actions';

type L = Record<string, string>;

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
