import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // When this build started: lib/helpdesk/shipped.ts treats a merge recorded before it as included in the build.
  env: { MERCH_BUILD_AT: new Date().toISOString(), MERCH_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '' },
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  headers: async () => [{ source: '/(.*)', headers: [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ] }],
};

export default withNextIntl(nextConfig);
