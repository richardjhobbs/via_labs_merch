// Locale: the merch_locale cookie (set by the language picker) wins; without it, the visitor's
// country from Vercel's x-vercel-ip-country header, then the browser's Accept-Language, then English.
// No URL prefixes: the product is behind a login and the language is per person.
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALES, type Locale } from './locales';

const BY_COUNTRY: Record<string, Locale> = {
  DE: 'de', AT: 'de', CH: 'de', LI: 'de', LU: 'de',
  BD: 'bn',
  CN: 'zh', HK: 'zh', MO: 'zh', TW: 'zh',
  VN: 'vi',
  ES: 'es', MX: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', CU: 'es', DO: 'es', PR: 'es',
  CO: 'es', VE: 'es', EC: 'es', PE: 'es', BO: 'es', CL: 'es', AR: 'es', UY: 'es', PY: 'es',
};
const isLocale = (v: string | undefined): v is Locale => (LOCALES as readonly string[]).includes(v || '');

async function detect(): Promise<Locale> {
  const c = (await cookies()).get('merch_locale')?.value;
  if (isLocale(c)) return c;
  const h = await headers();
  const country = BY_COUNTRY[(h.get('x-vercel-ip-country') || '').toUpperCase()];
  if (country) return country;
  for (const part of (h.get('accept-language') || '').split(',')) {
    const lang = part.trim().split(/[-;]/)[0].toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return 'en';
}

export default getRequestConfig(async () => {
  const locale = await detect();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const fallback = locale === 'en' ? {} : (await import('../../messages/en.json')).default;
  return { locale, messages: { ...fallback, ...messages } };
});
