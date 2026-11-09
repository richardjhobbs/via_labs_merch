// Partner access on a customer's or supplier's page: who at that company can sign in to see and supply the
// compliance records that concern it and, for a customer once development is on, follow the styles developed
// for it and comment on sample rounds. The invite form. Owners and managers only.
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { esgEnabled } from '@/lib/esg';
import { tenantTracks } from '@/lib/tracks';
import { invitePartner, removePartner } from '@/app/app/[tenant]/shared/actions';

export async function PartnerAccess({ slug, tenantId, partyId, role }: { slug: string; tenantId: string; partyId: string; role: string }) {
  if (!['owner', 'manager'].includes(role)) return null;
  const sb = await supabaseServer();
  const [{ data: tn }, { data: members }, { data: invites }, t] = await Promise.all([
    sb.from('tenants').select('settings').eq('id', tenantId).single(),
    sb.from('memberships').select('id, display_name, scopes, created_at').eq('tenant_id', tenantId).eq('role', 'partner'),
    sb.from('invites').select('id, email, display_name, scopes, expires_at').eq('tenant_id', tenantId).eq('role', 'partner').is('accepted_at', null),
    getTranslations('partners'),
  ]);
  const esg = esgEnabled(tn?.settings), dev = tenantTracks(tn?.settings as never).includes('development');
  if (!esg && !dev) return null;
  const forParty = (s: unknown) => ((s as { parties?: string[] })?.parties || []).includes(partyId);
  const people = (members || []).filter((m) => forParty(m.scopes)), pending = (invites || []).filter((i) => forParty(i.scopes) && new Date(i.expires_at) > new Date());
  return (
    <div className="card small mt-4">
      <h3>{t('accessTitle')}</h3>
      <p className="muted mt-1">{t(esg && dev ? 'accessHelpBoth' : dev ? 'accessHelpDev' : 'accessHelp')}</p>
      <div className="mt-2 grid gap-1">
        {people.map((m) => <form key={m.id} action={removePartner} className="flex items-center gap-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="party_id" value={partyId} /><input type="hidden" name="id" value={m.id} /><b>{m.display_name || '?'}</b><span className="muted">{t('since', { date: m.created_at.slice(0, 10) })}</span><button className="btn sm ml-auto">{t('remove')}</button></form>)}
        {pending.map((i) => <div key={i.id} className="flex items-center gap-2"><span>{i.display_name || i.email}</span><span className="pill warn">{t('invited')}</span></div>)}
        {!people.length && !pending.length && <span className="muted">{t('nobody')}</span>}
      </div>
      <form action={invitePartner} className="grid gap-2 mt-3 sm:grid-cols-[1fr_1fr_auto] items-end">
        <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="party_id" value={partyId} />
        <label className="f" style={{ margin: 0 }}><span>{t('email')}</span><input className="input sm" name="email" type="email" required maxLength={120} /></label>
        <label className="f" style={{ margin: 0 }}><span>{t('name')}</span><input className="input sm" name="name" maxLength={80} /></label>
        <button className="btn sm">{t('invite')}</button>
      </form>
    </div>
  );
}
