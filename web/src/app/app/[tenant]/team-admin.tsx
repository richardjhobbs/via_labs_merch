// Settings, Team: owners and managers invite people and set each person's role, job title, customers and tracks.
// The rules are in lib/team.ts; the writes in team-actions.ts. Desk authority (what each layer may approve) is
// on the Agents page; this section links there.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { Avatar } from '@/components/avatar';
import { tenantTracks } from '@/lib/tracks';
import { assignable, canEdit, canRemove, managesTeam } from '@/lib/team';
import { inviteTeam, updateMember, removeMember, resendTeamInvite, cancelTeamInvite } from './team-actions';

type Member = { id: string; user_id: string; role: string; display_name: string | null; initials: string | null; title: string | null; scopes: { parties?: string[] } | null; tracks: string[] | null; avatar_path: string | null };

export async function TeamAdmin({ slug, tenantId, role, userId, msg }: { slug: string; tenantId: string; role: string; userId: string | null; msg: { tsent?: string; tsaved?: string; terr?: string } }) {
  if (!managesTeam(role) || !userId) return null;
  const t = await getTranslations();
  const sb = supabaseAdmin();
  const [{ data: members }, { data: invites }, { data: parties }, { data: tn }] = await Promise.all([
    sb.from('memberships').select('id, user_id, role, display_name, initials, title, scopes, tracks, avatar_path').eq('tenant_id', tenantId).neq('role', 'partner').order('role').order('display_name'),
    sb.from('invites').select('id, email, role, display_name, title, created_at, expires_at').eq('tenant_id', tenantId).is('accepted_at', null).neq('role', 'partner').order('created_at', { ascending: false }),
    sb.from('parties').select('id, name, kind').eq('tenant_id', tenantId).is('archived_at', null).in('kind', ['brand', 'retailer', 'store', 'buying_office', 'trading']).order('name'),
    sb.from('tenants').select('settings').eq('id', tenantId).single(),
  ]);
  const L = (members || []) as Member[];
  const owners = L.filter((m) => m.role === 'owner').length;
  const tracks = tenantTracks(tn?.settings as never);
  const roles = assignable(role);
  const name = new Map((parties || []).map((p) => [p.id as string, p.name as string]));
  const ERR: Record<string, string> = { role: t('team.errRole'), email: t('team.errEmail'), member: t('team.errMember'), missing: t('team.errMissing') };

  const access = (m: { role?: string; scopes?: { parties?: string[] } | null; tracks?: string[] | null } | null) => {
    const sel = new Set(m?.scopes?.parties || []), allSee = m?.role === 'owner' || m?.role === 'manager';
    return <>
      <div className="f" style={{ margin: 0 }}><span>{t('team.customers')}</span>
        {allSee ? <p className="muted small">{t('team.allSee')}</p> : !parties?.length ? <p className="muted small">{t('team.noCustomers')}</p> :
          <div className="flex gap-2 flex-wrap">{(parties || []).map((p) => <label key={p.id} className="pill" style={{ cursor: 'pointer', padding: '5px 9px' }}><input type="checkbox" name="parties" value={p.id} defaultChecked={sel.has(p.id)} style={{ marginRight: 6 }} />{p.name}</label>)}</div>}
        {!allSee && !!parties?.length && <p className="muted small mt-1">{t('team.customersHelp')}</p>}
      </div>
      {tracks.length > 1 && <div className="f" style={{ margin: 0 }}><span>{t('team.tracks')}</span>
        <div className="flex gap-2 flex-wrap">{tracks.map((tr) => <label key={tr} className="pill" style={{ cursor: 'pointer', padding: '5px 9px' }}><input type="checkbox" name="tracks" value={tr} defaultChecked={(m?.tracks || ['production']).includes(tr)} style={{ marginRight: 6 }} />{t(`mcp.${tr}` as never)}</label>)}</div></div>}
    </>;
  };

  return (
    <section id="team" className="card mt-4">
      <h2 style={{ fontSize: 17 }}>{t('team.title')}</h2>
      <p className="muted small mt-1">{t('team.sub')} <Link href={`/app/${slug}/agents`}>{t('team.authority')}</Link></p>
      {msg.tsent && <div className="notice mt-3">{t('team.sent', { email: msg.tsent })}</div>}
      {msg.tsaved && <div className="notice mt-3">{t('team.saved')}</div>}
      {msg.terr && <div className="notice crit mt-3">{ERR[msg.terr] || msg.terr}</div>}

      <div className="grid gap-2 mt-4">{L.map((m) => {
        const self = m.user_id === userId, editable = canEdit(role, m.role, self);
        const scope = m.role === 'owner' || m.role === 'manager' ? null : m.scopes?.parties?.length ? m.scopes.parties : null;
        return (
          <details key={m.id} className="card" style={{ padding: 10 }}>
            <summary className="flex items-center gap-3" style={{ listStyle: 'none', cursor: editable ? 'pointer' : 'default' }}>
              <Avatar path={m.avatar_path} name={m.display_name} initials={m.initials} size={32} />
              <div className="min-w-0 flex-1"><div className="font-medium">{m.display_name || '?'}{self && <span className="muted small"> · {t('team.you')}</span>}</div>
                <div className="muted small">{m.title ? `${m.title} · ` : ''}{scope ? scope.map((id) => name.get(id) || '?').join(', ') : t('team.allCustomers')}{tracks.length > 1 ? ` · ${(m.tracks || ['production']).map((tr) => t(`mcp.${tr}` as never)).join(', ')}` : ''}</div></div>
              <span className="pill">{t(`roles.${m.role}` as never)}</span>
              {editable && <span className="btn sm">{t('team.edit')}</span>}
            </summary>
            {editable && <form action={updateMember} className="grid gap-3 mt-3"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={m.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="f" style={{ margin: 0 }}><span>{t('team.role')}</span>
                  {self || (m.role === 'owner' && owners <= 1) ? <><input type="hidden" name="role" value={m.role} /><p className="small">{t(`roles.${m.role}` as never)} <span className="muted">· {self ? t('team.ownRole') : t('team.lastOwner')}</span></p></> :
                    <select className="input" name="role" defaultValue={m.role}>{roles.map((r) => <option key={r} value={r}>{t(`roles.${r}` as never)}</option>)}</select>}</label>
                <label className="f" style={{ margin: 0 }}><span>{t('team.jobTitle')}</span><input className="input" name="title" defaultValue={m.title || ''} maxLength={80} placeholder={t('team.jobTitlePh')} /></label>
              </div>
              {access(m)}
              <div className="flex gap-2 flex-wrap"><button className="btn primary sm">{t('team.save')}</button></div>
            </form>}
            {editable && canRemove(role, m.role, self, owners) && <form action={removeMember} className="mt-2"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={m.id} />
              <button className="btn sm red">{t('team.remove')}</button> <span className="muted small">{t('team.removeHelp')}</span></form>}
          </details>);
      })}</div>

      {!!invites?.length && <div className="mt-4">
        <h3 style={{ fontSize: 14 }}>{t('team.pending')}</h3>
        <ul className="grid gap-2 mt-2 small">{invites.map((i) => (
          <li key={i.id} className="flex gap-2 items-center flex-wrap" style={{ borderTop: '1px solid var(--line2)', paddingTop: 6 }}>
            <b className="min-w-0">{i.email}</b><span className="pill">{t(`roles.${i.role}` as never)}</span>
            <span className="muted">{t('team.expires', { when: new Date(i.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) })}</span>
            {roles.includes(i.role) && <span className="ml-auto flex gap-2">
              <form action={resendTeamInvite}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={i.id} /><button className="btn sm">{t('team.resend')}</button></form>
              <form action={cancelTeamInvite}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={i.id} /><button className="btn sm red">{t('team.cancel')}</button></form></span>}
          </li>))}</ul>
      </div>}

      <details className="mt-4" open={!L.length || undefined}><summary className="btn primary sm" style={{ listStyle: 'none', display: 'inline-flex' }}>{t('team.invite')}</summary>
        <form action={inviteTeam} className="grid gap-3 mt-3"><input type="hidden" name="slug" value={slug} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="f" style={{ margin: 0 }}><span>{t('team.email')}</span><input className="input" type="email" name="email" required placeholder="name@company.com" /></label>
            <label className="f" style={{ margin: 0 }}><span>{t('team.name')}</span><input className="input" name="name" maxLength={80} /></label>
            <label className="f" style={{ margin: 0 }}><span>{t('team.role')}</span><select className="input" name="role" defaultValue="merchandiser">{roles.map((r) => <option key={r} value={r}>{t(`roles.${r}` as never)}</option>)}</select></label>
            <label className="f" style={{ margin: 0 }}><span>{t('team.jobTitle')}</span><input className="input" name="title" maxLength={80} placeholder={t('team.jobTitlePh')} /></label>
          </div>
          {access({ role: 'merchandiser', scopes: null, tracks: ['production'] })}
          <p className="muted small">{t('team.rolesHelp')}</p>
          <div><button className="btn primary sm">{t('team.send')}</button></div>
        </form>
      </details>
    </section>
  );
}
