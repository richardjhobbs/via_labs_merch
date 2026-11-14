// A tester's home: the three practice companies. Opening one for the first time makes the tester's own
// private copy; nobody else can open it and nothing in it reaches anyone.
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';
import { requireMe } from '@/lib/tenant';
import { sandboxesOf, templates, testerOf, WORLDS } from '@/lib/testers';
import { FeedbackButton } from '@/components/feedback';
import { feedbackLabels } from '@/components/feedback-labels';
import { openWorld } from '../actions';

export const metadata = { title: 'Try VIA Merch', robots: { index: false } };

export default async function Start({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireMe();
  const tester = await testerOf(me.user.id);
  if (!tester) redirect('/try');
  const [{ error }, mine, tpls, t, locale] = await Promise.all([searchParams, sandboxesOf(me.user.id), templates(), getTranslations(), getLocale()]);
  const F = feedbackLabels(t);
  return (
    <main className="min-h-screen p-6" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto" style={{ maxWidth: 940 }}>
        <div className="flex items-center justify-between gap-3 mb-6"><Logo merch h={44} /><div className="flex items-center gap-2"><LangSwitch compact /><form action="/auth/signout" method="post"><button className="btn sm">{t('nav.signout')}</button></form></div></div>
        <h1>{t('try.startTitle', { name: tester!.name.split(' ')[0] })}</h1>
        <p className="mt-2" style={{ maxWidth: '70ch' }}>{t('try.startLead')}</p>
        {error && <div className="notice warn mt-4">{t(error === 'notReady' ? 'try.notReady' : 'try.errFailed')}</div>}
        <div className="grid gap-4 mt-5 md:grid-cols-3">
          {WORLDS.map((w) => {
            const have = mine.find((s) => s.world === w), tpl = tpls.find((x) => x.world === w && x.frozen_at);
            return (
              <div key={w} className="card flex flex-col">
                <div className="muted small" style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>{t(`try.worlds.${w}.kind`)}</div>
                <h2 className="mt-1">{tpl?.name || have?.name || t(`try.worlds.${w}.name`)}</h2>
                <p className="mt-2 small" style={{ flex: 1 }}>{t(`try.worlds.${w}.blurb`)}</p>
                <form action={openWorld} className="mt-4"><input type="hidden" name="world" value={w} />
                  <button className="btn primary w-full justify-center" disabled={!have && !tpl}>{have ? t('try.continue') : tpl ? t('try.open') : t('try.soon')}</button>
                </form>
                {have && tpl && <form action={openWorld} className="mt-2"><input type="hidden" name="world" value={w} /><input type="hidden" name="fresh" value="1" /><button className="btn sm w-full justify-center" title={t('try.againHint')}>{t('try.again')}</button></form>}
              </div>
            );
          })}
        </div>
        <div className="card mt-5">
          <h2>{t('try.howTitle')}</h2>
          <ol className="mt-2 grid gap-1 small" style={{ paddingLeft: 18, listStyle: 'decimal', maxWidth: '80ch' }}>
            {(['how1', 'how2', 'how3', 'how4', 'how5'] as const).map((k) => <li key={k}>{t(`try.${k}`)}</li>)}
          </ol>
        </div>
      </div>
      <FeedbackButton slug="" track="" locale={locale} labels={F} />
    </main>
  );
}

