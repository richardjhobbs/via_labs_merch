import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { addParty } from './actions';

const KINDS = ['brand', 'retailer', 'store', 'buying_office', 'trading', 'factory', 'mill', 'fibre', 'forwarder', 'carrier', 'lab', 'auditor', 'other'];
const CUSTOMER = new Set(['brand', 'retailer', 'store', 'buying_office', 'trading']);

export default async function Parties({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ error?: string }> }) {
  const { tenant: slug } = await params; const { error } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const t = await getTranslations('parties');
  const sb = await supabaseServer();
  const [{ data: parties }, { data: orders }] = await Promise.all([
    sb.from('parties').select('id, kind, name, short, country, city, tier, lang, channel_pref, score, meta, contacts(name, role, email, phone)').eq('tenant_id', tenant.id).order('kind').order('name'),
    sb.from('orders').select('customer_id, factory_id, mill_id, fibre_id').eq('tenant_id', tenant.id).eq('status', 'open'),
  ]);
  const count = (id: string) => (orders || []).filter((o) => [o.customer_id, o.factory_id, o.mill_id, o.fibre_id].includes(id)).length;
  const customers = (parties || []).filter((p) => CUSTOMER.has(p.kind)), suppliers = (parties || []).filter((p) => !CUSTOMER.has(p.kind));
  const Table = ({ rows, supplier }: { rows: typeof customers; supplier?: boolean }) => (
    <div className="card tw" style={{ padding: 0 }}><table className="t"><thead><tr><th>{t('name')}</th><th>{t('kind')}</th><th>{t('location')}</th>{supplier && <th>{t('tier')}</th>}<th>{t('contact')}</th><th>{t('lang')}</th><th>{t('channel')}</th>{supplier && <th>{t('score')}</th>}<th className="text-right">{t('openPos')}</th></tr></thead><tbody>
      {rows.map((p) => { const c = (p.contacts as { name: string; role: string | null; email: string | null; phone: string | null }[] | null)?.[0]; const s = (p.score || {}) as Record<string, number>; const un = (p.meta as { verified?: boolean })?.verified === false; return (
        <tr key={p.id}><td><b>{p.name}</b>{un && <span className="pill crit ml-2">unverified</span>}<div className="muted small">{(p.meta as { type?: string; segment?: string })?.type || (p.meta as { segment?: string })?.segment}</div></td><td><span className="pill">{p.kind.replace('_', ' ')}</span></td><td className="small">{[p.city, p.country].filter(Boolean).join(', ')}</td>{supplier && <td>{p.tier ? `T${p.tier}` : ''}</td>}<td className="small">{c ? <>{c.name}<div className="muted">{c.email || c.phone || c.role}</div></> : <span className="muted">–</span>}</td><td className="small">{p.lang}</td><td className="small">{p.channel_pref?.replace('email_', '') || ''}</td>{supplier && <td className="small">{s.otd ? `OTD ${s.otd} · Q ${s.quality} · ` : ''}{s.compliance != null ? `C ${s.compliance}` : ''}</td>}<td className="text-right">{count(p.id) || '–'}</td></tr>); })}
      {!rows.length && <tr><td colSpan={9} className="muted">{t('none')}</td></tr>}
    </tbody></table></div>
  );
  return (
    <div>
      <h1>{t('title')}</h1><p className="muted small mt-1" style={{ maxWidth: '70ch' }}>{t('sub')}</p>
      {error && <div className="notice crit mt-3">{error}</div>}
      <div className="grid gap-5 mt-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 280px' }}>
        <div className="grid gap-5">
          <div><h2 className="mb-2">{t('customers')} <span className="muted">({customers.length})</span></h2><Table rows={customers} /></div>
          <div><h2 className="mb-2">{t('suppliers')} <span className="muted">({suppliers.length})</span></h2><Table rows={suppliers} supplier /></div>
        </div>
        {membership.role !== 'viewer' && <form action={addParty} className="card self-start">
          <h2>{t('add')}</h2><input type="hidden" name="tenant" value={slug} />
          <label className="f mt-3"><span>{t('name')}</span><input className="input" name="name" required maxLength={120} /></label>
          <label className="f"><span>{t('kind')}</span><select className="input" name="kind" defaultValue="brand">{KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="f"><span>{t('country')}</span><input className="input" name="country" maxLength={2} placeholder="GB" /></label><label className="f"><span>{t('city')}</span><input className="input" name="city" maxLength={60} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="f"><span>{t('lang')}</span><input className="input" name="lang" defaultValue="en" maxLength={5} /></label><label className="f"><span>{t('tier')}</span><select className="input" name="tier" defaultValue=""><option value="">–</option><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option></select></label></div>
          <label className="f"><span>{t('contact')}</span><input className="input" name="contact_name" maxLength={80} /></label>
          <label className="f"><span>Email</span><input className="input" name="contact_email" type="email" maxLength={120} /></label>
          <label className="f"><span>WhatsApp / phone</span><input className="input" name="contact_phone" maxLength={30} placeholder="+880…" /></label>
          <button className="btn primary">{t('save')}</button>
        </form>}
      </div>
    </div>
  );
}
