// Avatars and company logos: private bucket merch-media at <tenant_id>/<kind>/<file>, written only by server code
// under the service role and served by /api/media after a membership check (migration 0015).
export const MEDIA_BUCKET = 'merch-media';
export const MEDIA_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const MEDIA_MAX = 2 * 1024 * 1024;
export const mediaUrl = (path: string | null | undefined) => (path ? `/api/media?p=${encodeURIComponent(path)}` : null);
