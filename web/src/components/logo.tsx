import Image from 'next/image';

// VIA marks. `merch` renders the VIA Merch stacked wordmark (via_labs/images/brand/via-merch, 826x522 at 2x);
// otherwise the plain VIA wordmark (via_labs/vialogoblack.png, cropped, 924x380). Height in px; width follows the ratio.
// `tone="white"` for dark grounds; `adaptive` follows the workspace's day or night view (both marks, CSS shows one).
// Never typeset "VIA" or "MERCH" as text next to these.
export function Logo({ h = 22, sub, merch = false, tone = 'black', adaptive = false, className = '' }: { h?: number; sub?: string; merch?: boolean; tone?: 'black' | 'white'; adaptive?: boolean; className?: string }) {
  const src = (t: 'black' | 'white') => merch ? (t === 'white' ? '/via-merch-white.png' : '/via-merch-black.png') : (t === 'white' ? '/via-logo-white.png' : '/via-logo.png');
  const ratio = merch ? 826 / 522 : 924 / 380;
  const img = (t: 'black' | 'white', cls?: string) => <Image src={src(t)} alt={merch ? 'VIA Merch' : 'VIA'} height={h} width={Math.round(h * ratio)} priority className={cls} style={{ height: h, width: 'auto' }} />;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {adaptive ? <>{img('black', 'logo-day')}{img('white', 'logo-night')}</> : img(tone)}
      {sub && <span className="muted small">{sub}</span>}
    </span>
  );
}
