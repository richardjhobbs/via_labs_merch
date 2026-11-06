// Seal and open channel credentials (OAuth refresh tokens) with AES-256-GCM.
// Key: MERCH_TOKEN_KEY, 32 random bytes in base64 (openssl rand -base64 32), Vercel only.
// Stored as bytea in merch.channels.auth_enc: 12-byte IV, 16-byte tag, ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const k = Buffer.from(process.env.MERCH_TOKEN_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('MERCH_TOKEN_KEY must be 32 bytes in base64');
  return k;
}

export function hasTokenKey() { try { key(); return true; } catch { return false; } }

// Returns the Postgres bytea hex literal PostgREST accepts ("\\x…").
export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return '\\x' + Buffer.concat([iv, c.getAuthTag(), body]).toString('hex');
}

export function open<T>(stored: string | null | undefined): T | null {
  if (!stored) return null;
  const buf = Buffer.from(String(stored).replace(/^\\x/, ''), 'hex');
  if (buf.length < 29) return null;
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')) as T;
}
