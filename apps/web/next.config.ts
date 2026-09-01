import type {NextConfig} from 'next'
import {requireWebRateLimitIdentitySecret} from './src/lib/rate-limit-identity'

if (process.env.NODE_ENV === 'production') requireWebRateLimitIdentitySecret(process.env)

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@aifans/ui'],
}

export default nextConfig
