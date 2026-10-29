import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createTenant } from './actions';

const KINDS = ['buying_office', 'brand', 'factory', 'trading', 'retailer'];

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations();
  const { error } = await searchParams;
  const sb = supabaseAdmin();
  const { data: tenants } = await sb.from('tenants').select('id, slug, name, kind, plan, created_at, memberships(count), invites(count)').order('created_at', { ascending: false });
  const { count: newRequests } = await sb.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'new');
  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      <div>
        <h1>{t('admin.tenants')}</h1>
        {!!newRequests && <Link href="/admin/requests" className="notice block mt-3">{newRequests} {t('admin.requests').toLowerCase()}</Link>}
        <div className="card mt-4 tw" style={{ padding: 0 }}>
          <table className="t"><thead><tr><th>{t('admin.name')}</th><th>{t('admin.kind')}</th><th>{t('admin.plan')}</th><th>{t('admin.members')}</th><th>{t('admin.pending')}</th><th>{t('admin.created')}</th></tr></thead>
            <tbody>{(tenants || []).map((x) => (
              <tr key={x.id}><td><Link href={`/admin/tenants/${x.id}`}><b>{x.name}</b></Link><div className="muted mono">{x.slug}</div></td><td>{t(`landing.kinds.${x.kind}` as never)}</td><td>{x.plan}</td><td>{(x.memberships as unknown as { count: number }[])[0]?.count ?? 0}</td><td>{(x.invites as unknown as { count: number }[])[0]?.count ?? 0}</td><td className="muted">{new Date(x.created_at).toLocaleDateString('en-GB')}</td></tr>
            ))}{!tenants?.length && <tr><td colSpan={6} className="muted">{t('common.none')}</td></tr>}</tbody></table>
        </div>
      </div>
      <form action={createTenant} className="card self-start">
        <h2>{t('admin.newTenant')}</h2>
        {error && <div className="notice crit mt-2">{error}</div>}
        <label className="f mt-3"><span>{t('admin.name')}</span><input className="input" name="name" required /></label>
        <label className="f"><span>{t('admin.slug')}</span><input className="input mono" name="slug" pattern="[a-z0-9-]{3,40}" required placeholder="meridian" /></label>
        <label className="f"><span>{t('admin.kind')}</span><select className="input" name="kind">{KINDS.map((k) => <option key={k} value={k}>{t(`landing.kinds.${k}` as never)}</option>)}</select></label>
        <label className="f"><span>{t('admin.plan')}</span><select className="input" name="plan"><option value="retainer">Retainer</option><option value="trial">Trial</option><option value="per_user">Per user</option></select></label>
        <div className="grid grid-cols-2 gap-3"><label className="f"><span>Locale</span><select className="input" name="locale"><option value="en">en</option><option value="de">de</option><option value="bn">bn</option><option value="zh">zh</option><option value="vi">vi</option><option value="es">es</option></select></label><label className="f"><span>Timezone</span><input className="input" name="tz" defaultValue="Asia/Hong_Kong" /></label></div>
        <label className="f"><span>Owner email (invited)</span><input className="input" name="owner_email" type="email" required /></label>
        <button className="btn primary">{t('common.save')}</button>
      </form>
    </div>
  );
}
