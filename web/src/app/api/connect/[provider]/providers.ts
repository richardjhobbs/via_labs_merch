// The mail providers a member can connect from the Connections page, behind one OAuth flow.
import * as google from '@/lib/connectors/google';
import * as microsoft from '@/lib/connectors/microsoft';

export type ProviderKey = 'google' | 'microsoft';
type Provider = {
  kind: 'email_gmail' | 'email_m365'; connector: 'gmail' | 'm365'; label: string; scopes: string[];
  configured: () => boolean;
  authUrl: (o: { state: string; challenge: string; redirectUri: string; loginHint?: string }) => string;
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string }>;
  // the mailbox address, plus the provider's starting cursor so only mail after this moment is read
  start: (accessToken: string) => Promise<{ account: string; cursor: Record<string, unknown> }>;
};

export const PROVIDERS: Record<ProviderKey, Provider> = {
  google: { kind: 'email_gmail', connector: 'gmail', label: 'Gmail', scopes: google.GMAIL_SCOPES, configured: google.googleConfigured, authUrl: google.authUrl, exchange: google.exchangeCode,
    start: async (t) => { const p = await google.profile(t); return { account: p.emailAddress.toLowerCase(), cursor: { history_id: p.historyId } }; } },
  microsoft: { kind: 'email_m365', connector: 'm365', label: 'Microsoft 365', scopes: ['Mail.Read', 'Mail.Send'], configured: microsoft.microsoftConfigured, authUrl: microsoft.authUrl, exchange: microsoft.exchangeCode,
    start: async (t) => { const p = await microsoft.profile(t); return { account: p.account, cursor: { since: new Date().toISOString(), at_since: [] } }; } },
};

export const providerOf = (k: string) => (k in PROVIDERS ? PROVIDERS[k as ProviderKey] : null);
