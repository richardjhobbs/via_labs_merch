'use client';
// The customer or supplier fields, shared by Add, Edit and the document review. `prefix` namespaces the inputs
// when two parties share one form.
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CountrySelect } from '@/components/country-select';
import { LANGUAGES, languageName } from '@/lib/countries';

const CUSTOMER_KINDS = ['brand', 'retailer', 'store', 'buying_office', 'trading'];
const SUPPLIER_KINDS = ['factory', 'mill', 'fibre', 'forwarder', 'carrier', 'lab', 'auditor', 'other'];
const FINANCE_KINDS = ['bank', 'funder'];
const TIER_OF: Record<string, string> = { factory: '1', mill: '2', fibre: '3' };
const CHANNELS: [string, string][] = [['email_gmail', 'Gmail'], ['email_m365', 'Microsoft 365'], ['whatsapp', 'WhatsApp'], ['wecom', 'WeCom'], ['zalo', 'Zalo'], ['telegram', 'Telegram'], ['via_agent', 'VIA']];

export type PartyDefaults = { name?: string | null; kind?: string | null; country?: string | null; city?: string | null; address?: string | null; lang?: string | null; tier?: number | null; channel_pref?: string | null; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null };

export function PartyFields({ defaults = {}, prefix = '' }: { defaults?: PartyDefaults; prefix?: string }) {
  const t = useTranslations('parties');
  const locale = useLocale();
  const n = (f: string) => prefix + f;
  const startKind = defaults.kind || 'brand';
  const [kind, setKind] = useState(startKind);
  const [tier, setTier] = useState(defaults.tier ? String(defaults.tier) : TIER_OF[startKind] || '');
  const langs = defaults.lang && !LANGUAGES.includes(defaults.lang) ? [...LANGUAGES, defaults.lang] : LANGUAGES;
  const channels: [string, string][] = defaults.channel_pref && !CHANNELS.some(([v]) => v === defaults.channel_pref) ? [...CHANNELS, [defaults.channel_pref, defaults.channel_pref.replace('_', ' ')]] : CHANNELS;
  const group = (label: string, list: string[]) => <optgroup label={label}>{list.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</optgroup>;
  return (
    <>
      <label className="f"><span>{t('name')}</span><input className="input" name={n('name')} required maxLength={120} defaultValue={defaults.name || ''} /></label>
      <label className="f"><span>{t('kind')}</span><select className="input" name={n('kind')} value={kind} onChange={(e) => { setKind(e.target.value); setTier(TIER_OF[e.target.value] || ''); }}>{group(t('customers'), CUSTOMER_KINDS)}{group(t('suppliers'), SUPPLIER_KINDS)}{group(t('finance'), FINANCE_KINDS)}</select></label>
      {(TIER_OF[kind] || tier) && <label className="f"><span>{t('tier')}</span><select className="input" name={n('tier')} value={tier} onChange={(e) => setTier(e.target.value)}><option value="">–</option><option value="1">{t('tier1')}</option><option value="2">{t('tier2')}</option><option value="3">{t('tier3')}</option></select></label>}
      <div className="f"><span style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 12.5, color: 'var(--fg2)' }}>{t('country')}</span><CountrySelect name={n('country')} defaultValue={defaults.country} label={t('country')} /></div>
      <label className="f mt-3"><span>{t('city')}</span><input className="input" name={n('city')} maxLength={60} defaultValue={defaults.city || ''} /></label>
      <label className="f"><span>{t('address')}</span><input className="input" name={n('address')} maxLength={200} defaultValue={defaults.address || ''} /></label>
      <label className="f"><span>{t('lang')}</span><select className="input" name={n('lang')} defaultValue={defaults.lang || 'en'}>{langs.map((l) => <option key={l} value={l} suppressHydrationWarning>{languageName(l, locale)}</option>)}</select></label>
      <label className="f"><span>{t('channel')}</span><select className="input" name={n('channel_pref')} defaultValue={defaults.channel_pref || ''}><option value="">{t('channelNone')}</option>{channels.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="f"><span>{t('contact')}</span><input className="input" name={n('contact_name')} maxLength={80} defaultValue={defaults.contact_name || ''} /></label>
      <label className="f"><span>{t('email')}</span><input className="input" name={n('contact_email')} type="email" maxLength={120} defaultValue={defaults.contact_email || ''} /></label>
      <label className="f"><span>{t('phone')}</span><input className="input" name={n('contact_phone')} maxLength={30} placeholder="+880…" defaultValue={defaults.contact_phone || ''} /></label>
    </>
  );
}
