'use client';
// VIA admins can walk a workspace as any member, to demonstrate the manager and merchandiser viewpoints.
import { useTransition } from 'react';
import { setViewAs } from '@/app/app/[tenant]/view-actions';

export function ViewAs({ slug, current, members, label, self }: { slug: string; current: string; members: { id: string; name: string; role: string }[]; label: string; self: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="grid gap-1 small mt-2">
      <span className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</span>
      <select className="input sm" value={current} disabled={pending} onChange={(e) => start(() => setViewAs(slug, e.target.value))}>
        <option value="">{self}</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
      </select>
    </label>
  );
}
