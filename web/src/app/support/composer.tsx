'use client';
// The message box of the support desk: text plus up to three screenshots, which go straight from the
// browser to the private bucket by a one-time link. Without ticketId it starts a new conversation.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { replyTicket, screenshotLink, startTicket } from './actions';

type Shot = { path: string; name: string; mime: string; bytes: number };
const MAX = 5 * 1024 * 1024;

export function Composer({ slug, ticketId, page = '' }: { slug: string; ticketId?: string; page?: string }) {
  const t = useTranslations('help');
  const router = useRouter();
  const [text, setText] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [sentText, setSentText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setErr(''); setUploading(true);
    for (const f of Array.from(list).slice(0, 3 - shots.length)) {
      if (f.size > MAX || !/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { setErr(t('attachHint')); continue; }
      const link = await screenshotLink(slug, f.name, f.type);
      if (!link.ok || !link.url || !link.path) { setErr(t('err.upload')); continue; }
      const put = await fetch(link.url, { method: 'PUT', headers: { 'content-type': f.type, 'x-upsert': 'true' }, body: f });
      if (!put.ok) { setErr(t('err.upload')); continue; }
      setShots((s) => [...s, { path: link.path!, name: f.name, mime: f.type, bytes: f.size }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim(); if (!body || pending) return;
    setErr(''); setSentText(body); setText('');
    start(async () => {
      const r = ticketId ? await replyTicket(slug, ticketId, body, shots) : await startTicket(slug, body, shots, page);
      if (!r.id) { setErr(t(`err.${r.error === 'closed' ? 'closed' : 'failed'}`)); setText(body); return; }
      setShots([]);
      const q = !r.ok && (r.error === 'limit' || r.error === 'agent') ? `?e=${r.error}` : '';
      if (ticketId && !q) router.refresh(); else router.push(`/support/${slug}/t/${r.id}${q}`);
    });
  }

  return (
    <form onSubmit={send} aria-busy={pending || uploading}>
      {pending && sentText && (
        <div className="grid gap-3 mb-3" role="status" aria-live="polite">
          <div style={{ justifySelf: 'end', maxWidth: '88%', padding: '10px 13px', borderRadius: 10, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--accent)', color: 'var(--on-accent)', opacity: 0.85 }}>{sentText}</div>
          <div style={{ justifySelf: 'start', padding: '10px 13px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--line)' }} className="flex items-center gap-2 small"><span className="typing" aria-hidden><i /><i /><i /></span><span className="muted">{t('working')}</span></div>
        </div>
      )}
      <textarea className="input" rows={ticketId ? 3 : 5} maxLength={8000} required placeholder={ticketId ? t('replyPh') : t('newPh')} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} />
      {!!shots.length && <div className="flex flex-wrap gap-2 mt-2">{shots.map((s) => <span key={s.path} className="pill">{s.name.slice(0, 28)} <button type="button" aria-label={t('remove')} onClick={() => setShots((x) => x.filter((y) => y.path !== s.path))} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}>×</button></span>)}</div>}
      {err && <div className="notice crit mt-2">{err}</div>}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button type="button" className="btn sm" disabled={pending || uploading || shots.length >= 3} onClick={() => fileRef.current?.click()}>{t('attach')}</button>
        <span className="muted small flex items-center gap-2" role="status" aria-live="polite">{uploading ? <><span className="spinner" aria-hidden />{t('uploading')}</> : pending ? <><span className="spinner" aria-hidden />{t('working')}</> : t('attachHint')}</span>
        <button className="btn primary ml-auto" disabled={pending || uploading || !text.trim()}>{pending && <span className="spinner" aria-hidden style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} />}{t('send')}</button>
      </div>
    </form>
  );
}
