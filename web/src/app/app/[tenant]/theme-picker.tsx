'use client';
// Day, night or follow the device: saved in a cookie on this browser by setTheme, applied by the workspace layout.
import { useState, useTransition } from 'react';
import { setTheme, type Theme } from './profile-actions';

export function ThemePicker({ slug, current, labels }: { slug: string; current: Theme; labels: Record<Theme, string> }) {
  const [val, setVal] = useState<Theme>(current);
  const [pending, start] = useTransition();
  const pick = (v: Theme) => { setVal(v); start(() => setTheme(slug, v)); };
  return (
    <div className="seg mt-3" role="radiogroup" aria-busy={pending}>
      {(['light', 'dark', 'system'] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={val === v} className={val === v ? 'on' : ''} onClick={() => pick(v)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {v === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
              : v === 'dark' ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              : <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>}
          </svg>
          {labels[v]}
        </button>
      ))}
    </div>
  );
}
