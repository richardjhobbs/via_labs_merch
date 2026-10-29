// Locale comes from the signed-in member's setting, else a cookie, else English.
// No URL prefixes: the product is behind a login and the language is per person.
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { LOCALES, type Locale } from './locales';

export default getRequestConfig(async () => {
  const c = (await cookies()).get('merch_locale')?.value;
  const locale = (LOCALES as readonly string[]).includes(c || '') ? (c as Locale) : 'en';
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const fallback = locale === 'en' ? {} : (await import('../../messages/en.json')).default;
  return { locale, messages: { ...fallback, ...messages } };
});
