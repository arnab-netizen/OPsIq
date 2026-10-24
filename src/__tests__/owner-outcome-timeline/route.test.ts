/**
 * Route contract (non-DB) for the one read-only addition: GET /api/owner/businesses/[businessId]/outcome-chains.
 * OWNER_VIEW only, read-only (no write verbs), scoped to the VERIFIED workspace and the path business — nothing in the
 * query string can change the scope — and a foreign/unknown business is whatever uniform error the service raises.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const mocks = vi.hoisted(() => ({ listOwnerOutcomeChains: vi.fn() }));
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params: Record<string, string>) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params: Record<string, string>) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/services/owner-outcome/owner-outcome-chain.service", () => ({ listOwnerOutcomeChains: mocks.listOwnerOutcomeChains }));

import * as route from "@/app/api/owner/businesses/[businessId]/outcome-chains/route";

/** Source without comments, so a doc comment that NAMES the policy is not mistaken for a call to it. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const WS = "11111111-1111-4111-8111-111111111111";
const BIZ = "33333333-3333-4333-8333-333333333333";
const ctx = (qs = "") => ({ verifiedWorkspaceId: WS, verifiedActorId: "x", request: new Request(`http://t/api/owner/businesses/${BIZ}/outcome-chains${qs}`) });
const call = (c: unknown, biz = BIZ) => (route.GET as unknown as (c: unknown, p: Record<string, string>) => Promise<unknown>)(c, { businessId: biz });

beforeEach(() => mocks.listOwnerOutcomeChains.mockReset());

describe("outcome-chains route", () => {
  it("is OWNER_VIEW with a required workspace — and exports no write verb", () => {
    expect((route.GET as unknown as { __options?: unknown }).__options).toEqual({ requireCapabilities: ["owner:view"], requireWorkspace: true });
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) expect(Object.keys(route), verb).not.toContain(verb);
  });
  it("scopes to the verified workspace and the path business; query parameters cannot change the scope", async () => {
    mocks.listOwnerOutcomeChains.mockResolvedValue({ businessId: BIZ, chains: [], truncated: false });
    await call(ctx("?workspaceId=99999999-9999-4999-8999-999999999999&businessId=44444444-4444-4444-8444-444444444444&candidateId=x"));
    expect(mocks.listOwnerOutcomeChains).toHaveBeenCalledTimes(1);
    expect(mocks.listOwnerOutcomeChains).toHaveBeenCalledWith(WS, BIZ);
  });
  it("rejects a malformed business id before the service runs", async () => {
    await expect(call(ctx(), "not-a-uuid")).rejects.toThrow();
    expect(mocks.listOwnerOutcomeChains).not.toHaveBeenCalled();
  });
  it("the route has no error handling of its own: a foreign business's uniform 404 comes from the service and the canonical wrapper, untouched", () => {
    const src = code(fs.readFileSync(path.join(process.cwd(), "src/app/api/owner/businesses/[businessId]/outcome-chains/route.ts"), "utf8"));
    expect(src).not.toMatch(/\bcatch\b|\btry\b/);
    expect(src).toMatch(/return listOwnerOutcomeChains\(ctx\.verifiedWorkspaceId, params\.businessId\)/);
  });
});

describe("no new engine, no new persistence, no schema change", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  it("the route and the new components never write to the database or run the policy", () => {
    const files = [
      "src/app/api/owner/businesses/[businessId]/outcome-chains/route.ts",
      "src/domain/owner-spine/owner-outcome-presentation.ts",
      "src/components/owner-outcomes/outcome-api.ts", "src/components/owner-outcomes/OutcomeTimeline.tsx",
      "src/components/owner-outcomes/OutcomeCommitmentForm.tsx", "src/components/owner-outcomes/OwnerOutcomesView.tsx",
    ];
    for (const f of files) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/\.(create|update|updateMany|upsert|delete|deleteMany|createMany)\(/);
      expect(src, f).not.toMatch(/assessOwnerOutcome\(|verifyOutcome\(|controlled-learning|learning-bridge|resolveOwnerDecision|rankOwnerCandidates/);
      expect(src, f).not.toMatch(/\$transaction|prisma\./);
    }
  });
  it("the list read adds no persistence: it only reads the two existing tables", () => {
    const src = read("src/services/owner-outcome/owner-outcome-chain.service.ts");
    const fn = src.slice(src.indexOf("export async function listOwnerOutcomeChains"));
    expect(fn).toMatch(/ownerDecisionRecord\.groupBy/);
    expect(fn).not.toMatch(/\.(create|update|updateMany|upsert|delete|deleteMany|createMany)\(/);
  });
  it("the persistence this feature reads is the existing Core schema (the no-migration claim itself is verified by git diff, not here)", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model OwnerDecisionRecord/);
    expect(schema).toMatch(/model OwnerOutcomeAssessment/);
  });
});
