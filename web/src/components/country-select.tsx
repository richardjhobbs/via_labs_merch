'use client';
// Country picker: a searchable list with flag and full name in the page's language. Submits the two-letter code.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { COUNTRIES, countryName, flagSrc } from '@/lib/countries';

export function CountryFlag({ code, size = 18 }: { code: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={flagSrc(code)} alt="" width={size} height={Math.round((size * 3) / 4)} loading="lazy" className="cs-flag" />;
}

export function CountrySelect({ name, defaultValue = '', label }: { name: string; defaultValue?: string | null; label: string }) {
  const locale = useLocale();
  const t = useTranslations('parties');
  const [value, setValue] = useState((defaultValue || '').toUpperCase());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null), list = useRef<HTMLUListElement>(null);

  const all = useMemo(() => COUNTRIES.map((code) => ({ code, name: countryName(code, locale), en: countryName(code, 'en') })).sort((a, b) => a.name.localeCompare(b.name, locale)), [locale]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? all.filter((c) => c.name.toLowerCase().includes(s) || c.en.toLowerCase().includes(s) || c.code.toLowerCase() === s) : all;
  }, [all, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const choose = (code: string) => { setValue(code); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active].code); }
  };

  return (
    <div className="cs" ref={wrap}>
      <input type="hidden" name={name} value={value} />
      <button type="button" className="input cs-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => { setOpen((o) => !o); setActive(0); }}>
        {value ? <><CountryFlag code={value} /><span className="cs-name" suppressHydrationWarning>{countryName(value, locale)}</span></> : <span className="muted cs-name">{t('countryPick')}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="cs-menu">
          <input className="input" autoFocus value={q} placeholder={t('countrySearch')} aria-label={t('countrySearch')} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
          <ul role="listbox" aria-label={label} ref={list}>
            {shown.map((c, i) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button type="button" className={(i === active ? 'active ' : '') + (c.code === value ? 'on' : '')} onMouseEnter={() => setActive(i)} onClick={() => choose(c.code)}><CountryFlag code={c.code} /><span>{c.name}</span></button>
              </li>
            ))}
            {!shown.length && <li className="muted small" style={{ padding: 8 }}>{t('countryNone')}</li>}
          </ul>
          {value && <button type="button" className="btn sm mt-2" onClick={() => choose('')}>{t('countryClear')}</button>}
        </div>
      )}
    </div>
  );
}
