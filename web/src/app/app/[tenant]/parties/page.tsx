import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { CountryFlag } from '@/components/country-select';
import { countryName, languageName } from '@/lib/countries';
import { addParty } from './actions';
import { PartyFields } from './party-fields';

const CUSTOMER = new Set(['brand', 'retailer', 'store', 'buying_office', 'trading']);

export default async function Parties({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug } = await params; const { error, saved } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const [t, locale] = await Promise.all([getTranslations('parties'), getLocale()]);
  const sb = await supabaseServer();
  const [{ data: parties }, { data: orders }, { data: pendingBank }] = await Promise.all([
    sb.from('parties').select('id, kind, name, short, country, city, tier, lang, channel_pref, score, meta, contacts(name, role, email, phone)').eq('tenant_id', tenant.id).order('kind').order('name'),
    sb.from('orders').select('customer_id, factory_id, mill_id, fibre_id').eq('tenant_id', tenant.id).eq('status', 'open'),
    sb.from('party_bank_accounts').select('party_id').eq('tenant_id', tenant.id).eq('status', 'pending'),
  ]);
  const bankToConfirm = new Set((pendingBank || []).map((b) => b.party_id));
  const count = (id: string) => (orders || []).filter((o) => [o.customer_id, o.factory_id, o.mill_id, o.fibre_id].includes(id)).length;
  const customers = (parties || []).filter((p) => CUSTOMER.has(p.kind)), suppliers = (parties || []).filter((p) => !CUSTOMER.has(p.kind));
  const canEdit = membership.role !== 'viewer';
  const tierLabel = (n: number) => (n === 1 || n === 2 || n === 3 ? t(`tier${n}`) : `T${n}`);
  const Table = ({ rows, supplier }: { rows: typeof customers; supplier?: boolean }) => (
    <div className="card tw" style={{ padding: 0 }}><table className="t"><thead><tr><th>{t('name')}</th><th>{t('kind')}</th><th>{t('location')}</th>{supplier && <th>{t('tier')}</th>}<th>{t('contact')}</th><th>{t('lang')}</th><th>{t('channel')}</th>{supplier && <th>{t('score')}</th>}<th className="text-right">{t('openPos')}</th>{canEdit && <th />}</tr></thead><tbody>
      {rows.map((p) => { const c = (p.contacts as { name: string; role: string | null; email: string | null; phone: string | null }[] | null)?.[0]; const s = (p.score || {}) as Record<string, number>; const un = (p.meta as { verified?: boolean })?.verified === false; return (
        <tr key={p.id}><td><b>{p.name}</b>{un && <span className="pill crit ml-2">{t('unverified')}</span>}{bankToConfirm.has(p.id) && <Link className="pill warn ml-2" href={`/app/${slug}/parties/${p.id}#bank`}>{t('bank.toConfirm')}</Link>}<div className="muted small">{(p.meta as { type?: string; segment?: string })?.type || (p.meta as { segment?: string })?.segment}</div></td><td><span className="pill">{t(`kinds.${p.kind}`)}</span></td><td className="small">{p.country && <><CountryFlag code={p.country} size={16} />{' '}</>}{[p.city, p.country && countryName(p.country, locale)].filter(Boolean).join(', ')}</td>{supplier && <td className="small">{p.tier ? tierLabel(p.tier) : ''}</td>}<td className="small">{c ? <>{c.name}<div className="muted">{c.email || c.phone || c.role}</div></> : <span className="muted">–</span>}</td><td className="small">{languageName(p.lang, locale)}</td><td className="small">{p.channel_pref?.replace('email_', '') || ''}</td>{supplier && <td className="small">{s.otd ? `OTD ${s.otd} · Q ${s.quality} · ` : ''}{s.compliance != null ? `C ${s.compliance}` : ''}</td>}<td className="text-right">{count(p.id) || '–'}</td>{canEdit && <td className="text-right"><Link className="btn sm" href={`/app/${slug}/parties/${p.id}`}>{t('edit')}</Link></td>}</tr>); })}
      {!rows.length && <tr><td colSpan={10} className="muted">{t('none')}</td></tr>}
    </tbody></table></div>
  );
  return (
    <div>
      <h1>{t('title')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {error && <div className="notice crit mt-3">{error}</div>}
      {saved && <div className="notice mt-3">{t('saved')}</div>}
      <div className="split mt-4" style={{ '--side': '280px' } as React.CSSProperties}>
        <div className="grid gap-5" style={{ minWidth: 0, gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div><h2 className="mb-2">{t('customers')} <span className="muted">({customers.length})</span></h2><Table rows={customers} /></div>
          <div><h2 className="mb-2">{t('suppliers')} <span className="muted">({suppliers.length})</span></h2><Table rows={suppliers} supplier /><p className="muted small mt-2">{t('tierHelp')}</p></div>
        </div>
        {canEdit && <div className="grid gap-4 self-start">
          <div className="card">
            <h2>{t('doc.title')}</h2>
            <p className="muted small mt-1 mb-3">{t('doc.linkHelp')}</p>
            <Link className="btn" href={`/app/${slug}/parties/document`}>{t('doc.link')}</Link>
          </div>
          <form action={addParty} className="card">
            <h2 className="mb-3">{t('add')}</h2><input type="hidden" name="tenant" value={slug} />
            <PartyFields />
            <button className="btn primary">{t('save')}</button>
          </form>
        </div>}
      </div>
    </div>
  );
}
