import Image from 'next/image';

// VIA marks. `merch` renders the VIA Merch stacked wordmark (via_labs/images/brand/via-merch, 826x522 at 2x);
// otherwise the plain VIA wordmark (via_labs/vialogoblack.png, cropped, 924x380). Height in px; width follows the ratio.
// `tone="white"` for dark grounds. Never typeset "VIA" or "MERCH" as text next to these.
export function Logo({ h = 22, sub, merch = false, tone = 'black', className = '' }: { h?: number; sub?: string; merch?: boolean; tone?: 'black' | 'white'; className?: string }) {
  const src = merch ? (tone === 'white' ? '/via-merch-white.png' : '/via-merch-black.png') : (tone === 'white' ? '/via-logo-white.png' : '/via-logo.png');
  const ratio = merch ? 826 / 522 : 924 / 380;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src={src} alt={merch ? 'VIA Merch' : 'VIA'} height={h} width={Math.round(h * ratio)} priority style={{ height: h, width: 'auto' }} />
      {sub && <span className="muted small">{sub}</span>}
    </span>
  );
}
