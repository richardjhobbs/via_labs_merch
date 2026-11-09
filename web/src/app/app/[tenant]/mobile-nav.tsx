'use client';
// Phone navigation (below 768 px; the rail takes over above): a top bar with the workspace and a menu button,
// a bottom tab bar for the four screens a merchandiser lives in, and a sheet with every other page and the account
// controls. The sheet closes on navigation, Escape or a tap outside.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';

const ICONS: Record<string, React.ReactNode> = {
  '': <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  queue: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>,
  orders: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  threads: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  styles: <><path d="M6 3h12l-2 5H8z" /><path d="M8 8v13h8V8" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
const Icon = ({ k }: { k: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>;

export function MobileNav({ base, tenantName, sub, items, tabs, labels, brand, children }: {
  base: string; tenantName: string; sub: string;
  items: [string, string][]; tabs: [string, string][];
  labels: { more: string; menu: string; close: string };
  brand?: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isOn = (seg: string) => { const href = seg ? `${base}/${seg}` : base; return seg ? path.startsWith(href) : path === base; };
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open]);
  const moreOn = !tabs.some(([seg]) => isOn(seg));
  const current = items.find(([seg]) => isOn(seg))?.[1];
  return (
    <>
      <header className="mbar md:hidden">
        <Link href={base} aria-label={tenantName} className="flex items-center"><Logo merch adaptive h={30} /></Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-semibold small">{current || tenantName}</div>
          <div className="truncate muted" style={{ fontSize: 11.5 }}>{tenantName}</div>
        </div>
        <button className="btn sm" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="m-sheet">{labels.menu}</button>
      </header>
      {!!tabs.length && (
        <nav className="mtabs md:hidden" aria-label={labels.menu}>
          {tabs.map(([seg, label]) => (
            <Link key={seg} href={seg ? `${base}/${seg}` : base} className={isOn(seg) ? 'on' : ''} aria-current={isOn(seg) ? 'page' : undefined}><Icon k={seg} /><span>{label}</span></Link>
          ))}
          <button type="button" className={moreOn ? 'on' : ''} onClick={() => setOpen(true)} aria-expanded={open} aria-controls="m-sheet"><Icon k="more" /><span>{labels.more}</span></button>
        </nav>
      )}
      {open && (
        <div className="msheet-bg md:hidden" onClick={() => setOpen(false)}>
          <div id="m-sheet" className="msheet" role="dialog" aria-modal="true" aria-label={labels.menu} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pb-2">
              {brand}
              <div className="min-w-0 flex-1"><b className="small">{tenantName}</b><div className="muted small">{sub}</div></div>
              <button className="btn sm" onClick={() => setOpen(false)} aria-label={labels.close}>×</button>
            </div>
            <nav className="mlist">
              {items.map(([seg, label]) => <Link key={seg} href={seg ? `${base}/${seg}` : base} className={isOn(seg) ? 'on' : ''}>{label}</Link>)}
            </nav>
            <div className="small pt-3 mt-2" style={{ borderTop: '1px solid var(--line2)' }}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
