import { z } from "zod/v4";
import { ANONYMOUS_CLIENT_EVENTS } from "@/domain/analytics/product-events";
import { recordProductEvent } from "@/services/analytics/product-events.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/product-events — anonymous, name-only funnel events from the public site (public_start_free_clicked,
 * signup_started). A closed allowlist, no payload, no identity, rate-limited per IP. Everything else in the funnel
 * is emitted server-side from persisted facts. Always answers 204: a tracking failure must never reach the visitor.
 */
const bodySchema = z.strictObject({ name: z.enum(ANONYMOUS_CLIENT_EVENTS) });

export const POST = async (request: Request) => {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response(null, { status: 400 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { requirePgRateLimit, MUTATION_RATE_LIMIT } = await import("@/infra/rate-limit");
    await requirePgRateLimit(`product-events:${forwarded}`, MUTATION_RATE_LIMIT);
    await recordProductEvent({ name: parsed.data.name });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.name === "RateLimitError") return new Response(null, { status: 429 });
    return new Response(null, { status: 204 });
  }
};
