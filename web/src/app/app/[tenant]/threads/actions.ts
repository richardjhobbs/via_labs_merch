'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/tenant';
import { threadSummary, orderSummary } from '@/lib/threads';

export async function refreshThreadSummary(form: FormData) {
  const slug = String(form.get('tenant')), id = String(form.get('id'));
  const { tenant } = await requireTenant(slug);
  await threadSummary(tenant.id, id, { force: true });
  revalidatePath(`/app/${slug}/threads/${id}`);
  redirect(`/app/${slug}/threads/${id}`);
}

export async function refreshOrderSummary(form: FormData) {
  const slug = String(form.get('tenant')), orderId = String(form.get('order_id')), po = String(form.get('po'));
  const { tenant } = await requireTenant(slug);
  await orderSummary(tenant.id, orderId, { force: true });
  revalidatePath(`/app/${slug}/orders/${encodeURIComponent(po)}`);
  redirect(`/app/${slug}/orders/${encodeURIComponent(po)}`);
}
