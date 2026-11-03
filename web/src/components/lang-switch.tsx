'use client';
// Language picker: a flag-and-name button with a menu, so people notice it. Flags are inline SVG
// (Windows does not draw flag emoji). Choosing sets the merch_locale cookie, which overrides the
// country-based default in src/i18n/request.ts.
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';

const star = (cx: number, cy: number, r: number, rot = 0) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.382 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return p.join(' ');
};

export function Flag({ locale, size = 20 }: { locale: Locale; size?: number }) {
  const w = size, h = Math.round((size * 2) / 3);
  const box = { width: w, height: h, style: { display: 'block', borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,.12)' } as const };
  switch (locale) {
    case 'en':
      return (
        <svg {...box} viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="60" height="40" fill="#012169" />
          <path d="M0,0 60,40 M60,0 0,40" stroke="#fff" strokeWidth="8" />
          <path d="M0,0 60,40 M60,0 0,40" stroke="#C8102E" strokeWidth="3" />
          <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="12" />
          <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="7" />
        </svg>
      );
    case 'de':
      return (
        <svg {...box} viewBox="0 0 30 20" aria-hidden="true">
          <rect width="30" height="7" fill="#000" /><rect y="6.67" width="30" height="6.67" fill="#DD0000" /><rect y="13.33" width="30" height="6.67" fill="#FFCE00" />
        </svg>
      );
    case 'bn':
      return (
        <svg {...box} viewBox="0 0 30 20" aria-hidden="true">
          <rect width="30" height="20" fill="#006A4E" /><circle cx="13.5" cy="10" r="6" fill="#F42A41" />
        </svg>
      );
    case 'zh':
      return (
        <svg {...box} viewBox="0 0 30 20" aria-hidden="true">
          <rect width="30" height="20" fill="#EE1C25" />
          <polygon points={star(5, 5, 3)} fill="#FFDE00" />
          {[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => <polygon key={`${x}${y}`} points={star(x, y, 1)} fill="#FFDE00" />)}
        </svg>
      );
    case 'vi':
      return (
        <svg {...box} viewBox="0 0 30 20" aria-hidden="true">
          <rect width="30" height="20" fill="#DA251D" /><polygon points={star(15, 10.5, 6)} fill="#FFFF00" />
        </svg>
      );
    case 'es':
      return (
        <svg {...box} viewBox="0 0 30 20" aria-hidden="true">
          <rect width="30" height="20" fill="#AA151B" /><rect y="5" width="30" height="10" fill="#F1BF00" />
        </svg>
      );
  }
}

export function LangSwitch({ compact = false, up = false }: { compact?: boolean; up?: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const choose = (l: Locale) => {
    setOpen(false);
    if (l === locale) return;
    document.cookie = `merch_locale=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div className={'lang' + (compact ? ' compact' : '') + (up ? ' up' : '')} ref={wrap}>
      <button type="button" className="lang-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t('language')}: ${LOCALE_NAMES[locale]}`} onClick={() => setOpen((o) => !o)}>
        <Flag locale={locale} size={compact ? 18 : 22} />
        <span>{LOCALE_NAMES[locale]}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox" aria-label={t('language')}>
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button type="button" lang={l} className={l === locale ? 'on' : ''} onClick={() => choose(l)}>
                <Flag locale={l} size={22} /><span>{LOCALE_NAMES[l]}</span>
                {l === locale && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ marginLeft: 'auto' }}><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
