'use client';
// A table row that opens its record when clicked anywhere, not only on the link in its first cell.
// Clicks on links, buttons and form fields inside the row keep their own behaviour; Ctrl/Cmd-click opens a new tab.
import { useRouter } from 'next/navigation';

export function RowLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr className={`click ${className}`} onMouseEnter={() => router.prefetch(href)} onClick={(e) => {
      if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label')) return;
      if (e.metaKey || e.ctrlKey) { window.open(href, '_blank'); return; }
      router.push(href);
    }}>{children}</tr>
  );
}
