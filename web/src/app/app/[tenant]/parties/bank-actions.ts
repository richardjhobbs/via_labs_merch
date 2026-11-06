'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { supabaseServer } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/tenant';
import { BANK_COLUMNS, CONFIRM_METHODS, bankFrom, canAddBank, canDecideBank, maskAccount, sameAccount, type BankRow } from '@/lib/bank';

const METHOD_TEXT: Record<string, string> = { known_phone: 'phone call to a known number', in_person: 'in person', known_contact: 'known contact', other: 'other' };

async function start(form: FormData) {
  const slug = String(form.get('tenant')), partyId = String(form.get('party_id'));
  const ctx = await requireTenant(slug);
  const sb = await supabaseServer();
  const { data: party } = await sb.from('parties').select('id, name').eq('id', partyId).eq('tenant_id', ctx.tenant.id).maybeSingle();
  const back = `/app/${slug}/parties/${partyId}`;
  if (!party) redirect(`/app/${slug}/parties`);
  const log = (what: string, ref: Record<string, unknown>) => sb.rpc('ledger_append', { p_tenant: ctx.tenant.id, p_channel: 'Console', p_actor: ctx.membership.display_name || ctx.user.email, p_actor_user: ctx.user.id, p_counterparty: party.name, p_stream: 'Setup', p_order: null, p_what: what, p_gate: 'Logged', p_gated: false, p_ref: ref });
  const done = () => { revalidatePath(back); revalidatePath(`/app/${slug}/parties`); };
  return { ...ctx, sb, party, back, log, done };
}
const fail = (back: string, message: string) => redirect(`${back}?error=${encodeURIComponent(message)}#bank`);

// A typed account goes in pending, like one read from a document.
export async function addBank(form: FormData) {
  const { tenant, membership, sb, party, back, log, done } = await start(form);
  const t = await getTranslations('parties.bank');
  if (!canAddBank(membership.role)) fail(back, t('noRole'));
  const b = bankFrom(form);
  if (!b.success) fail(back, t('needAccount'));
  const d = b.data!;
  const { data: rows } = await sb.from('party_bank_accounts').select('account_no').eq('party_id', party.id).eq('tenant_id', tenant.id).in('status', ['pending', 'confirmed']);
  if ((rows || []).some((r) => sameAccount(r, d))) fail(back, t('duplicate'));
  const { error } = await sb.from('party_bank_accounts').insert({ tenant_id: tenant.id, party_id: party.id, ...d, currency: d.currency?.toUpperCase(), source: 'manual', added_by_name: membership.display_name });
  if (error) fail(back, error.message);
  await log(`Added bank account ${maskAccount(d.account_no)} for ${party.name}, awaiting confirmation`, { account: maskAccount(d.account_no) });
  done();
  redirect(`${back}#bank`);
}

// Confirmed after checking outside the document. Replaces any confirmed account in the same currency.
export async function confirmBank(form: FormData) {
  const { tenant, membership, sb, party, back, log, done } = await start(form);
  const t = await getTranslations('parties.bank');
  if (!canDecideBank(membership.role)) fail(back, t('noDecide'));
  const id = String(form.get('id')), method = String(form.get('method') || ''), note = String(form.get('note') || '').trim().slice(0, 300);
  if (form.get('checked') !== 'on' || !(CONFIRM_METHODS as readonly string[]).includes(method) || note.length < 3) fail(back, t('needConfirm'));
  const { data } = await sb.from('party_bank_accounts').select(BANK_COLUMNS).eq('id', id).eq('party_id', party.id).eq('tenant_id', tenant.id).eq('status', 'pending').maybeSingle();
  const row = data as BankRow | null;
  if (!row) fail(back, t('gone'));
  const { data: updated, error } = await sb.from('party_bank_accounts').update({ status: 'confirmed', confirm_method: method, confirm_note: note, decided_by_name: membership.display_name }).eq('id', id).eq('tenant_id', tenant.id).select('id');
  if (error || !updated?.length) fail(back, error?.message || t('noDecide'));
  let old = sb.from('party_bank_accounts').update({ status: 'superseded' }).eq('party_id', party.id).eq('tenant_id', tenant.id).eq('status', 'confirmed').neq('id', id);
  old = row!.currency ? old.eq('currency', row!.currency) : old.is('currency', null);
  await old;
  await log(`Confirmed bank account ${maskAccount(row!.account_no)} for ${party.name} (${METHOD_TEXT[method]})`, { account: maskAccount(row!.account_no), method });
  done();
  redirect(`${back}#bank`);
}

export async function rejectBank(form: FormData) {
  const { tenant, membership, sb, party, back, log, done } = await start(form);
  const t = await getTranslations('parties.bank');
  if (!canDecideBank(membership.role)) fail(back, t('noDecide'));
  const id = String(form.get('id'));
  const { data: updated, error } = await sb.from('party_bank_accounts').update({ status: 'rejected', decided_by_name: membership.display_name }).eq('id', id).eq('party_id', party.id).eq('tenant_id', tenant.id).eq('status', 'pending').select('account_no');
  if (error || !updated?.length) fail(back, error?.message || t('gone'));
  await log(`Rejected bank account ${maskAccount(updated![0].account_no)} for ${party.name}`, { account: maskAccount(updated![0].account_no) });
  done();
  redirect(`${back}#bank`);
}
