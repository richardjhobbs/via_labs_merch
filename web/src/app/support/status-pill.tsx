import type { TicketStatus } from '@/lib/helpdesk/desk';

const TONE: Record<TicketStatus, string> = { open: 'agent', answered: 'ok', with_via: 'warn', logged: 'warn', planned: 'warn', building: 'agent', shipped: 'ok', declined: '', closed: '' };
export function StatusPill({ status, label }: { status: TicketStatus; label: string }) {
  return <span className={`pill ${TONE[status] || ''}`}>{label}</span>;
}
