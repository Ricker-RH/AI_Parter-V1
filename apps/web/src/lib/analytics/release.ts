const releasePattern = /^[A-Za-z0-9._-]{1,64}$/

export function analyticsRelease(environment: Record<string, string | undefined>): string {
  const candidate = environment.VERCEL_GIT_COMMIT_SHA ?? environment.AIFANS_RELEASE
  return candidate && releasePattern.test(candidate) ? candidate : 'local'
}
