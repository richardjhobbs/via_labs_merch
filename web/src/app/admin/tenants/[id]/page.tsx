import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inviteMember, resendInvite, loadSampleAction, setMemberScope } from '../../actions';
import { InboundSim } from '@/app/app/[tenant]/agents/panels';

const ROLES = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics', 'viewer'] as const;

export default async function TenantAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { id } = await params; const { error, sent } = await searchParams;
  const t = await getTranslations();
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('*').eq('id', id).maybeSingle();
  if (!tenant) notFound();
  const [{ data: members }, { data: customers }, { data: customersAll }, { data: invites }, { data: gates }, { data: ledger }] = await Promise.all([
    sb.from('memberships').select('id, role, display_name, title, user_id, created_at, scopes').eq('tenant_id', id).order('created_at'),
    sb.from('parties').select('id, name').eq('tenant_id', id).in('kind', ['brand', 'retailer', 'store', 'buying_office', 'trading']).order('name'),
    sb.from('parties').select('id, name, kind').eq('tenant_id', id).order('kind').order('name'),
    sb.from('invites').select('id, email, role, display_name, created_at, expires_at').eq('tenant_id', id).is('accepted_at', null).order('created_at', { ascending: false }),
    sb.from('gates').select('stream, level, locked').eq('tenant_id', id).order('stream'),
    sb.from('ledger').select('id, at, actor, what, gate').eq('tenant_id', id).order('id', { ascending: false }).limit(20),
  ]);
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const emailOf = (uid: string) => users?.users.find((u) => u.id === uid)?.email || uid;
  return (
    <div>
      <div className="flex items-baseline gap-3"><h1>{tenant.name}</h1><span className="pill">{tenant.kind.replace('_', ' ')}</span><span className="pill">{tenant.plan}</span><span className="muted small mono">{tenant.slug}</span><form action={loadSampleAction} className="ml-auto"><input type="hidden" name="tenant_id" value={id} /><button className="btn sm" title="Loads the Meridian sample world: 5 customers, 17 suppliers, 38 POs. Only into an empty company.">Load sample data</button></form><Link className="btn sm" href={`/app/${tenant.slug}`}>Open workspace →</Link></div>
      {error && <div className="notice crit mt-3">{error}</div>}
      {sent && <div className="notice mt-3">Invite emailed to {sent}.</div>}
      <div className="grid gap-6 mt-5" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <div className="grid gap-5">
          <InboundSim slug={tenant.slug} live={!!process.env.ANTHROPIC_API_KEY} parties={(customersAll || []).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))} labels={{ title: 'Test: inject an inbound message', sub: 'VIA staff only. Runs the inbound pipeline on a pasted message as if it had arrived on a channel: logged, linked to the party and PO, dates captured, reply queued for the company.', from: 'From (name)', party: 'Customer or supplier', channel: 'Channel', subject: 'Subject', text: 'Message', run: 'Run the pipeline', result: 'Result', openQueue: 'Open the company queue', thinking: 'Working...' }} />
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('admin.members')}</h2></div>
            <table className="t"><thead><tr><th>Email</th><th>{t('admin.name')}</th><th>{t('admin.role')}</th><th>{t('admin.scope')}</th></tr></thead><tbody>
              {(members || []).map((m) => { const sc = ((m.scopes as { parties?: string[] })?.parties) || []; return (<tr key={m.id}><td>{emailOf(m.user_id)}<div className="muted small">{new Date(m.created_at).toLocaleDateString('en-GB')}</div></td><td>{m.display_name}</td><td><span className="pill">{t(`roles.${m.role}`)}</span></td><td>
                <form action={setMemberScope} className="grid gap-1"><input type="hidden" name="tenant_id" value={id} /><input type="hidden" name="id" value={m.id} />
                  <input className="input sm" name="title" defaultValue={m.title || ''} placeholder={t('admin.jobTitle')} />
                  <select className="input sm" name="parties" multiple defaultValue={sc} size={Math.min(5, Math.max(2, (customers || []).length))} title={t('admin.scopeHint')}>{(customers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  <div className="flex items-center gap-2"><button className="btn sm">{t('admin.saveScope')}</button><span className="muted small">{sc.length ? '' : t('admin.allCustomers')}</span></div>
                </form></td></tr>); })}
              {!members?.length && <tr><td colSpan={4} className="muted">{t('common.none')}</td></tr>}
            </tbody></table></div>
          <div className="card tw" style={{ padding: 0 }}><div className="p-4 pb-2"><h2>{t('admin.pending')}</h2></div>
            <table className="t"><thead><tr><th>Email</th><th>{t('admin.role')}</th><th>Sent</th><th>Expires</th><th></th></tr></thead><tbody>
              {(invites || []).map((i) => <tr key={i.id}><td>{i.email}<div className="muted small">{i.display_name}</div></td><td><span className="pill">{t(`roles.${i.role}`)}</span></td><td className="muted">{new Date(i.created_at).toLocaleDateString('en-GB')}</td><td className="muted">{new Date(i.expires_at).toLocaleDateString('en-GB')}</td><td><form action={resendInvite}><input type="hidden" name="id" value={i.id} /><button className="btn sm">Resend</button></form></td></tr>)}
              {!invites?.length && <tr><td colSpan={5} className="muted">{t('common.none')}</td></tr>}
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
