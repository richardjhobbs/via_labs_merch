'use client';
// Feedback from a tester to VIA Labs, on every page of a practice company: say how it went, type or dictate
// a note, or record a voice note. Dictation is the browser's own speech recognition, as in the Ask box; the
// recording is kept as audio for VIA Labs to listen to. The page the person is on travels with the note.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { sendFeedback } from '@/app/try/actions';

export type FeedbackLabels = Record<'open' | 'title' | 'intro' | 'placeholder' | 'send' | 'sending' | 'thanks' | 'another' | 'close' | 'failed' | 'dictate' | 'stop' | 'listening' | 'record' | 'recording' | 'recorded' | 'discard' | 'micDenied' | 'micService' | 'page', string> & { moods: Record<'good' | 'confusing' | 'missing' | 'broken', string> };
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SPEECH_LANG: Record<string, string> = { en: 'en-GB', de: 'de-DE', bn: 'bn-BD', zh: 'zh-CN', vi: 'vi-VN', es: 'es-ES' };
const MAX_SECONDS = 120;

export function FeedbackButton({ slug, track, locale, labels: t }: { slug: string; track: string; locale: string; labels: FeedbackLabels }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [err, setErr] = useState('');
  // dictation
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Rec | null>(null);
  // voice note
  const [canRecord, setCanRecord] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setCanSpeak(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    setCanRecord(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);
  useEffect(() => () => { recRef.current?.abort(); mrRef.current?.stream.getTracks().forEach((x) => x.stop()); if (tickRef.current) clearInterval(tickRef.current); }, []);

  function toggleDictation() {
    if (listening) { recRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[locale] || locale; rec.continuous = true; rec.interimResults = true;
    const before = body.trim() ? body.replace(/\s+$/, '') + ' ' : '';
    let finals = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finals += r[0].transcript; else interim += r[0].transcript; }
      setBody(before + (finals + interim).replace(/\s+/g, ' ').trimStart());
    };
    rec.onerror = (e) => setErr(e.error === 'not-allowed' ? t.micDenied : e.error === 'aborted' || e.error === 'no-speech' ? '' : t.micService);
    rec.onend = () => { setListening(false); recRef.current = null; };
    setErr(''); recRef.current = rec; rec.start(); setListening(true);
  }

  async function toggleRecording() {
    if (recording) { mrRef.current?.stop(); return; }
    try {
      recRef.current?.stop();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) => MediaRecorder.isTypeSupported(x));
      const mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
      const chunks: Blob[] = [];
      let n = 0;
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        if (tickRef.current) clearInterval(tickRef.current);
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        setRecording(false); mrRef.current = null;
        if (blob.size) setClip({ blob, url: URL.createObjectURL(blob), seconds: n });
      };
      setErr(''); setClip(null); setSeconds(0); mrRef.current = mr; mr.start(); setRecording(true);
      tickRef.current = setInterval(() => { n += 1; setSeconds(n); if (n >= MAX_SECONDS) mr.stop(); }, 1000);
    } catch { setErr(t.micDenied); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !clip) return;
    recRef.current?.abort();
    setState('sending');
    const fd = new FormData();
    fd.set('tenant', slug); fd.set('track', track); fd.set('locale', locale); fd.set('path', path || ''); fd.set('mood', mood); fd.set('body', body); fd.set('ua', navigator.userAgent);
    if (clip) { fd.set('audio', new File([clip.blob], 'note', { type: clip.blob.type })); fd.set('seconds', String(clip.seconds)); }
    const r = await sendFeedback(fd).catch(() => ({ ok: false }));
    if (!r.ok) { setState('failed'); return; }
    setState('sent'); setBody(''); setMood(''); setClip(null);
  }

  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  if (!open) return <button type="button" className="fb-fab" onClick={() => { setOpen(true); setState('idle'); }}>💬 {t.open}</button>;
  return (
    <div className="fb" role="dialog" aria-label={t.title}>
      <div className="flex items-center gap-2 mb-2"><b style={{ flex: 1 }}>{t.title}</b><button type="button" className="btn sm" onClick={() => setOpen(false)}>{t.close}</button></div>
      {state === 'sent' ? (
        <div><div className="notice">{t.thanks}</div><button type="button" className="btn sm mt-3" onClick={() => setState('idle')}>{t.another}</button></div>
      ) : (
        <form onSubmit={submit}>
          <p className="muted small mb-2">{t.intro}</p>
          <div className="flex flex-wrap gap-1 mb-2">{(Object.keys(t.moods) as (keyof FeedbackLabels['moods'])[]).map((m) => <button type="button" key={m} className={`pill ${mood === m ? 'agent' : ''}`} style={{ cursor: 'pointer' }} aria-pressed={mood === m} onClick={() => setMood(mood === m ? '' : m)}>{t.moods[m]}</button>)}</div>
          <textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.placeholder} style={{ width: '100%', resize: 'vertical' }} />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {canSpeak && !recording && <button type="button" className="btn sm" onClick={toggleDictation}>{listening ? `■ ${t.stop}` : `🎤 ${t.dictate}`}</button>}
            {canRecord && !listening && <button type="button" className="btn sm" onClick={toggleRecording}>{recording ? `■ ${t.stop} ${mmss(seconds)}` : `● ${t.record}`}</button>}
            {listening && <span className="muted small">{t.listening}</span>}
            {recording && <span className="muted small">{t.recording}</span>}
          </div>
          {clip && <div className="flex items-center gap-2 mt-2"><audio controls src={clip.url} style={{ height: 32, flex: 1, minWidth: 0 }} /><button type="button" className="btn sm" onClick={() => setClip(null)}>{t.discard}</button></div>}
          {clip && <div className="muted small mt-1">{t.recorded} {mmss(clip.seconds)}</div>}
          {err && <div className="notice warn mt-2">{err}</div>}
          {state === 'failed' && <div className="notice crit mt-2">{t.failed}</div>}
          <div className="flex items-center gap-2 mt-3"><button className="btn primary" disabled={state === 'sending' || recording || (!body.trim() && !clip)}>{state === 'sending' ? t.sending : t.send}</button><span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.page}: {path}</span></div>
        </form>
      )}
    </div>
  );
}
