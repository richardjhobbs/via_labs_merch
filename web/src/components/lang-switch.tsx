'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_NAMES } from '@/i18n/locales';

export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  return (
    <select aria-label={t('language')} className={compact ? 'input' : 'btn sm'} value={locale} style={compact ? { width: 'auto' } : {}}
      onChange={(e) => { document.cookie = `merch_locale=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}>
      {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
    </select>
  );
}
