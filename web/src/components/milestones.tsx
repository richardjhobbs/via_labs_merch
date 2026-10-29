import { isoOf, type PathPoint, type Health } from '@/lib/core/path';

const COLOR: Record<PathPoint['status'], string> = { done: 'var(--ok)', late: 'var(--crit)', risk: 'var(--warn)', due: 'var(--accent)', pending: 'var(--muted)' };
const short = (d: number) => new Date(d * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function MsCell({ m }: { m: PathPoint }) {
  const d = m.status === 'done' ? (m.actual as number) : m.f;
  return <span className="small" style={{ color: COLOR[m.status], whiteSpace: 'nowrap' }} title={`${m.status} · plan ${isoOf(m.plan)}${m.slip > 0 ? ', forecast ' + isoOf(m.f) : ''}`}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: COLOR[m.status], marginRight: 5, verticalAlign: 'middle' }} />{short(d)}</span>;
}

export function HealthPill({ h }: { h: Health }) {
  const cls = h.state === 'red' ? 'crit' : h.state === 'amber' ? 'warn' : 'ok';
  const label = h.state === 'red' ? (h.etdSlip > 0 ? `ETD +${h.etdSlip}d` : 'Late') : h.state === 'amber' ? 'At risk' : 'On plan';
  return <span className={`pill ${cls}`}>{label}</span>;
}
