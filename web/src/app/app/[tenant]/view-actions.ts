'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/tenant';

// Session cookie (no maxAge) naming the membership an admin is viewing the workspace as.
export async function setViewAs(slug: string, membershipId: string) {
  await requireAdmin();
  const store = await cookies();
  if (membershipId) store.set(`merch_viewas_${slug}`, membershipId, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  else store.delete(`merch_viewas_${slug}`);
  redirect(`/app/${slug}`);
}
