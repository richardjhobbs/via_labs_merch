// Invitations to a workspace: from the VIA console (admin/actions.ts) and from Settings, Team (team-actions.ts).
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendMail, brandedHtml } from '@/lib/mail';

// What an invite from Settings carries besides the role; the ledger actor is the person who invited.
export type InviteExtra = { title?: string | null; tracks?: string[] | null; scopes?: { parties?: string[] }; actor?: string };

// Creates the auth user if needed (so OTP sign-in works for invited people only),
// records the invite, and emails a link that attaches the membership on first sign-in.
export async function inviteUser(tenantId: string, email: string, role: string, displayName: string | null, by: string, byEmail: string, welcome?: { requester: string }, extra: InviteExtra = {}) {
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).single();
  const { data: inv } = await sb.from('invites').insert({ tenant_id: tenantId, email, role, display_name: displayName, invited_by: by, title: extra.title || null, tracks: extra.tracks || null, scopes: extra.scopes || {} }).select('token').single();
  // ensure an auth user exists; ignore "already registered"
  await sb.auth.admin.createUser({ email, email_confirm: true }).catch(() => null);
  const mailError = await mailInvite(email, tenant?.name || 'VIA Merch', role, inv?.token || '', byEmail, welcome);
  await sb.rpc('ledger_append', { p_tenant: tenantId, p_channel: 'Email', p_actor: extra.actor || `VIA admin (${byEmail})`, p_actor_user: by, p_counterparty: email, p_stream: 'Setup', p_order: null, p_what: `Invited ${email} as ${role}${mailError ? ' (email failed: ' + mailError.slice(0, 80) + ')' : ''}`, p_gate: 'ADMIN', p_gated: true, p_ref: {} });
  return mailError;
}

// Returns an error message when the email could not be sent, so the console can show it.
export async function mailInvite(email: string, tenantName: string, role: string, token: string, byEmail: string, welcome?: { requester: string }): Promise<string | null> {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  try {
    const r = welcome ? await sendMail({ to: email, subject: `${tenantName} is set up on VIA Merch`,
      text: `Hello ${welcome.requester},\n\nThank you for requesting access. ${tenantName} is now set up on VIA Merch and you are its owner.\n\nAccept and sign in here:\n${url}\n\nYou sign in with a code sent to this email; there is no password. Sessions end after 2 hours without activity.\n\nWhat you will find: My day (what the agent has prepared), the Ask panel on every screen, the approval queue (nothing is sent without a person), Orders & T&A with a computed critical path, Customers & suppliers, and the ledger where every action is signed. Price, claims and order confirmation are never sent by an agent alone.\n\nWhat happens next: VIA Labs sets each company up by hand. We connect your channels (email, WhatsApp, spreadsheets), load your order book, and tune the agents with you. Richard will be in touch to agree a 20-minute call and the first customer or supplier to connect. Reply to this email with anything in the meantime.\n\nRichard Hobbs, VIA Labs Pte. Ltd. · contact@getvia.xyz · getvia.xyz`,
      html: brandedHtml({ title: `${tenantName} is set up on VIA Merch`, paragraphs: [
        `Hello ${welcome.requester}, thank you for requesting access. ${tenantName} is now set up on VIA Merch and you are its owner.`,
        'Press the button to accept and sign in. You sign in with a code sent to this email; there is no password.',
        'What you will find: My day, with what the agent has prepared; the Ask panel on every screen; the approval queue, where nothing is sent without a person; Orders & T&A with a computed critical path; Customers & suppliers; and the ledger, where every action by a person or an agent is signed. Price, claims and order confirmation are never sent by an agent alone.',
        'What happens next: VIA Labs sets each company up by hand. We connect your channels (email, WhatsApp, spreadsheets), load the order book you already keep, and tune the agents with you. Richard will be in touch to agree a 20-minute call and the first customer or supplier to connect. Reply to this email with anything in the meantime.',
      ], cta: { label: 'Accept and sign in', url }, footnote: 'Sessions end after 2 hours without activity. If you did not request access, ignore this email; nothing happens without the code.' }) })
    : await sendMail({ to: email, subject: `You're invited to ${tenantName} on VIA Merch`,
      text: `${byEmail} has invited you to ${tenantName} on VIA Merch as ${role}.\n\nOpen this link to accept and sign in:\n${url}\n\nYou sign in with a code sent to this email; there is no password. Sessions end after 2 hours without activity.\n\nVIA Labs · getvia.xyz`,
      html: brandedHtml({ title: `You're invited to ${tenantName}`, paragraphs: [`${byEmail} has invited you to ${tenantName} on VIA Merch as ${role}.`, 'Accept the invitation and sign in with the button below.'], cta: { label: 'Accept and sign in', url }, footnote: 'You sign in with a code sent to this email; there is no password. Sessions end after 2 hours without activity.' }) });
    if ((r as { skipped?: boolean }).skipped) return 'Invite recorded but no email sent: RESEND_API_KEY is not set in the Vercel project.';
    return null;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return `Invite recorded but the email failed: ${m}. Check MAIL_FROM is on a domain verified in Resend.`;
  }
}

