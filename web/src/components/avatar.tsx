import { mediaUrl } from '@/lib/media';

// A member's picture, or their initials on the accent tint when they have none.
export function Avatar({ path, name, initials, size = 28 }: { path?: string | null; name?: string | null; initials?: string | null; size?: number }) {
  const url = mediaUrl(path);
  const ini = (initials || (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2)).toUpperCase();
  const box = { width: size, height: size, borderRadius: '50%', flex: 'none' } as const;
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={name || ''} width={size} height={size} style={{ ...box, objectFit: 'cover', border: '1px solid var(--line)' }} />;
  return <span aria-hidden="true" style={{ ...box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: Math.round(size * 0.38), fontWeight: 600 }}>{ini}</span>;
}

// The company's own logo, if the owner added one.
export function CompanyLogo({ path, name, h = 28 }: { path?: string | null; name: string; h?: number }) {
  const url = mediaUrl(path);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={name} style={{ height: h, width: 'auto', maxWidth: h * 4, objectFit: 'contain', flex: 'none' }} /> : null;
}
