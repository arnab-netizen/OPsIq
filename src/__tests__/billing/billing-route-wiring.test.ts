/**
 * Billing route enforcement wiring proof (no server): every authenticated billing route uses
 * canonical enforcement, requires a workspace, and gates on an owner capability; mutating routes
 * require an idempotency key; the paywall is wired into governed execution; the webhook is the
 * only unauthenticated billing surface and is registered as signature-verified.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const api = path.resolve(__dirname, "../../app/api");
const read = (rel: string) => fs.readFileSync(path.join(api, rel), "utf8");

describe("billing routes require authentication, workspace and capability", () => {
  for (const [rel, cap] of [
    ["billing/checkout/route.ts", "OWNER_MANAGE"],
    ["billing/cancel/route.ts", "OWNER_MANAGE"],
    ["billing/payment-method/route.ts", "OWNER_MANAGE"],
    ["billing/status/route.ts", "OWNER_VIEW"],
  ] as const) {
    it(`${rel} is canonically enforced with ${cap}`, () => {
      const src = read(rel);
      expect(src).toContain("withCanonicalEnforcement(");
      expect(src).toContain("requireWorkspace: true");
      expect(src).toContain(`CAPABILITIES.${cap}`);
    });
  }
  it("mutating billing routes require an idempotency key and never read workspace/price from the client", () => {
    for (const rel of ["billing/checkout/route.ts", "billing/cancel/route.ts", "billing/payment-method/route.ts"]) {
      const src = read(rel);
      expect(src).toContain("idempotency-key header required");
      expect(src).toContain("ctx.verifiedWorkspaceId");
      expect(src).not.toMatch(/request!?\.json\(\)|parseRequestBody/);
    }
  });
});

describe("paywall + webhook registration", () => {
  it("governed execution (owner approval resolution) calls assertCommercialAccess before any work", () => {
    const src = read("owner/approvals/resolve/route.ts");
    expect(src.indexOf("assertCommercialAccess(ctx.verifiedWorkspaceId)")).toBeGreaterThan(-1);
    expect(src.indexOf("assertCommercialAccess(")).toBeLessThan(src.indexOf("parseRequestBody(ctx.request"));
  });
  it("the Paddle webhook is registered as a signed public route and verifies before parsing", () => {
    const ex = fs.readFileSync(path.resolve(__dirname, "../../domain/constants/public-route-exemptions.ts"), "utf8");
    expect(ex).toContain('"/api/webhooks/paddle"');
    const src = read("webhooks/paddle/route.ts");
    expect(src.indexOf("verifyPaddleSignature(")).toBeLessThan(src.indexOf("JSON.parse("));
  });
});
