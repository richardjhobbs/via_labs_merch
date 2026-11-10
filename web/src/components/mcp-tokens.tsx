'use client';
// The create form of the "Your agents" card: calls the server action and shows the new token once.
import { useState, useTransition } from 'react';
import { issueMcpToken, type IssueResult } from '@/app/app/[tenant]/mcp-actions';
import { CopyButton } from './copy-button';

type Labels = { name: string; namePh: string; tracks: string; development: string; production: string; writes: string; noWrites: string; create: string; shownOnce: string; copy: string; copied: string; errRole: string; errName: string; errLimit: string; errOwn: string };

export function McpCreate({ slug, tracks, canWrite, labels }: { slug: string; tracks: string[]; canWrite: boolean; labels: Labels }) {
  const [result, setResult] = useState<IssueResult | null>(null);
  const [pending, start] = useTransition();
  const err = result && 'error' in result ? result.error : null;
  const ERR: Record<string, string> = { role: labels.errRole, name: labels.errName, limit: labels.errLimit, own: labels.errOwn };
  if (result && 'token' in result) {
    return (
      <div className="notice mt-4">
        <div className="small">{labels.shownOnce.replace('{when}', new Date(result.expires).toLocaleDateString('en-GB', { dateStyle: 'long' }))}</div>
        <div className="flex items-center gap-2 mt-2 flex-wrap"><code className="small" style={{ wordBreak: 'break-all', padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6 }}>{result.token}</code><CopyButton text={result.token} label={labels.copy} done={labels.copied} /></div>
      </div>
    );
  }
  return (
    <form className="grid gap-3 mt-4" action={(fd) => start(async () => setResult(await issueMcpToken(slug, fd)))}>
      {err && <div className="notice crit">{ERR[err] || err}</div>}
      <label className="f" style={{ marginBottom: 0 }}><span>{labels.name}</span><input className="input" name="name" placeholder={labels.namePh} maxLength={60} required /></label>
      {tracks.length > 1 && (
        <div className="f" style={{ marginBottom: 0 }}><span>{labels.tracks}</span>
          <div className="flex gap-4 mt-1 small">{tracks.map((t) => <label key={t} className="flex items-center gap-2"><input type="checkbox" name="tracks" value={t} defaultChecked /> {t === 'development' ? labels.development : labels.production}</label>)}</div>
        </div>
      )}
      {canWrite ? <label className="flex items-start gap-2 small"><input type="checkbox" name="writes" className="mt-1" /><span>{labels.writes}</span></label> : <p className="muted small">{labels.noWrites}</p>}
      <div><button className="btn primary" disabled={pending}>{labels.create}</button></div>
    </form>
  );
}
