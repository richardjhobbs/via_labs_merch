'use server';
// VIA Labs console: write, publish and withdraw the updates shown on the support desk. Publishing is always a
// person's action here; it translates the text into the other interface languages once and stores the result.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hasLlm, translate } from '@/lib/llm';
import { LOCALES } from '@/i18n/locales';
import { parseAudience } from '@/lib/helpdesk/updates-rules';

const back = (q: string) => redirect(`/admin/updates?${q}`);

export async function saveUpdate(form: FormData) {
  const m = await requireAdmin();
  const id = String(form.get('id') || ''), title = String(form.get('title') || '').trim().slice(0, 160), body = String(form.get('body') || '').trim().slice(0, 6000);
  if (!title || !body) back(`error=${encodeURIComponent('Give the update a title and a text.')}`);
  const audience = parseAudience(String(form.get('audience') || 'all'), form.getAll('tenant_ids').map(String));
  if (audience.kind === 'tenants' && !audience.ids.length) back(`error=${encodeURIComponent('Choose at least one company.')}`);
  const sb = supabaseAdmin();
  const pn = Number(String(form.get('proposal') || '').replace(/\D/g, ''));
  const { data: prop } = pn ? await sb.from('change_proposals').select('id').eq('number', pn).maybeSingle() : { data: null };
  const row = { title, body, audience, proposal_id: prop?.id || null };
  // only a draft can be edited: a published update is withdrawn first, so what people read does not change under them
  const { error } = id ? await sb.from('announcements').update(row).eq('id', id).eq('status', 'draft') : await sb.from('announcements').insert({ ...row, created_by_email: m.user.email });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin/updates');
  back('saved=1');
}

export async function publishUpdate(form: FormData) {
  const m = await requireAdmin();
  const id = String(form.get('id') || '');
  const sb = supabaseAdmin();
  const { data: a } = await sb.from('announcements').select('id, title, body, status').eq('id', id).maybeSingle();
  if (!a || a.status === 'published') back('saved=1');
  // Title and text go through as one message so the translation keeps them consistent; the first line is the title.
  const translations: Record<string, { title: string; body: string }> = {};
  let cost = 0;
  if (hasLlm() || process.env.DEEPSEEK_API_KEY) {
    await Promise.all(LOCALES.filter((l) => l !== 'en').map(async (l) => {
      try {
        const r = await translate(`${a!.title}\n\n${a!.body}`, l, 'en');
        const [first, ...rest] = r.text.split(/\n\s*\n/);
        if (first && rest.length) translations[l] = { title: first.trim().slice(0, 160), body: rest.join('\n\n').trim() };
        cost += r.usage.cost;
      } catch { /* that language falls back to English */ }
    }));
  }
  await sb.from('announcements').update({ status: 'published', published_at: new Date().toISOString(), published_by_email: m.user.email, translations, translation_cost_usd: cost }).eq('id', id);
  revalidatePath('/admin/updates');
  back(`saved=${encodeURIComponent(`Published in ${Object.keys(translations).length + 1} languages.`)}`);
}

export async function withdrawUpdate(form: FormData) {
  await requireAdmin();
  const id = String(form.get('id') || ''), to = form.get('to') === 'draft' ? 'draft' : 'withdrawn';
  await supabaseAdmin().from('announcements').update({ status: to }).eq('id', id);
  revalidatePath('/admin/updates');
  back('saved=1');
}
