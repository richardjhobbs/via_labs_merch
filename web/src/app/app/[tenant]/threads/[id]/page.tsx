// One conversation: the chain, the agent's "where we are", and any draft waiting on it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/tenant';
import { supabaseServer } from '@/lib/supabase/server';
import { threadSummary } from '@/lib/threads';
import { Chain } from '@/components/chain';
import { refreshThreadSummary } from '../actions';
import { PendingDraftCard } from '@/components/pending-draft';

export default async function Thread({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: slug, id } = await params;
  const { tenant } = await requireTenant(slug);
  const t = await getTranslations('threads');
  const sb = await supabaseServer();
  const { data: th } = await sb.from('threads').select('id, subject, kind, party_id, order_id, parties(name, kind, lang, channel_pref), orders(po, style, description)').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
  if (!th) notFound();
  const [{ data: msgs }, { data: drafts }, sum, { data: contacts }] = await Promise.all([
    sb.from('messages').select('id, direction, sender_name, lang, text, text_en, stream, received_at, sent_at, contacts(role)').eq('thread_id', id).order('received_at'),
    sb.from('drafts').select('id, seq, title, body, body_en, lang, stream, gate_level, impact, priority, status, source_message_id, party_id, order_id').eq('tenant_id', tenant.id).in('status', ['queued', 'escalated']).eq('party_id', th.party_id || '00000000-0000-0000-0000-000000000000'),
    threadSummary(tenant.id, id),
    th.party_id ? sb.from('contacts').select('name, role, email, phone').eq('party_id', th.party_id) : Promise.resolve({ data: [] as { name: string; role: string | null; email: string | null; phone: string | null }[] }),
  ]);
  const p = th.parties as unknown as { name: string; kind: string; lang: string; channel_pref: string | null } | null, o = th.orders as unknown as { po: string; style: string; description: string } | null;
  // drafts that answer a message in this chain, or were raised for this party on this PO
  const open = (drafts || []).filter((d) => d.order_id === th.order_id || (msgs || []).some((m) => m.id === d.source_message_id));
  const labels = { waiting: t('pendingReply'), approve: t('approve'), hold: t('hold'), reject: t('reject'), impact: t('impact'), english: t('english') };
  return (
    <div className="max-w-5xl">
      <div className="small muted"><Link href={`/app/${slug}/threads`}>{t('title')}</Link> › {p?.name}</div>
      <h1 className="mt-1">{p?.name} <span className="muted" style={{ fontWeight: 400 }}>· {th.subject || t('conversation')}</span></h1>
      <div className="flex gap-2 mt-2 flex-wrap small">
        {o && <Link className="pill" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>PO {o.po} · {o.style}</Link>}
        <span className="pill">{th.kind || p?.channel_pref || '—'}</span><span className="pill">{p?.lang}</span>
        {(contacts || []).map((c) => <span key={c.name} className="pill" title={c.email || c.phone || ''}>{c.name}{c.role ? ` · ${c.role}` : ''}</span>)}
      </div>
      <div className="grid gap-6 mt-5 lg:grid-cols-[1fr_320px]">
        <div className="card"><Chain messages={(msgs || []).map((m) => ({ id: m.id, direction: m.direction as 'in' | 'out', sender_name: m.sender_name, role: (m.contacts as unknown as { role: string } | null)?.role || null, lang: m.lang, text: m.text, text_en: m.text_en, stream: m.stream, received_at: m.received_at, sent_at: m.sent_at }))} tz={tenant.tz} labels={{ original: t('original'), awaiting: t('awaitingChannel'), us: t('us') }} />
          {open.map((d) => <div key={d.id} className="grid mt-3"><PendingDraftCard slug={slug} back={`/app/${slug}/threads/${id}`} d={d} labels={labels} /></div>)}
        </div>
        <div className="grid gap-4" style={{ alignContent: 'start' }}>
          <div className="card" style={{ background: 'var(--accent-soft)' }}>
            <div className="flex items-center gap-2"><span className="small font-medium" style={{ color: 'var(--accent)' }}>{t('whereWeAre')}</span><form action={refreshThreadSummary} className="ml-auto"><input type="hidden" name="tenant" value={slug} /><input type="hidden" name="id" value={id} /><button className="btn sm">{t('refresh')}</button></form></div>
            <div className="small mt-2" style={{ whiteSpace: 'pre-wrap' }}>{sum.summary || t('noSummaryYet')}</div>
            {sum.at && <div className="muted small mt-2">{new Date(sum.at).toLocaleString('en-GB', { timeZone: tenant.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
          </div>
          {!!open.length && <div className="card"><div className="small font-medium">{t('draftsHere')}</div>{open.map((d) => <div key={d.id} className="small mt-2"><span className="mono muted">Q-{d.seq}</span> {d.title}</div>)}<Link className="btn sm mt-3" href={`/app/${slug}/queue`}>{t('openQueue')}</Link></div>}
          {o && <Link className="btn sm" href={`/app/${slug}/orders/${encodeURIComponent(o.po)}`}>{t('openOrderFile')}</Link>}
        </div>
      </div>
    </div>
  );
}
