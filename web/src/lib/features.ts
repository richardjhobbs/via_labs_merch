// Per-company feature switches: tenants.settings.features, switched in the VIA console (company page,
// "Features" card). Use this for an enhancement that only some companies get: add an entry here, gate the
// code with hasFeature(), and announce it with audience "feature" so only companies that hold it see it as
// theirs. Paid add-ons (settings.addons) and tracks (settings.tracks) keep their own switches.
export type Feature = { key: string; name: string; description: string };

export const FEATURES: Feature[] = [];

export type TenantSettings = { addons?: Record<string, boolean>; tracks?: Record<string, boolean>; features?: Record<string, boolean> };
export const hasFeature = (settings: TenantSettings | null | undefined, key: string) => !!settings?.features?.[key];
export const featureByKey = (key: string) => FEATURES.find((f) => f.key === key) || null;
