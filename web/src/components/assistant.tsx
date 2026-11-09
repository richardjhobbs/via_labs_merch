'use client';
// The assistant panel: the company's agent, available on every workspace screen.
// Conversation lives in sessionStorage per company (gone when the browser closes, like the session).
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { askAgent, decideFromAssistant, type ChatTurn, type AskResult } from '@/app/app/[tenant]/assistant-actions';
import type { DraftRef } from '@/lib/agents/tools';

type Turn = ChatTurn & { queued?: boolean; calls?: AskResult['calls']; drafts?: (DraftRef & { decided?: 'approved' | 'rejected' })[]; error?: string };
type Labels = Record<string, string>;

export function Assistant({ slug, agentName, lang, live, labels }: { slug: string; agentName: string; lang: string; live: boolean; labels: Labels }) {
  const path = usePathname(), router = useRouter();
  const key = `merch_chat_${slug}`;
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);

  // Dictation: the browser's own speech recognition (Chrome, Edge, Safari), in the interface language.
  // The button only shows where the browser supports it; Chrome sends the audio to Google to transcribe.
  type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const recRef = useRef<Rec | null>(null);
  useEffect(() => { const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; setCanSpeak(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); }, []);
  const SPEECH_LANG: Record<string, string> = { en: 'en-GB', de: 'de-DE', bn: 'bn-BD', zh: 'zh-CN', vi: 'vi-VN', es: 'es-ES' };
  function stopDictation() { recRef.current?.stop(); }
  // on send: drop the recogniser without letting its last result refill the box after it was cleared
  function endDictationForSend() { const r = recRef.current; if (!r) return; r.onresult = null; r.onerror = null; r.abort(); }
  function toggleDictation() {
    if (listening) return stopDictation();
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang] || lang; rec.continuous = true; rec.interimResults = true;
    const before = q.trim() ? q.trim() + ' ' : '';
    let finals = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finals += r[0].transcript; else interim += r[0].transcript; }
      setQ((before + finals + interim).replace(/\s+/g, ' ').trimStart());
    };
    rec.onerror = (e) => {
      // say what went wrong: some browsers (Brave, Guest or Incognito windows, some blockers) refuse the speech service silently
      const msg = e.error === 'not-allowed' ? labels.micDenied : e.error === 'service-not-allowed' || e.error === 'network' ? labels.micService : e.error === 'audio-capture' ? labels.micDevice : e.error === 'no-speech' ? labels.micSilence : e.error === 'aborted' ? '' : `${labels.micService} (${e.error})`;
      setMicError(msg);
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    setMicError(''); recRef.current = rec; rec.start(); setListening(true);
  }
  useEffect(() => () => recRef.current?.stop(), []);

  useEffect(() => { try { const s = sessionStorage.getItem(key); if (s) setTurns(JSON.parse(s)); setOpen(sessionStorage.getItem(key + '_open') === '1'); } catch {} }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(turns.slice(-30))); } catch {} ; logRef.current?.scrollTo({ top: 1e6 }); }, [turns, key]);
  useEffect(() => { try { sessionStorage.setItem(key + '_open', open ? '1' : '0'); } catch {} }, [open, key]);

  const base = `/app/${slug}`;
  const screen = path === base ? 'day' : path.startsWith(`${base}/orders/`) ? 'order' : path.startsWith(`${base}/orders`) ? 'orders' : path.startsWith(`${base}/parties`) ? 'parties' : path.startsWith(`${base}/esg`) ? 'esg' : path.startsWith(`${base}/queue`) ? 'queue' : path.startsWith(`${base}/ledger`) ? 'ledger' : 'other';
  const po = screen === 'order' ? decodeURIComponent(path.split('/').pop() || '') : '';

  // Typing stays open while the agent works: a message sent meanwhile is shown at once,
  // marked queued, and goes to the agent (joined with any others) when the current reply lands.
  const run = (text: string, history: ChatTurn[]) => {
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
  const ask = (question: string) => {
    const text = question.trim(); if (!text || !live) return;
    setQ('');
    if (pending) { setTurns((t) => [...t, { role: 'user', text, queued: true }]); return; }
    const history = turns.map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: 'user', text }]);
    run(text, history);
  };
  useEffect(() => {
    if (pending || !turns.some((m) => m.queued)) return;
    const waiting = turns.filter((m) => m.queued).map((m) => m.text);
    const history = turns.filter((m) => !m.queued).map(({ role, text }) => ({ role, text }));
    setTurns((t) => t.map((m) => (m.queued ? { ...m, queued: false } : m)));
    run(waiting.join('\n\n'), history);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, turns]);
  const decide = (draftId: string, status: 'approved' | 'rejected', ti: number) => start(async () => {
    const r = await decideFromAssistant(slug, draftId, status);
    if (r.ok) setTurns((t) => t.map((m, i) => i !== ti ? m : { ...m, drafts: m.drafts?.map((d) => d.id === draftId ? { ...d, decided: status } : d) }));
    router.refresh();
  });

  if (!open) return <button className="asst-fab" onClick={() => setOpen(true)} aria-label={labels.open.replace('{name}', agentName)}><span className="pill" style={{ background: 'var(--on-accent)', color: 'var(--accent)', border: 0 }}>{agentName.slice(0, 1)}</span>{labels.open.replace('{name}', agentName)}</button>;

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
            <div className={`msg ${m.role === 'user' ? 'me' : 'ai'}`} style={m.error ? { color: 'var(--crit)' } : m.queued ? { opacity: 0.6 } : undefined}>{m.text}</div>
            {m.queued && <div className="small muted" style={{ justifySelf: 'end', fontSize: 11 }}>{labels.queued.replace('{name}', agentName)}</div>}
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
      </div>
      {micError && <div className="small px-3" style={{ color: 'var(--crit)' }}>{micError}</div>}
      <form onSubmit={(e) => { e.preventDefault(); endDictationForSend(); ask(q); }}>
        <input className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={listening ? labels.listening : labels.placeholder} disabled={!live} autoFocus />
        {canSpeak && live && (
          <button type="button" className="btn" onClick={toggleDictation} aria-pressed={listening} aria-label={listening ? labels.micStop : labels.mic} title={listening ? labels.micStop : labels.mic} style={listening ? { borderColor: 'var(--crit)', color: 'var(--crit)' } : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{listening ? <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}</svg>
          </button>
        )}
        <button className="btn primary" disabled={!live || !q.trim()}>{labels.send}</button>
      </form>
    </div>
  );
}
