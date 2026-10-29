import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateRequest } from '../actions';

export default async function Requests() {
  const t = await getTranslations();
  const { data } = await supabaseAdmin().from('access_requests').select('*').order('created_at', { ascending: false }).limit(200);
  return (
    <div>
      <h1>{t('admin.requests')}</h1>
      <div className="card tw mt-4" style={{ padding: 0 }}>
        <table className="t"><thead><tr><th>When</th><th>Company</th><th>Who</th><th>Message</th><th>Status</th></tr></thead><tbody>
          {(data || []).map((r) => (
            <tr key={r.id}><td className="muted mono">{new Date(r.created_at).toLocaleDateString('en-GB')}</td><td><b>{r.company}</b><div className="muted small">{r.kind?.replace('_', ' ')}{r.country ? ' · ' + r.country : ''}</div></td><td>{r.name}<div className="muted small">{r.email}</div></td><td className="small" style={{ maxWidth: 360 }}>{r.message}</td>
              <td><form action={updateRequest} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><select className="input" name="status" defaultValue={r.status} style={{ width: 'auto' }}><option value="new">new</option><option value="contacted">contacted</option><option value="provisioned">provisioned</option><option value="declined">declined</option></select><button className="btn sm">{t('common.save')}</button></form></td></tr>
          ))}
          {!data?.length && <tr><td colSpan={5} className="muted">{t('common.none')}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
