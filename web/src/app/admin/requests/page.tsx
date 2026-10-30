import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateRequest } from '../actions';

// One card per request: who asked, what they wrote, then the actions. No table: the message and the
// buttons need room, and the list is short. Open requests first, then provisioned and declined.
export default async function Requests({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const t = await getTranslations();
  const { saved, error } = await searchParams;
  const { data } = await supabaseAdmin().from('access_requests').select('*, tenants(id, name)').order('created_at', { ascending: false }).limit(200);
  const open = (data || []).filter((r) => r.status === 'new');
  const closed = (data || []).filter((r) => r.status !== 'new');
  const card = (r: NonNullable<typeof data>[number]) => {
    const tenant = r.tenants as unknown as { id: string; name: string } | null;
    const site = r.url ? (/^https?:\/\//.test(r.url) ? r.url : 'https://' + r.url) : null;
    return (
      <div key={r.id} className="card" style={{ opacity: r.status === 'declined' ? 0.6 : 1 }}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b style={{ fontSize: 16 }}>{r.company}</b>
          <span className="muted small">{r.kind?.replace('_', ' ')}{r.country ? ' · ' + r.country : ''}</span>
          <span className="muted small mono ml-auto">{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
        </div>
        <div className="mt-2 small">{r.name} · <a href={`mailto:${r.email}`}>{r.email}</a>{site && <> · <a href={site} target="_blank" rel="noopener">{r.url}</a></>}</div>
        {r.message && <p className="mt-2 small" style={{ color: 'var(--fg2)', whiteSpace: 'pre-wrap' }}>{r.message}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {r.tenant_id
            ? <Link href={`/admin/tenants/${r.tenant_id}`} className="btn sm">{tenant?.name || t('admin.linked')} →</Link>
            : <Link href={`/admin?from=${r.id}`} className="btn primary sm">{t('admin.createCompany')}</Link>}
          <form action={updateRequest} className="flex items-center gap-2 ml-auto">
            <input type="hidden" name="id" value={r.id} />
            <select className="input" name="status" defaultValue={r.status} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}><option value="new">new</option><option value="provisioned">provisioned</option><option value="declined">declined</option></select>
            <button className="btn sm">{t('common.save')}</button>
          </form>
        </div>
      </div>
    );
  };
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>{t('admin.requests')}</h1>
      {saved && <div className="notice mt-3">{t('admin.saved')}</div>}
      {error && <div className="notice crit mt-3">{error}</div>}
      <div className="grid gap-3 mt-4">
        {open.map(card)}
        {!data?.length && <div className="muted">{t('common.none')}</div>}
      </div>
      {!!closed.length && <>
        <div className="small font-medium muted mt-8" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{t('admin.closed')}</div>
        <div className="grid gap-3 mt-3">{closed.map(card)}</div>
      </>}
    </div>
  );
}
