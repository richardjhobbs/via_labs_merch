import Image from 'next/image';

// The VIA wordmark (via_labs/vialogoblack.png, cropped). Height in px; width follows the 924x380 ratio.
export function Logo({ h = 22, sub, className = '' }: { h?: number; sub?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image src="/via-logo.png" alt="VIA" height={h} width={Math.round(h * 924 / 380)} priority style={{ height: h, width: 'auto' }} />
      {sub && <span className="muted small">{sub}</span>}
    </span>
  );
}
