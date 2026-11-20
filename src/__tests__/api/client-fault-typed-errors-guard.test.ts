/**
 * Recurrence guard: an API route never rejects a client mistake with a plain Error or a raw ZodError.
 *
 * The canonical wrapper turns anything that is not an AppError (statusCode + code) into the generic 500. So in
 * src/app/api/** route files:
 *  1. zod input parsing goes through parseOrThrow / parseRequestBody / parseSearchParams (a ValidationError with
 *     only {path, message} field errors) — a bare `<schema>.parse(` is allowed only in a route that catches the
 *     ZodError itself and answers 400;
 *  2. every remaining `throw new Error(` is a reviewed SERVER fault listed below. A new one must be classified:
 *     a client fault uses ValidationError / NotFoundError / ConflictError / ForbiddenError /
 *     InvalidStateTransitionError / PlanLimitError / RateLimitError from src/infra/errors.ts; a genuine server
 *     fault is added here with its reason.
 * The behaviour itself is proven on the real routes by client-fault-status-real-route.db.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const API_DIR = join(ROOT, "src", "app", "api");

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const FILES = routeFiles(API_DIR).map((f) => ({ rel: relative(ROOT, f).split("\\").join("/"), src: readFileSync(f, "utf8") }));

/** Routes that parse with a bare `.parse(` inside a try whose catch maps `z.ZodError` to a 400 response. */
const LOCAL_ZOD_HANDLERS = [
  "src/app/api/engagements/[engagementId]/escalation-checks/route.ts",
  "src/app/api/engagements/[engagementId]/review-cycles/route.ts",
  "src/app/api/public/engagements/route.ts",
  "src/app/api/public/actions/route.ts",
  "src/app/api/public/kpis/route.ts",
  "src/app/api/owner/config/route.ts",
  "src/app/api/owner/dashboard/route.ts",
];

/** Reviewed server-fault plain throws, one entry per occurrence: [route file, start of the thrown message, why]. */
const SERVER_FAULT_THROWS: Array<[string, string, string]> = [
  ["src/app/api/operator/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/notifications/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/notifications/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/owner/config/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/owner/config/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/owner/first-value/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/owner/dashboard/route.ts", '"Request object not available"', "wrapper always supplies the request"],
  ["src/app/api/intelligence/summary/route.ts", "`Dependency validation failed", "evaluates the stored decision snapshot"],
  ["src/app/api/intelligence/summary/route.ts", "`Decision gate rejected", "evaluates the stored decision snapshot"],
  ["src/app/api/intelligence/summary/route.ts", '"Guardrails violation"', "evaluates the stored decision snapshot"],
  ["src/app/api/intelligence/recommendations/route.ts", "`Dependency validation failed", "evaluates the stored decision snapshot"],
  ["src/app/api/intelligence/recommendations/route.ts", "`Decision gate rejected", "evaluates the stored decision snapshot"],
  ["src/app/api/intelligence/recommendations/route.ts", '"Guardrails violation"', "evaluates the stored decision snapshot"],
  ["src/app/api/export/route.ts", "`Export validation failed", "validates server-built export data"],
  ["src/app/api/export/route.ts", "`Export failed", "validates server-built export data"],
  ["src/app/api/billing/upgrade/route.ts", '\n      "Stripe secret key is not set', "payment provider not configured"],
  ["src/app/api/billing/upgrade/route.ts", '"Payment service is not configured"', "payment provider not configured"],
  ["src/app/api/billing/upgrade/route.ts", '"Plan is not configured for checkout"', "plan data misconfigured"],
  ["src/app/api/billing/upgrade/route.ts", '"Failed to initialize payment"', "payment provider failure"],
  ["src/app/api/billing/upgrade/route.ts", '"Failed to create checkout session"', "payment provider failure"],
  ["src/app/api/webhooks/[id]/test/route.ts", "`Webhook test failed", "the subscriber endpoint failed (upstream)"],
  ["src/app/api/decisions/submit-external/route.ts", '"Endpoint disabled"', "endpoint retired fail-closed"],
  ["src/app/api/decisions/submit-external/route.ts", '"Endpoint disabled"', "endpoint retired fail-closed"],
  ["src/app/api/decisions/[decisionId]/evaluate/route.ts", "`Evaluation engine failed", "internal engine call failed"],
  ["src/app/api/run/route.ts", "errorMsg", "scenario generation / unknown engine failure (client outcomes mapped above it)"],
  ["src/app/api/run/route.ts", '"User identity required"', "wrapper always supplies the verified actor"],
  ["src/app/api/run/route.ts", "`Control layer validation incomplete", "control-layer bypass detected"],
  ["src/app/api/internal/signup-proof/route.ts", '"Validation failed"', "internal diagnostic, caught locally"],
  ["src/app/api/internal/signup-proof/route.ts", '"Password too short"', "internal diagnostic, caught locally"],
  ["src/app/api/internal/signup-proof/route.ts", '"Bcrypt verification failed"', "internal diagnostic, caught locally"],
  ["src/app/api/internal/demo-engagement-proof/route.ts", '"DUPLICATE_DEMO_ENGAGEMENT_CANDIDATES"', "data invariant violated"],
];

describe("API routes reject client mistakes with typed AppErrors", () => {
  it("no route lets a raw ZodError escape (bare <schema>.parse( only where the route maps ZodError itself)", () => {
    const offenders = FILES.filter(({ rel, src }) => /\b\w+(Schema|schema)\.parse\(/.test(src) && !LOCAL_ZOD_HANDLERS.includes(rel)).map((f) => f.rel);
    expect(offenders).toEqual([]);
    for (const rel of LOCAL_ZOD_HANDLERS) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, rel).toBeDefined();
      expect(file!.src, `${rel} must still map ZodError locally`).toMatch(/instanceof z\.ZodError/);
    }
  });

  it("no route echoes zod issues in an error message", () => {
    const offenders = FILES.filter(({ src }) => /throw new \w*Error\([^)]*\.issues\)/.test(src)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("every remaining plain `throw new Error(` in a route is a reviewed server fault", () => {
    const unclassified: string[] = [];
    const used = new Set<number>();
    for (const { rel, src } of FILES) {
      let at = src.indexOf("throw new Error(");
      while (at !== -1) {
        const after = src.slice(at + "throw new Error(".length);
        const idx = SERVER_FAULT_THROWS.findIndex(([file, start], i) => file === rel && after.startsWith(start) && !used.has(i));
        if (idx === -1) unclassified.push(`${rel}: throw new Error(${after.slice(0, 70).split("\n")[0]}`);
        else used.add(idx);
        at = src.indexOf("throw new Error(", at + 1);
      }
    }
    expect(unclassified).toEqual([]);
    const stale = SERVER_FAULT_THROWS.filter((_, i) => !used.has(i)).map(([file, start]) => `${file}: ${start}`);
    expect(stale, "allowlist entries that no longer match a throw must be removed").toEqual([]);
  });
});
