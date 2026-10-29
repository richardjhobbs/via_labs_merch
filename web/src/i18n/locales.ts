export const LOCALES = ['en', 'de', 'bn', 'zh', 'vi', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch', bn: 'বাংলা', zh: '中文', vi: 'Tiếng Việt', es: 'Español' };
