import { z } from "zod";
export interface AdmissionLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
// Runs only at the public Workers ingress, before even resolving a DO stub.
export async function edgeAdmission(
  request: Request,
  limiter?: AdmissionLimiter,
): Promise<number | null> {
  if (!limiter) return 503;
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  if (!z.union([z.ipv4(), z.ipv6()]).safeParse(ip).success) return 403;
  const canonical = ip.includes(":") ? new URL(`http://[${ip}]/`).hostname : ip;
  try {
    return (
      await limiter.limit({
        key: `aifans-realtime-isolated-test:ws-ip:${canonical}`,
      })
    ).success
      ? null
      : 429;
  } catch {
    return 503;
  }
}
