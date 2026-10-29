'use server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendMail } from '@/lib/mail';

const Req = z.object({
  company: z.string().min(2).max(120), kind: z.enum(['buying_office', 'brand', 'factory', 'trading', 'retailer']),
  name: z.string().min(2).max(80), email: z.string().email().max(120), country: z.string().max(60).optional(), message: z.string().max(1000).optional(),
});

export async function requestAccess(_prev: { ok: boolean; error: string }, form: FormData) {
  if (form.get('website')) return { ok: true, error: '' }; // honeypot
  const parsed = Req.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: 'Please check the form.' };
  const d = parsed.data;
  const { error } = await supabaseAdmin().from('access_requests').insert({ company: d.company, kind: d.kind, name: d.name, email: d.email.toLowerCase(), country: d.country || null, message: d.message || null });
  if (error) return { ok: false, error: 'Could not save the request. Try again.' };
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (to) await sendMail({ to, subject: `VIA Merch access request: ${d.company}`, text: `${d.name} <${d.email}>\n${d.kind}${d.country ? ', ' + d.country : ''}\n\n${d.message || ''}\n\nAdmin: ${process.env.NEXT_PUBLIC_APP_URL}/admin/requests` }).catch(() => {});
  return { ok: true, error: '' };
}
