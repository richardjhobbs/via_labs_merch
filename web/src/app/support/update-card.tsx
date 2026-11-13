import type { Update } from '@/lib/helpdesk/updates';

export function UpdateCard({ u, locale, labels, short = false }: { u: Update; locale: string; labels: { isNew: string; onRequest: string; onRequestNote: string }; short?: boolean }) {
  return (
    <div className="card" style={{ padding: '12px 14px', opacity: u.locked ? 0.85 : 1 }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b>{u.title}</b>
        {u.unread && <span className="pill agent">{labels.isNew}</span>}
        {u.locked && <span className="pill warn">{labels.onRequest}</span>}
        <span className="muted small ml-auto">{new Date(u.published_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
      <p className="small mt-2" style={{ whiteSpace: 'pre-wrap', color: 'var(--fg2)', ...(short ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>{u.body}</p>
      {u.locked && !short && <p className="muted small mt-2">{labels.onRequestNote}</p>}
    </div>
  );
}
