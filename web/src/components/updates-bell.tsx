'use client';
// Updates from VIA Labs inside the workspace: a bell with the unread count that opens the latest headlines,
// and a one-line notice for the newest unread one. The full text lives on the support desk; opening it there
// marks everything read. Dismiss marks read without leaving the page. Every link to the desk opens in a new tab,
// so the workspace page stays where it was while the person waits for a reply.
import { useState, useTransition } from 'react';
import { dismissUpdates, dismissTicket } from '@/app/app/[tenant]/update-actions';

// href and tag are set for a support ticket VIA Labs replied on or completed; an update has neither
export type BellItem = { id: string; title: string; unread: boolean; when: string; href?: string; tag?: string };
type Labels = { updates: string; all: string; isNew: string; readMore: string; dismiss: string; none: string };

// Links to the desk open in a new tab. The desk marks an update or ticket read when it opens, so a notice
// hides itself in this tab once its link is followed.
const DESK = { target: '_blank', rel: 'noopener' } as const;

const Bell = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

export function UpdatesBell({ items, href, labels }: { items: BellItem[]; href: string; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => i.unread).length;
  return (
    <div className="mt-2">
      <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bell />{labels.updates}{unread > 0 && <span className="pill agent" style={{ padding: '0 6px' }}>{unread}</span>}
      </button>
      {open && <div className="grid gap-2 mt-2">
        {items.map((i) => <a key={i.id} href={i.href || href} {...DESK} className="block no-underline" style={{ color: 'inherit', lineHeight: 1.35 }}>{i.unread && <span className={`pill ${i.tag ? 'ok' : 'agent'}`} style={{ marginRight: 6 }}>{i.tag || labels.isNew}</span>}<b style={{ fontWeight: i.unread ? 600 : 400 }}>{i.title}</b><div className="muted" style={{ fontSize: 11.5 }}>{i.when}</div></a>)}
        {!items.length && <div className="muted">{labels.none}</div>}
        <a href={href} {...DESK}>{labels.all} →</a>
      </div>}
    </div>
  );
}

export function UpdateNotice({ slug, item, href, labels }: { slug: string; item: BellItem; href: string; labels: Labels }) {
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  if (gone) return null;
  return (
    <div className="notice mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="pill agent">{labels.isNew}</span>
      <b className="min-w-0" style={{ flex: '1 1 200px' }}>{item.title}</b>
      <a href={href} {...DESK} onClick={() => setGone(true)}>{labels.readMore} →</a>
      <button type="button" aria-label={labels.dismiss} title={labels.dismiss} onClick={() => { setGone(true); start(() => dismissUpdates(slug, [item.id])); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

// A support ticket VIA Labs replied on or completed (for example "Live"), shown above the workspace page.
export function TicketNotice({ slug, item, labels }: { slug: string; item: BellItem; labels: Labels }) {
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  if (gone) return null;
  return (
    <div className="notice mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="pill ok">{item.tag}</span>
      <b className="min-w-0" style={{ flex: '1 1 200px' }}>{item.title}</b>
      <a href={item.href} {...DESK} onClick={() => setGone(true)}>{labels.readMore} →</a>
      <button type="button" aria-label={labels.dismiss} title={labels.dismiss} onClick={() => { setGone(true); start(() => dismissTicket(slug, item.id)); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}
