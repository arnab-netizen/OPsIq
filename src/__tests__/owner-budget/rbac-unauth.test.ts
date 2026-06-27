/**
 * Dynamic Budget — Runtime RBAC: unauthenticated fail-closed proof.
 *
 * Invokes the REAL exported budget route handlers (no auth mock). The real
 * `getSessionFact` finds no session, so `withCanonicalEnforcement` fails closed
 * BEFORE any handler/business logic runs. Asserts every budget route denies the
 * request (never 200) and leaks no budget/action/plan data.
 *
 * `[db]`-gated because the wrapper's readiness + membership pipeline touches the
 * DB; mirrors the proven owner-collective unauthenticated route proof.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-budget/rbac-unauth.test.ts
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/** Fields that must never appear in a denied response body. */
const SENSITIVE_KEYS = [
  "mode", "confidence", "nextBestAction", "cashImpact", "profitImpact",
  "generatedActions", "scenarios", "plan", "title", "expectedFinancialImpact",
  "verificationMethod", "escalationPath", "hasData", "hasPlan",
];

function assertNoBudgetDataLeak(body: Record<string, unknown>) {
  // Denied responses carry only error envelope fields, never budget payload.
  for (const k of SENSITIVE_KEYS) {
    expect(body[k], `denied response must not expose '${k}'`).toBeUndefined();
  }
  // And must not be an array of records.
  expect(Array.isArray(body)).toBe(false);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Dynamic Budget RBAC — unauthenticated fail-closed", () => {
  const bid = "11111111-1111-1111-1111-111111111111";

  it("[db] GET read routes deny unauthenticated access and leak no data", async () => {
    const reads: Array<[string, string]> = [
      ["guidance", "@/app/api/owner/budget/guidance/route"],
      ["snapshots", "@/app/api/owner/budget/snapshots/route"],
      ["forecast", "@/app/api/owner/budget/forecast/route"],
      ["authority", "@/app/api/owner/budget/authority/route"],
      ["actions", "@/app/api/owner/budget/actions/route"],
    ];
    for (const [name, mod] of reads) {
      const { GET } = await import(mod);
      const req = new NextRequest(`http://localhost/api/owner/budget/${name}?businessId=${bid}`);
      const res = await GET(req, { params: Promise.resolve({}) });
      expect(res.status, `${name} must not return 200 unauthenticated`).not.toBe(200);
      const body = await res.json().catch(() => ({}));
      assertNoBudgetDataLeak(body);
    }
  });

  it("[db] write routes deny unauthenticated access (no mutation reachable)", async () => {
    const { PATCH } = await import("@/app/api/owner/budget/actions/[actionId]/route");
    const patchReq = new NextRequest("http://localhost/api/owner/budget/actions/" + bid, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "assigned" }),
    });
    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ actionId: bid }) });
    expect(patchRes.status).not.toBe(200);
    assertNoBudgetDataLeak(await patchRes.json().catch(() => ({})));

    const { POST: overridePost } = await import("@/app/api/owner/budget/override/route");
    const ovReq = new NextRequest("http://localhost/api/owner/budget/override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: bid, originalRecommendation: "x", riskWarning: "x", reason: "x", expectedConsequence: "x" }),
    });
    const ovRes = await overridePost(ovReq, { params: Promise.resolve({}) });
    expect(ovRes.status).not.toBe(200);
    assertNoBudgetDataLeak(await ovRes.json().catch(() => ({})));

    const { POST: spendPost } = await import("@/app/api/owner/budget/spend/route");
    const spendReq = new NextRequest("http://localhost/api/owner/budget/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: bid, label: "x", category: "x", amount: 1, requestedByUserId: bid, ownerApprovalThreshold: 1 }),
    });
    const spendRes = await spendPost(spendReq, { params: Promise.resolve({}) });
    expect(spendRes.status).not.toBe(200);
    assertNoBudgetDataLeak(await spendRes.json().catch(() => ({})));

    const { POST: authPost } = await import("@/app/api/owner/budget/authority/route");
    const authReq = new NextRequest("http://localhost/api/owner/budget/authority", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: bid, toStatus: "WATCH", reason: "x" }),
    });
    const authRes = await authPost(authReq, { params: Promise.resolve({}) });
    expect(authRes.status).not.toBe(200);
    assertNoBudgetDataLeak(await authRes.json().catch(() => ({})));
  });
});
