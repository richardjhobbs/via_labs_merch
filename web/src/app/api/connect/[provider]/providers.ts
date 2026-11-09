// The providers a member can connect from the Connections page, behind one OAuth flow.
// Google Drive shares Google's redirect URI: /api/connect/google?want=drive picks the Drive variant.
import * as google from '@/lib/connectors/google';
import * as microsoft from '@/lib/connectors/microsoft';
import { driveConfigured, driveAccount } from '@/lib/connectors/drive';
import * as zalo from '@/lib/connectors/zalo';

export type ProviderKey = 'google' | 'microsoft' | 'zalo';
type Provider = {
  kind: 'email_gmail' | 'email_m365' | 'sheets' | 'zalo'; connector: 'gmail' | 'm365' | 'gdrive' | 'zalo'; label: string; scopes: string[];
  ledger: string;   // what the connection does, for the ledger row
  configured: () => boolean;
  authUrl: (o: { state: string; challenge: string; redirectUri: string; loginHint?: string }) => string;
  exchange: (code: string, verifier: string, redirectUri: string) => Promise<{ access_token: string; expires_in: number; refresh_token?: string; scope?: string }>;
  // the mailbox address, plus the provider's starting cursor so only mail after this moment is read
  start: (accessToken: string) => Promise<{ account: string; cursor: Record<string, unknown> }>;
};

export const PROVIDERS: Record<ProviderKey, Provider> = {
  google: { kind: 'email_gmail', connector: 'gmail', label: 'Gmail', scopes: google.GMAIL_SCOPES, ledger: 'reads new mail from {where}, sends only approved replies', configured: google.googleConfigured, authUrl: google.authUrl, exchange: google.exchangeCode,
    start: async (t) => { const p = await google.profile(t); return { account: p.emailAddress.toLowerCase(), cursor: { history_id: p.historyId } }; } },
  microsoft: { kind: 'email_m365', connector: 'm365', label: 'Microsoft 365', scopes: ['Mail.Read', 'Mail.Send'], ledger: 'reads new mail from {where}, sends only approved replies', configured: microsoft.microsoftConfigured, authUrl: microsoft.authUrl, exchange: microsoft.exchangeCode,
    start: async (t) => { const p = await microsoft.profile(t); return { account: p.account, cursor: { since: new Date().toISOString(), at_since: [] } }; } },
  // the client's own Official Account authorises VIA's Zalo app; the account is the OA id (webhooks carry it)
  zalo: { kind: 'zalo', connector: 'zalo', label: 'Zalo OA', scopes: [], ledger: 'receives messages to the Official Account, replies only after approval', configured: zalo.zaloConfigured, authUrl: zalo.authUrl, exchange: (code, verifier) => zalo.exchangeCode(code, verifier),
    start: async (t) => { const o = await zalo.oaInfo(t); return { account: o.oa_id, cursor: { oa_name: o.name } }; } },
};

export const GOOGLE_DRIVE: Provider = { kind: 'sheets', connector: 'gdrive', label: 'Google Drive', scopes: google.DRIVE_SCOPES, ledger: 'opens only the files the person picks (drive.file)', configured: driveConfigured,
  authUrl: (o) => google.authUrl({ ...o, scopes: google.DRIVE_SCOPES }), exchange: google.exchangeCode,
  start: async (t) => ({ account: await driveAccount(t), cursor: {} }) };

export const providerOf = (k: string, want?: string | null) => (k === 'google' && want === 'drive' ? GOOGLE_DRIVE : k in PROVIDERS ? PROVIDERS[k as ProviderKey] : null);
