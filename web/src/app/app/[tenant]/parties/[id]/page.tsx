import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { activityOf, purgeDate } from '@/lib/party-lifecycle';
import { updateParty, removeParty, restoreParty } from '../actions';
import { PartyFields } from '../party-fields';
import { BankSection } from './bank-section';
import { BANK_COLUMNS, type BankRow } from '@/lib/bank';
import { ComplianceCard } from '@/components/compliance-card';
import { PartnerAccess } from '@/components/partner-access';

export default async function EditParty({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { tenant: slug, id } = await params; const { error, saved } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  if (membership.role === 'viewer') redirect(`/app/${slug}/parties`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTranslations('parties');
  const sb = await supabaseServer();
  const { data: p } = await sb.from('parties').select('id, kind, name, country, city, lang, tier, channel_pref, meta, archived_at, contacts(name, email, phone, is_primary)').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!p) notFound();
  const canRemove = membership.id !== 'admin' && ['owner', 'manager'].includes(membership.role);
  const [{ data: accounts }, act] = await Promise.all([
    sb.from('party_bank_accounts').select(BANK_COLUMNS).eq('party_id', id).eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
    canRemove ? activityOf(supabaseAdmin(), tenant.id, id) : Promise.resolve(null),
  ]);
  const tr = await getTranslations('parties.remove');
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: tenant.tz, day: 'numeric', month: 'short', year: 'numeric' });
  const contacts = (p.contacts || []) as { name: string; email: string | null; phone: string | null; is_primary: boolean }[];
  const c = contacts.find((x) => x.is_primary) || contacts[0];
  return (
    <div className="max-w-xl">
      <Link href={`/app/${slug}/parties`} className="small">← {t('title')}</Link>
      <h1 className="mt-2">{t('editTitle', { name: p.name })}</h1>
      {p.archived_at && <div className="notice warn mt-3">{tr('archivedNote', { date: fmt(p.archived_at), purge: fmt(purgeDate(p.archived_at)) })}</div>}
      {error && <div className="notice crit mt-3">{error}</div>}
      {saved && <div className="notice mt-3">{t('saved')}</div>}
      <form action={updateParty} className="card mt-4">
        <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={p.id} />
        <PartyFields defaults={{ name: p.name, kind: p.kind, country: p.country, city: p.city, address: (p.meta as { address?: string })?.address, lang: p.lang, tier: p.tier, channel_pref: p.channel_pref, contact_name: c?.name, contact_email: c?.email, contact_phone: c?.phone }} />
        <div className="flex gap-2 mt-2"><button className="btn primary">{t('save')}</button><Link className="btn" href={`/app/${slug}/parties`}>{t('cancel')}</Link></div>
      </form>
      <div className="mt-4"><ComplianceCard slug={slug} tenantId={tenant.id} partyId={p.id} /></div>
      <PartnerAccess slug={slug} tenantId={tenant.id} partyId={p.id} role={membership.id === 'admin' ? 'viewer' : membership.role} />
      <BankSection slug={slug} partyId={p.id} role={membership.id === 'admin' ? 'viewer' : membership.role} accounts={(accounts || []) as unknown as BankRow[]} />
      {canRemove && act && (
        <div className="card mt-4">
          <h2>{p.archived_at ? tr('restoreTitle') : act.total ? tr('archiveTitle') : tr('deleteTitle')}</h2>
          {p.archived_at ? (
            <form action={restoreParty} className="mt-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={p.id} />
              <p className="muted small">{tr('restoreHelp')}</p><button className="btn mt-2">{tr('restore')}</button></form>
          ) : (
            <form action={removeParty} className="mt-2"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="mode" value={act.total ? 'archive' : 'delete'} />
              <p className="muted small">{act.total ? tr('archiveHelp', { records: Object.entries(act.by).map(([k, n]) => tr(`kinds.${k}`, { n })).join(', ') }) : tr('deleteHelp')}</p>
              <label className="flex items-center gap-2 mt-2 small"><input type="checkbox" required />{act.total ? tr('confirmArchive', { name: p.name }) : tr('confirmDelete', { name: p.name })}</label>
              <button className="btn red mt-2">{act.total ? tr('archive') : tr('delete')}</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
