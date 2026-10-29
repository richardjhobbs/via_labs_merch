import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inviteMember } from '../../actions';

const ROLES = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics', 'viewer'] as const;

export default async function TenantAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams;
  const t = await getTranslations();
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('*').eq('id', id).maybeSingle();
  if (!tenant) notFound();
  const [{ data: members }, { data: invites }, { data: gates }, { data: ledger }] = await Promise.all([
    sb.from('memberships').select('id, role, display_name, title, user_id, created_at').eq('tenant_id', id).order('created_at'),
    sb.from('invites').select('id, email, role, display_name, created_at, expires_at').eq('tenant_id', id).is('accepted_at', null).order('created_at', { ascending: false }),
    sb.from('gates').select('stream, level, locked').eq('tenant_id', id).order('stream'),
    sb.from('ledger').select('id, at, actor, what, gate').eq('tenant_id', id).order('id', { ascending: false }).limit(20),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const emailOf = (uid: string) => users?.users.find((u) => u.id === uid)?.email || uid;
  return (
    <div>
      <div className="flex items-baseline gap-3"><h1>{tenant.name}</h1><span className="pill">{tenant.kind.replace('_', ' ')}</span><span className="pill">{tenant.plan}</span><span className="muted small mono">{tenant.slug}</span><Link className="btn sm ml-auto" href={`/app/${tenant.slug}`}>Open workspace →</Link></div>
      {error && <div className="notice crit mt-3">{error}</div>}
      <div className="grid gap-6 mt-5" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <div className="grid gap-5">
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('admin.members')}</h2></div>
            <table className="t"><thead><tr><th>Email</th><th>{t('admin.name')}</th><th>{t('admin.role')}</th><th>Since</th></tr></thead><tbody>
              {(members || []).map((m) => <tr key={m.id}><td>{emailOf(m.user_id)}</td><td>{m.display_name}<div className="muted small">{m.title}</div></td><td><span className="pill">{t(`roles.${m.role}`)}</span></td><td className="muted">{new Date(m.created_at).toLocaleDateString('en-GB')}</td></tr>)}
              {!members?.length && <tr><td colSpan={4} className="muted">{t('common.none')}</td></tr>}
            </tbody></table></div>
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('admin.pending')}</h2></div>
            <table className="t"><thead><tr><th>Email</th><th>{t('admin.role')}</th><th>Sent</th><th>Expires</th></tr></thead><tbody>
              {(invites || []).map((i) => <tr key={i.id}><td>{i.email}<div className="muted small">{i.display_name}</div></td><td><span className="pill">{t(`roles.${i.role}`)}</span></td><td className="muted">{new Date(i.created_at).toLocaleDateString('en-GB')}</td><td className="muted">{new Date(i.expires_at).toLocaleDateString('en-GB')}</td></tr>)}
              {!invites?.length && <tr><td colSpan={4} className="muted">{t('common.none')}</td></tr>}
            </tbody></table></div>
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>Autonomy by stream</h2></div>
            <table className="t"><thead><tr><th>Stream</th><th>Level</th><th>Cap</th></tr></thead><tbody>
              {(gates || []).map((g) => <tr key={g.stream}><td>{g.stream}</td><td><span className={`pill ${g.level >= 2 ? 'ok' : g.level === 0 ? '' : 'warn'}`}>L{g.level}</span></td><td className="muted">{g.locked !== null ? `capped at L${g.locked}` : ''}</td></tr>)}
            </tbody></table></div>
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>Ledger (latest 20)</h2></div>
            <table className="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Gate</th></tr></thead><tbody>
              {(ledger || []).map((r) => <tr key={r.id}><td className="muted mono">{new Date(r.at).toLocaleString('en-GB')}</td><td>{r.actor}</td><td>{r.what}</td><td><span className="pill warn">{r.gate}</span></td></tr>)}
            </tbody></table></div>
        </div>
        <form action={inviteMember} className="card self-start">
          <h2>{t('admin.invite')}</h2>
          <input type="hidden" name="tenant_id" value={id} />
          <label className="f mt-3"><span>Email</span><input className="input" name="email" type="email" required /></label>
          <label className="f"><span>{t('admin.name')}</span><input className="input" name="display_name" /></label>
          <label className="f"><span>{t('admin.role')}</span><select className="input" name="role" defaultValue="merchandiser">{ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</select></label>
          <button className="btn primary">{t('admin.send')}</button>
        </form>
      </div>
    </div>
  );
}
