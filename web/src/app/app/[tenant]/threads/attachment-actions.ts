'use server';
// File a mail attachment on a style as a record (when the inbound pipeline could not match a style itself).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';
import { fileAttachmentAsRecord } from '@/lib/connectors/attachments';
import { plmOf } from '@/lib/connectors/plm';

const CAN_WRITE = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics'];

export async function fileAttachment(form: FormData) {
  const slug = String(form.get('tenant')), threadId = String(form.get('thread')), id = String(form.get('id')), styleId = String(form.get('style_id'));
  const me = await requireTenant(slug);
  const path = `/app/${slug}/threads/${threadId}`;
  if (!CAN_WRITE.includes(me.membership.role) || me.membership.id === 'admin' || !/^[0-9a-f-]{36}$/i.test(styleId)) redirect(`${path}?error=not%20allowed`);
  const sb = await supabaseServer();
  const [{ data: a }, { data: s }] = await Promise.all([
    sb.from('attachments').select('id, tenant_id, message_id, storage_path, filename, mime, bytes, sha256, record_id, messages(from_addr)').eq('tenant_id', me.tenant.id).eq('id', id).maybeSingle(),
    sb.from('styles').select('id').eq('tenant_id', me.tenant.id).eq('id', styleId).maybeSingle(),
  ]);
  if (!a || !s) redirect(`${path}?error=not%20found`);
  const plm = plmOf((a.messages as unknown as { from_addr: string | null } | null)?.from_addr);
  // the copy into the development bucket and the record insert run under the service role after this check
  await fileAttachmentAsRecord(supabaseAdmin(), { ...a, record_id: a.record_id }, styleId, { source: plm ? 'plm' : 'email', actor: me.membership.display_name || me.user.email || 'member', actorUser: me.user.id, sourceRef: plm ? `${plm} notification` : null });
  if (!a.record_id) await sb.from('threads').update({ style_id: styleId, track: 'development' }).eq('id', threadId).is('style_id', null);
  revalidatePath(path); revalidatePath(`/app/${slug}/styles/${styleId}`);
  redirect(`/app/${slug}/styles/${styleId}?saved=1`);
}
