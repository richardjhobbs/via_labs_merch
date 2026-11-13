// Every update this company may see. Opening the page marks them read for this person.
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { supportMe } from '@/lib/helpdesk/desk';
import { updatesFor, markRead } from '@/lib/helpdesk/updates';
import { UpdateCard } from '../../update-card';

export default async function UpdatesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const me = await supportMe(slug);
  const [t, locale] = await Promise.all([getTranslations('help'), getLocale()]);
  const updates = await updatesFor(me.tenant.id, me.user.id, me.membership.role === 'partner', locale);
  await markRead(me.tenant.id, me.user.id, updates.filter((u) => u.unread).map((u) => u.id));
  return (
    <div>
      <Link href={`/support/${slug}`} className="small">← {t('title')}</Link>
      <h1 className="mt-3">{t('updates')}</h1>
      <div className="grid gap-3 mt-4">
        {updates.map((u) => <UpdateCard key={u.id} u={u} locale={locale} labels={{ isNew: t('new'), onRequest: t('onRequest'), onRequestNote: t('onRequestNote') }} />)}
        {!updates.length && <div className="muted small">{t('updatesNone')}</div>}
      </div>
    </div>
  );
}
