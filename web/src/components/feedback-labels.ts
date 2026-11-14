// The feedback panel's strings, read once on the server and handed to the client component.
import type { getTranslations } from 'next-intl/server';
import type { FeedbackLabels } from './feedback';

type T = Awaited<ReturnType<typeof getTranslations>>;
export function feedbackLabels(t: T): FeedbackLabels {
  const f = (k: string) => t(`feedback.${k}` as never);
  return { open: f('open'), title: f('title'), intro: f('intro'), placeholder: f('placeholder'), send: f('send'), sending: f('sending'), thanks: f('thanks'), another: f('another'), close: f('close'), failed: f('failed'),
    dictate: f('dictate'), stop: f('stop'), listening: f('listening'), record: f('record'), recording: f('recording'), recorded: f('recorded'), discard: f('discard'), micDenied: f('micDenied'), micService: f('micService'), page: f('page'),
    moods: { good: f('moods.good'), confusing: f('moods.confusing'), missing: f('moods.missing'), broken: f('moods.broken') } };
}
