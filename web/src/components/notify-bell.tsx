'use client';
// A bell with a count that opens a short list of links. Used on the support desk (replies from VIA Labs on
// the person's tickets) and in the VIA console (tickets that are new or have a new message).
import { useEffect, useRef, useState } from 'react';

export type NotifyItem = { href: string; title: string; sub: string };

export function NotifyBell({ items, label, empty }: { items: NotifyItem[]; label: string; empty: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" className="btn sm" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {items.length > 0 && <span style={{ minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--crit)', color: '#fff', fontSize: 11, fontWeight: 600, lineHeight: '17px', textAlign: 'center' }}>{items.length > 99 ? '99+' : items.length}</span>}
      </button>
      {open && (
        <div className="card" role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 'min(340px, calc(100vw - 32px))', maxHeight: 380, overflowY: 'auto', padding: 8, boxShadow: '0 12px 32px rgba(20,24,22,.16)' }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 8px' }}>{label}</div>
          {items.map((i) => (
            <a key={i.href} href={i.href} className="block no-underline" style={{ color: 'inherit', padding: '7px 8px', borderRadius: 6 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{i.title}</b>
              <span className="muted" style={{ fontSize: 11.5 }}>{i.sub}</span>
            </a>
          ))}
          {!items.length && <div className="muted small" style={{ padding: '6px 8px' }}>{empty}</div>}
        </div>
      )}
    </div>
  );
}
