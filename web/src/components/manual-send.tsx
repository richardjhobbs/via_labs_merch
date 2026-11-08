'use client';
// Sending an approved reply by hand: copy it, or open the chat with the text ready where the app allows it
// (WhatsApp takes the text in the link; Zalo opens the chat and the text is copied to paste; the phone's
// share sheet reaches WeChat, Line and the rest). The person then marks it sent.
import { useEffect, useState, type ReactNode } from 'react';

type L = { copy: string; copied: string; whatsapp: string; zalo: string; share: string; email: string };

export function ManualSend({ text, phone, email, pref, labels, children }: { text: string; phone: string | null; email: string | null; pref: string | null; labels: L; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const digits = (phone || '').replace(/\D/g, '');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const [canShare, setCanShare] = useState(false);   // known only in the browser; checked after mount to match the server render
  useEffect(() => { setCanShare('share' in navigator); }, []);
  const btn = 'btn sm';
  return (
    <div className="flex gap-2 flex-wrap items-center mt-2">
      <button type="button" className={btn} onClick={copy}>{copied ? labels.copied : labels.copy}</button>
      {digits && <a className={btn} href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">{labels.whatsapp}</a>}
      {digits && (pref === 'zalo' || !pref) && <a className={btn} href={`https://zalo.me/${digits}`} target="_blank" rel="noopener" onClick={copy}>{labels.zalo}</a>}
      {email && <a className={btn} href={`mailto:${email}?body=${encodeURIComponent(text)}`}>{labels.email}</a>}
      {canShare && <button type="button" className={btn} onClick={() => navigator.share({ text }).catch(() => {})}>{labels.share}</button>}
      <span className="ml-auto">{children}</span>
    </div>
  );
}
