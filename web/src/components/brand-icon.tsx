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

// Several platforms in one tile (2 by 2), for an entry that covers more than one app.
export function BrandCluster({ logos, names, size = 36 }: { logos: string[]; names: string; size?: number }) {
  const cell = Math.floor((size - 6) / 2);
  return (
    <span className="inline-grid shrink-0" title={names} style={{ width: size, height: size, gridTemplateColumns: `repeat(2, ${cell}px)`, gap: 2, padding: 1, borderRadius: Math.round(size * 0.22), background: '#fff', border: '1px solid var(--line)', placeContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logos.slice(0, 4).map((l) => <img key={l} src={l} alt="" width={cell} height={cell} style={{ objectFit: 'contain' }} />)}
    </span>
  );
}

// A row of platform logos, for guidance text.
export function BrandRow({ items, size = 22 }: { items: [string, string][]; size?: number }) {
  return <span className="inline-flex gap-1 flex-wrap">{items.map(([name, logo]) => <BrandIcon key={name} name={name} logo={logo} size={size} />)}</span>;
}
