'use client';
// "Choose from Google Drive": opens Google's own file picker. Picking a file is what grants VIA Merch
// access to it (drive.file), so nothing else in the person's Drive is visible to the app.
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { pickerConfig } from '@/app/app/[tenant]/drive-actions';

type G = { load: (lib: string, cb: () => void) => void };
type PickerNS = {
  DocsView: new (viewId?: string) => { setMimeTypes: (m: string) => unknown; setIncludeFolders: (b: boolean) => unknown; setMode: (m: string) => unknown };
  ViewId: { SPREADSHEETS: string; DOCS: string };
  DocsViewMode: { LIST: string };
  PickerBuilder: new () => { addView: (v: unknown) => PB } & PB;
  Action: { PICKED: string; CANCEL: string };
};
type PB = { addView: (v: unknown) => PB; setOAuthToken: (t: string) => PB; setDeveloperKey: (k: string) => PB; setAppId: (a: string) => PB; setCallback: (cb: (d: { action: string; docs?: { id: string; name: string }[] }) => void) => PB; setTitle: (t: string) => PB; build: () => { setVisible: (v: boolean) => void } };

const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.document'].join(',');

let loading: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  const w = window as unknown as { gapi?: G; google?: { picker?: PickerNS } };
  if (w.google?.picker) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js'; s.async = true;
    s.onload = () => w.gapi!.load('picker', () => resolve());
    s.onerror = () => { loading = null; reject(new Error('picker script')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function DrivePicker({ tenant, kind, disabled, onPick }: { tenant: string; kind: 'sheet' | 'doc'; disabled?: boolean; onPick: (file: { id: string; name: string }) => void }) {
  const t = useTranslations('drive');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'' | 'notReady' | 'notConnected' | 'viewer' | 'failed'>('');
  async function open() {
    setBusy(true); setProblem('');
    try {
      const cfg = await pickerConfig(tenant);
      if (!cfg.ok) { setProblem(cfg.reason); return; }
      await loadPicker();
      const P = (window as unknown as { google: { picker: PickerNS } }).google.picker;
      const view = kind === 'sheet' ? new P.DocsView(P.ViewId.SPREADSHEETS) : new P.DocsView(P.ViewId.DOCS);
      if (kind === 'doc') view.setMimeTypes(DOC_TYPES);
      view.setMode(P.DocsViewMode.LIST);
      new P.PickerBuilder().addView(view).setOAuthToken(cfg.token).setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setTitle(kind === 'sheet' ? t('titleSheet') : t('titleDoc'))
        .setCallback((d) => { if (d.action === P.Action.PICKED && d.docs?.[0]) onPick({ id: d.docs[0].id, name: d.docs[0].name }); })
        .build().setVisible(true);
    } catch { setProblem('failed'); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-grid gap-1">
      <button type="button" className="btn" onClick={open} disabled={disabled || busy}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0f9d58" d="M8.3 3h7.4l6.3 11-3.7 6.4L12 9.3z" opacity=".9" /><path fill="#4285f4" d="M2 14 5.7 20.4h12.6L22 14H9.4z" opacity=".9" /><path fill="#f4b400" d="M8.3 3 2 14l3.7 6.4L12 9.3z" opacity=".9" /></svg>
        {busy ? t('opening') : kind === 'sheet' ? t('pickSheet') : t('pickDoc')}
      </button>
      {problem === 'notConnected' && <span className="small muted">{t('notConnected')} <Link href={`/app/${tenant}/connections`}>{t('connectLink')}</Link></span>}
      {problem && problem !== 'notConnected' && <span className="small" style={{ color: 'var(--crit)' }}>{t(problem)}</span>}
    </span>
  );
}
