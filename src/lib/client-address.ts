/**
 * The client address for abuse bounds that must not be spoofable by the caller. The hosting platform sets
 * `x-real-ip` / `x-vercel-forwarded-for`; the `x-forwarded-for` LIST is caller-influenced wherever a proxy appends to
 * rather than overwrites it, so in production it is never trusted. Outside production (tests, local dev) there is no
 * platform header, so the first forwarded entry is used purely so that behaviour is exercisable. Returns null when
 * there is no trustworthy address (the bound is then skipped, never keyed on a made-up value).
 */
export function trustedClientAddress(headers: Pick<Headers, "get">, env: string | undefined = process.env.NODE_ENV): string | null {
  const platform = headers.get("x-real-ip")?.trim() || headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (platform) return platform.slice(0, 64);
  if (env === "production") return null;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 64) : null;
}
