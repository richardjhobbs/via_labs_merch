'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Rail({ base, items }: { base: string; items: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(([seg, label]) => {
        const href = seg ? `${base}/${seg}` : base;
        const on = seg ? path.startsWith(href) : path === base;
        return <Link key={seg} href={href} className={on ? 'on' : ''}>{label}</Link>;
      })}
    </nav>
  );
}
