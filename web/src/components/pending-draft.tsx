// The agent's reply waiting for approval, shown at the end of the chain it answers.
import Link from 'next/link';
import { approveDraft, rejectDraft } from '@/app/app/[tenant]/queue/actions';

export type PendingDraft = { id: string; seq: number; title: string; body: string; body_en: string | null; lang: string | null; stream: string; gate_level: number; impact: string | null; priority: number };

export function PendingDraftCard({ slug, back, d, labels }: { slug: string; back: string; d: PendingDraft; labels: { waiting: string; approve: string; hold: string; reject: string; impact: string; english: string } }) {
  const en = d.body_en && d.lang && d.lang !== 'en';
  return (
    <div className="ml-auto" style={{ maxWidth: '88%', borderLeft: '3px solid var(--highlight)', paddingLeft: 10 }}>
      <div className="small muted mb-1" style={{ textAlign: 'right' }}>{labels.waiting} · <span className="mono">Q-{d.seq}</span> · {d.stream} · L{d.gate_level}</div>
      <div className="p-3 small" style={{ background: '#fffbf0', border: '1px dashed #e0c98a', borderRadius: 10, whiteSpace: 'pre-wrap' }}>
        <div className="font-medium mb-1">{d.title}</div>
        {d.body}
        {en && <details className="mt-2"><summary style={{ cursor: 'pointer', fontSize: 11 }}>{labels.english}</summary><div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{d.body_en}</div></details>}
        {d.impact && <div className="muted mt-2">{labels.impact}: {d.impact}</div>}
        <form action={approveDraft} className="flex gap-2 mt-3 flex-wrap"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={back} />
          <button className="btn primary sm">{labels.approve}</button><Link className="btn sm" href={`/app/${slug}/queue`}>{labels.hold}</Link><button className="btn sm" formAction={rejectDraft}>{labels.reject}</button></form>
      </div>
    </div>
  );
}
