// A connector's logo in a square tile; falls back to the initial when there is no logo file.
export function BrandIcon({ name, logo, size = 28 }: { name: string; logo: string | null; size?: number }) {
  const pad = Math.round(size * 0.18);
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: '#fff', border: '1px solid var(--line)', overflow: 'hidden' }} title={name}>
      {logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logo} alt={name} width={size - pad * 2} height={size - pad * 2} style={{ objectFit: 'contain' }} />
        : <span className="font-semibold" style={{ fontSize: Math.round(size * 0.42), color: 'var(--accent)' }}>{name.slice(0, 1)}</span>}
    </span>
  );
}
