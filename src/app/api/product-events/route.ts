import { z } from "zod/v4";
import { ANONYMOUS_CLIENT_EVENTS } from "@/domain/analytics/product-events";
import { recordProductEvent } from "@/services/analytics/product-events.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/product-events — anonymous, name-only funnel events from the public site (public_start_free_clicked,
 * signup_started). Closed allowlist, no payload, no identity. Abuse bounds: a body-size limit, a per-client cap
 * keyed on the PLATFORM-set client address (never a caller-supplied forwarding list), and a GLOBAL hourly cap so
 * spoofing many addresses still cannot grow the audit table without limit. It ALWAYS answers 204 — a tracking
 * failure, a rejected body and a throttle are all indistinguishable to the caller (no validity or throttle oracle).
 */
const MAX_BODY_BYTES = 256;
const GLOBAL_HOURLY_WRITE_CAP = 600;
const bodySchema = z.strictObject({ name: z.enum(ANONYMOUS_CLIENT_EVENTS) });
const NO_CONTENT = () => new Response(null, { status: 204 });

/** The client address as set by the hosting platform; the caller-controlled X-Forwarded-For list is not trusted. */
function platformClientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export const POST = async (request: Request) => {
  try {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return NO_CONTENT();
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NO_CONTENT();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      return NO_CONTENT();
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return NO_CONTENT();

    const { requirePgRateLimit, MUTATION_RATE_LIMIT } = await import("@/infra/rate-limit");
    await requirePgRateLimit(`product-events:${platformClientAddress(request)}`, MUTATION_RATE_LIMIT);
    await requirePgRateLimit("product-events:global", { windowMs: 60 * 60 * 1000, maxAttempts: GLOBAL_HOURLY_WRITE_CAP });
    await recordProductEvent({ name: parsed.data.name });
  } catch {
    /* rate-limited or failed: indistinguishable from success by design */
  }
  return NO_CONTENT();
};
