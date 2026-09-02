import type {NextConfig} from 'next'
import {requireWebRateLimitIdentitySecret} from './src/lib/rate-limit-identity'

if (process.env.NODE_ENV === 'production') requireWebRateLimitIdentitySecret(process.env)

const nextConfig: NextConfig = {
  ...(process.env.AIFANS_NEXT_DIST_DIR === '.next-production-e2e' ? {distDir: '.next-production-e2e'} : {}),
  allowedDevOrigins: ['127.0.0.1'],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
  transpilePackages: ['@aifans/ui'],
}

export default nextConfig
