import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { updateParty } from '../actions';
import { PartyFields } from '../party-fields';

export default async function EditParty({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { tenant: slug, id } = await params; const { error } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  if (membership.role === 'viewer') redirect(`/app/${slug}/parties`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTranslations('parties');
  const sb = await supabaseServer();
  const { data: p } = await sb.from('parties').select('id, kind, name, country, city, lang, tier, channel_pref, meta, contacts(name, email, phone, is_primary)').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!p) notFound();
  const contacts = (p.contacts || []) as { name: string; email: string | null; phone: string | null; is_primary: boolean }[];
  const c = contacts.find((x) => x.is_primary) || contacts[0];
  return (
    <div className="max-w-xl">
      <Link href={`/app/${slug}/parties`} className="small">← {t('title')}</Link>
      <h1 className="mt-2">{t('editTitle', { name: p.name })}</h1>
      {error && <div className="notice crit mt-3">{error}</div>}
      <form action={updateParty} className="card mt-4">
        <input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={p.id} />
        <PartyFields defaults={{ name: p.name, kind: p.kind, country: p.country, city: p.city, address: (p.meta as { address?: string })?.address, lang: p.lang, tier: p.tier, channel_pref: p.channel_pref, contact_name: c?.name, contact_email: c?.email, contact_phone: c?.phone }} />
        <div className="flex gap-2 mt-2"><button className="btn primary">{t('save')}</button><Link className="btn" href={`/app/${slug}/parties`}>{t('cancel')}</Link></div>
      </form>
    </div>
  );
}
