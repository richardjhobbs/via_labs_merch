'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { closeTicket } from './actions';

export function CloseButton({ slug, id, label }: { slug: string; id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="btn sm ml-auto" disabled={pending} onClick={() => start(async () => { await closeTicket(slug, id); router.refresh(); })}>{label}</button>;
}
