'use client';
// A table row that navigates on click, while links inside it keep working.
import { useRouter } from 'next/navigation';

export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return <tr className={`click ${className || ''}`} onClick={(e) => { if ((e.target as HTMLElement).closest('a, button')) return; router.push(href); }}>{children}</tr>;
}
