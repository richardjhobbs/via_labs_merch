// Develop / Produce: shown only to people who hold both tracks. A form, not a client component, so it works
// on the rail and in the phone sheet without hydration. Switching goes back to My day of the chosen track.
import { switchTrack } from '@/app/app/[tenant]/track-actions';
import type { Track } from '@/lib/tracks';

export function TrackSwitch({ slug, track, labels, compact }: { slug: string; track: Track; labels: Record<Track, string>; compact?: boolean }) {
  return (
    <form action={switchTrack} className={`seg ${compact ? 'sm' : ''}`} aria-label="Track">
      <input type="hidden" name="tenant" value={slug} />
      {(['development', 'production'] as Track[]).map((t) => <button key={t} name="track" value={t} className={track === t ? 'on' : ''} aria-pressed={track === t}>{labels[t]}</button>)}
    </form>
  );
}
