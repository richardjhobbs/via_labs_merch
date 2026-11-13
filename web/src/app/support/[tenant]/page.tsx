// A person's support desk for one company: start a conversation, and see their own (owners and managers:
// everyone's in the company). The list comes through RLS, so it is exactly what the person may read.
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supportMe, TICKET_COLS, type Ticket } from '@/lib/helpdesk/desk';
import { Composer } from '../composer';
import { StatusPill } from '../status-pill';
import { updatesFor } from '@/lib/helpdesk/updates';
import { UpdateCard } from '../update-card';

export const maxDuration = 60;

export default async function Desk({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ tenant: slug }, { from = '' }] = await Promise.all([params, searchParams]);
  const me = await supportMe(slug);
  const [t, locale, sb] = await Promise.all([getTranslations('help'), getLocale(), supabaseServer()]);
  const [{ data }, updates] = await Promise.all([
    sb.from('support_tickets').select(TICKET_COLS).eq('tenant_id', me.tenant.id).order('last_message_at', { ascending: false }).limit(100),
    updatesFor(me.tenant.id, me.user.id, me.membership.role === 'partner', locale, 3),
  ]);
  const tickets = (data || []) as Ticket[];
  const mine = tickets.filter((x) => x.opened_by === me.user.id);
  const others = tickets.filter((x) => x.opened_by !== me.user.id);
  const partner = me.membership.role === 'partner';
  const row = (x: Ticket, who: boolean) => (
    <Link key={x.id} href={`/support/${slug}/t/${x.id}`} className="card flex flex-wrap items-center gap-x-3 gap-y-1 no-underline" style={{ color: 'inherit', padding: '12px 14px' }}>
      <span className="mono muted">#{x.number}</span>
      <b className="min-w-0" style={{ flex: '1 1 200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</b>
      <span className="muted small">{t(`kind.${x.kind}`)}{who && x.opened_by_name ? ` · ${x.opened_by_name}` : ''} · {new Date(x.last_message_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
      <StatusPill status={x.status} label={t(`status.${x.status}`)} />
    </Link>
  );
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1>{t('newTitle')}</h1>
        <span className="muted small">{me.tenant.name}</span>
        {!partner && <Link href={`/app/${slug}`} className="small ml-auto">{t('workspace')}</Link>}
      </div>
      <p className="muted small mt-2" style={{ maxWidth: '64ch' }}>{t('sub')}</p>
      <div className="card mt-4"><Composer slug={slug} page={from} /></div>
      <p className="muted small mt-2">{t('warn')}</p>

      {!!updates.length && <>
        <div className="flex items-baseline gap-3 mt-8"><h2 style={{ fontSize: 15 }}>{t('updates')}</h2><Link href={`/support/${slug}/updates`} className="small ml-auto">{t('updatesAll')}</Link></div>
        <div className="grid gap-2 mt-3">{updates.map((u) => <UpdateCard key={u.id} u={u} locale={locale} short labels={{ isNew: t('new'), onRequest: t('onRequest'), onRequestNote: t('onRequestNote') }} />)}</div>
      </>}

      <h2 className="mt-8" style={{ fontSize: 15 }}>{t('mine')}</h2>
      <div className="grid gap-2 mt-3">{mine.length ? mine.map((x) => row(x, false)) : <div className="muted small">{t('none')}</div>}</div>
      {!!others.length && <>
        <h2 className="mt-8" style={{ fontSize: 15 }}>{t('companyAll', { company: me.tenant.name })}</h2>
        <div className="grid gap-2 mt-3">{others.map((x) => row(x, true))}</div>
      </>}
    </div>
  );
}
