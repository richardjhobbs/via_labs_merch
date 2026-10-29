// A chain of messages: theirs on the left, ours on the right, original text with the English rendering.
export type ChainMsg = { id: string; direction: 'in' | 'out'; sender_name: string | null; role?: string | null; lang: string | null; text: string; text_en: string | null; stream: string | null; received_at: string; sent_at: string | null };

export function Chain({ messages, tz, labels }: { messages: ChainMsg[]; tz: string; labels: { original: string; awaiting: string; us: string } }) {
  return (
    <div className="grid gap-2">
      {messages.map((m) => {
        const out = m.direction === 'out', en = m.text_en && m.text_en !== m.text;
        return (
          <div key={m.id} className={out ? 'ml-auto' : ''} style={{ maxWidth: '88%' }}>
            <div className="small muted mb-1" style={{ textAlign: out ? 'right' : 'left' }}>{out ? `${labels.us} · ${m.sender_name || ''}` : `${m.sender_name || ''}${m.role ? ` · ${m.role}` : ''}`} · {new Date(m.received_at).toLocaleString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.stream ? ` · ${m.stream}` : ''}{out && m.sent_at === null ? ` · ${labels.awaiting}` : ''}</div>
            <div className="p-3 small" style={{ background: out ? '#fff' : 'var(--accent)', color: out ? 'inherit' : '#fff', border: out ? '1px solid var(--line)' : 0, borderRadius: 10, whiteSpace: 'pre-wrap' }}>
              {en ? m.text_en : m.text}
              {en && <details className="mt-2" style={{ opacity: .85 }}><summary style={{ cursor: 'pointer', fontSize: 11 }}>{labels.original} ({m.lang})</summary><div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div></details>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
