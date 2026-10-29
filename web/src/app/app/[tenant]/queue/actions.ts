'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { decideDraft } from '@/lib/drafts';

// A person approves (optionally after editing) or rejects a draft. Both are signed ledger rows.
export async function approveDraft(form: FormData) { return decide(form, 'approved'); }
export async function rejectDraft(form: FormData) { return decide(form, 'rejected'); }

async function decide(form: FormData, status: 'approved' | 'rejected') {
  const slug = String(form.get('tenant')), id = String(form.get('id')), body = String(form.get('body') || ''), note = String(form.get('note') || '').trim();
  const back = String(form.get('back') || '');
  const me = await requireTenant(slug);
  const r = await decideDraft(me, id, status, { body, note });
  revalidatePath(`/app/${slug}/queue`); revalidatePath(`/app/${slug}`);
  const dest = back.startsWith(`/app/${slug}`) ? back : `/app/${slug}/queue`;
  redirect(dest + (dest.includes('?') ? '&' : '?') + (r.ok ? 'saved=1' : 'error=' + encodeURIComponent(r.error || 'failed')));
}
