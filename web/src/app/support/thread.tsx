// The messages of one support conversation. Screenshots open through /api/support/file after RLS.
export type ThreadMsg = { id: string; kind: 'person' | 'agent' | 'via'; name: string; body: string; files: number; when: string };

export function Thread({ messages }: { messages: ThreadMsg[] }) {
  return (
    <div className="grid gap-3 mt-5">
      {messages.map((m) => (
        <div key={m.id} style={{ display: 'grid', gap: 4, justifyItems: m.kind === 'person' ? 'end' : 'start' }}>
          <div className="muted small"><b style={{ color: 'var(--fg2)' }}>{m.name}</b> · {m.when}</div>
          <div style={{ maxWidth: '88%', padding: '10px 13px', borderRadius: 10, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(m.kind === 'person' ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: m.kind === 'via' ? '3px solid var(--highlight)' : undefined }) }}>{m.body}</div>
          {m.files > 0 && <div className="flex flex-wrap gap-2">{Array.from({ length: m.files }, (_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <a key={i} href={`/api/support/file?m=${m.id}&i=${i}`} target="_blank" rel="noopener"><img src={`/api/support/file?m=${m.id}&i=${i}`} alt="" style={{ height: 84, borderRadius: 8, border: '1px solid var(--line)' }} /></a>
          ))}</div>}
        </div>
      ))}
    </div>
  );
}
