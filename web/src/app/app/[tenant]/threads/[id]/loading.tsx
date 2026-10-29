export default function Loading() {
  return (
    <div className="max-w-5xl">
      <div className="small muted">Conversations ›</div>
      <div className="mt-2" style={{ height: 28, width: 360, background: 'var(--line2)', borderRadius: 6 }} />
      <div className="grid gap-6 mt-5 lg:grid-cols-[1fr_320px]">
        <div className="card" style={{ minHeight: 240 }}><div className="muted small">Opening the conversation…</div></div>
        <div className="card" style={{ background: 'var(--accent-soft)' }}><div className="small font-medium" style={{ color: 'var(--accent)' }}>Where we are</div><div className="muted small mt-2">The agent is reading the chain and writing the summary…</div></div>
      </div>
    </div>
  );
}
