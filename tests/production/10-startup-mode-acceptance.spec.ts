/**
 * LIVE PRODUCTION acceptance -- Phase 13 (Startup Mode) + auth proof block.
 *
 * Runs against the real, deployed production OpsIQ app (BASE_URL), using a
 * real Owner account authenticated through the actual login form. Every
 * mutation in this spec is confined to data this spec itself creates and
 * clearly tags as acceptance data (see ACCEPTANCE_TAG below) -- it never
 * touches Trinity Services or any other pre-existing business.
 *
 * This is NOT a substitute for tests/browser/56-startup-mode-journey.spec.ts
 * (CI, throwaway Postgres, seeded fixtures). That proves the code path
 * works against a controlled environment; this proves the actual production
 * deployment behaves the same way for a real account. Both are required --
 * neither supersedes the other.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { authenticateProductionOwner, logoutProductionOwner } from "./helpers/production-auth";
import {
  startEvidenceCollection,
  captureOnFailure,
  checkpointScreenshot,
  finalizeEvidence,
  timedApiCall,
} from "./helpers/evidence";

const SPEC_NAME = "phase13-startup-mode";
const ACCEPTANCE_TAG = `OPSIQ Production Acceptance - ${new Date().toISOString().slice(0, 19)}Z`;

const consoleErrors: string[] = [];
const networkFailures: Array<{ url: string; status: number }> = [];
function watchPage(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) networkFailures.push({ url: res.url(), status: res.status() });
  });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

test.describe.configure({ mode: "serial" });

test.describe("PROD-13 — Startup Mode live production acceptance", () => {
  let context: BrowserContext;
  let page: Page;
  let handoffSessionId = "";
  let handoffIdeaId = "";
  let handoffBusinessId = "";

  test.beforeAll(async ({ browser }) => {
    mkdirSync("production-test-results/evidence", { recursive: true });
    context = await browser.newContext();
    page = await context.newPage();
    watchPage(page);
    // Auth happens BEFORE evidence collection starts -- no raw Playwright
    // trace is ever produced for this suite (see helpers/evidence.ts).
    await authenticateProductionOwner(page);
    await startEvidenceCollection(context, page, SPEC_NAME);
  });

  test.afterEach(async ({}, testInfo) => {
    await captureOnFailure(context, page, testInfo, SPEC_NAME);
  });

  test.afterAll(async () => {
    await finalizeEvidence(context, SPEC_NAME);
    // succeeded reflects whether the handoff actually completed (a real
    // UUID businessId), not merely whether the file could be written --
    // 20-existing-business-acceptance.spec.ts uses this to distinguish a
    // genuine upstream failure (BLOCKED_UPSTREAM) from a real business ID.
    writeFileSync(
      `production-test-results/evidence/${SPEC_NAME}-ids.json`,
      JSON.stringify(
        {
          acceptanceTag: ACCEPTANCE_TAG,
          handoffSessionId,
          handoffIdeaId,
          handoffBusinessId,
          succeeded: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handoffBusinessId),
        },
        null,
        2
      )
    );
    if (context) await context.close();
  });

  // ─── AUTH proof block ─────────────────────────────────────────────────

  test("AUTH-01 — login establishes a session (already proven by beforeAll; assert current page is not /login)", async () => {
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("AUTH-02 — reload persists the session (no redirect to /login)", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("AUTH-03 — unauthorized access to a nonexistent workspace-scoped resource is rejected, not silently allowed", async () => {
    const res = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get("/api/owner/startup/sessions/00000000-0000-0000-0000-000000000000")
    );
    expect([403, 404]).toContain(res.status());
  });

  // ─── Phase 13: Startup Mode real browser handoff journey ──────────────

  test("13-01 — create a clearly-tagged Startup acceptance session + idea", async () => {
    const created = await timedApiCall(context, "POST", "/api/owner/startup/sessions", () =>
      page.request.post("/api/owner/startup/sessions", {
        data: {
          sessionLabel: ACCEPTANCE_TAG,
          intake: {
            location: "Australia",
            capitalAvailable: null,
            hoursPerWeekAvailable: null,
            riskTolerance: null,
            skills: [],
          },
          ideas: [{ name: ACCEPTANCE_TAG, industry: "Automotive Services", structural: {} }],
          // Marks this as synthetic acceptance data at creation time (see
          // OwnerStartupSession.isFixtureBusiness), rather than relying on the "OPSIQ Production
          // Acceptance - ..." label to keep it out of ordinary owners' Startup planning history —
          // mirrors domain-business.ts's isFixtureBusiness flag for business creation. Requires
          // the acceptance account to hold SYSTEM_ADMIN in the target environment; the route
          // silently ignores this flag otherwise.
          isFixtureBusiness: true,
        },
      })
    );
    expect(created.status()).toBe(201);
    handoffSessionId = (await created.json()).sessionId;
    expect(handoffSessionId).toBeTruthy();

    const sessionRes = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get(`/api/owner/startup/sessions/${handoffSessionId}`)
    );
    expect(sessionRes.status()).toBe(200);
    handoffIdeaId = (await sessionRes.json()).session.ideas[0].id;
    expect(handoffIdeaId).toBeTruthy();
  });

  test("13-02 — drive the session through screening and the required lifecycle statuses up to APPROVED", async () => {
    for (const status of ["CONTEXT_CAPTURE", "DISCOVERY", "IDEA_GENERATION", "SCREENING"]) {
      const res = await timedApiCall(context, "PATCH", "/api/owner/startup/sessions/:sessionId", () =>
        page.request.patch(`/api/owner/startup/sessions/${handoffSessionId}`, { data: { status } })
      );
      expect(res.status()).toBe(200);
    }

    const screenRes = await timedApiCall(
      context,
      "POST",
      "/api/owner/startup/sessions/:sessionId/analysis",
      () =>
        page.request.post(`/api/owner/startup/sessions/${handoffSessionId}/analysis`, {
          data: {
            action: "SCREEN",
            ideaId: handoffIdeaId,
            profile: {
              capitalAvailableCents: 5_000_000,
              ownerHoursPerWeek: 20,
              riskTolerance: "MEDIUM",
              location: "Australia",
              cashRunwayMonthsAvailable: 6,
              minimumMonthlyIncomeNeededCents: 300_000,
            },
          },
        })
    );
    expect(screenRes.status()).toBe(200);

    for (const status of ["ECONOMICS_REVIEW", "READINESS_REVIEW", "OWNER_DECISION_REQUIRED"]) {
      const res = await timedApiCall(context, "PATCH", "/api/owner/startup/sessions/:sessionId", () =>
        page.request.patch(`/api/owner/startup/sessions/${handoffSessionId}`, { data: { status } })
      );
      expect(res.status()).toBe(200);
    }
  });

  test("13-03 — record GO decision and create the execution blueprint", async () => {
    const decisionRes = await timedApiCall(
      context,
      "POST",
      "/api/owner/startup/sessions/:sessionId/decision",
      () =>
        page.request.post(`/api/owner/startup/sessions/${handoffSessionId}/decision`, {
          data: { ideaId: handoffIdeaId, decisionType: "GO", rationale: `${ACCEPTANCE_TAG} approval` },
        })
    );
    expect(decisionRes.status()).toBe(201);
    const ownerDecisionId = (await decisionRes.json()).ownerDecisionId;
    expect(ownerDecisionId).toBeTruthy();

    const approveRes = await timedApiCall(context, "PATCH", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.patch(`/api/owner/startup/sessions/${handoffSessionId}`, { data: { status: "APPROVED" } })
    );
    expect(approveRes.status()).toBe(200);

    const bpRes = await timedApiCall(
      context,
      "POST",
      "/api/owner/startup/sessions/:sessionId/blueprint",
      () =>
        page.request.post(`/api/owner/startup/sessions/${handoffSessionId}/blueprint`, {
          data: {
            ideaId: handoffIdeaId,
            ownerDecisionId,
            objectiveTitle: `Launch ${ACCEPTANCE_TAG}`,
            objectiveDescription: "Live production acceptance execution blueprint",
            targetMetricName: "monthly_revenue_cents",
            targetValue: 500000,
            // Marks every record this blueprint creates (objective, tasks, KPIs, risks,
            // resource allocation, constraint) as a fixture at creation time — see
            // ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md. Requires the acceptance account to hold
            // SYSTEM_ADMIN in the target environment; the route silently ignores this flag
            // otherwise.
            isFixtureRecord: true,
          },
        })
    );
    expect(bpRes.status()).toBe(201);
    expect((await bpRes.json()).executionPlanId).toBeTruthy();
  });

  test("13-04 — Activate button is absent before status reaches EXECUTION_PLANNED (correct-state gating)", async () => {
    await page.goto(`/owner/startup/${handoffSessionId}`, { waitUntil: "networkidle" });
    await page.click("[data-testid='tab-blueprint']");
    await expect(page.locator("[data-testid='blueprint-id']")).toBeVisible();
    await expect(page.locator("[data-testid='activate-business-btn']")).toHaveCount(0);
    await checkpointScreenshot(context, page, SPEC_NAME, "before-execution-planned-no-button");
  });

  test("13-05 — transition to EXECUTION_PLANNED and the Activate button becomes visible", async () => {
    const res = await timedApiCall(context, "PATCH", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.patch(`/api/owner/startup/sessions/${handoffSessionId}`, {
        data: { status: "EXECUTION_PLANNED" },
      })
    );
    expect(res.status()).toBe(200);

    await page.reload({ waitUntil: "networkidle" });
    await page.click("[data-testid='tab-blueprint']");
    await expect(page.locator("[data-testid='activate-business-btn']")).toBeVisible();
    await checkpointScreenshot(context, page, SPEC_NAME, "execution-planned-button-visible");
  });

  test("13-06 — click Activate as Business (real browser click) and land on the resulting OwnerBusiness", async () => {
    await Promise.all([
      page.waitForURL(/\/owner\/home\?businessId=[0-9a-f-]{36}/, { timeout: 20000 }),
      page.click("[data-testid='activate-business-btn']"),
    ]);
    const url = new URL(page.url());
    handoffBusinessId = url.searchParams.get("businessId") ?? "";
    expect(handoffBusinessId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(ACCEPTANCE_TAG);
    await checkpointScreenshot(context, page, SPEC_NAME, "activated-owner-home");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("13-07 — normal Owner Mode domain functionality operates against the new business (Finance opens without error)", async () => {
    await page.goto(`/owner/finance?businessId=${handoffBusinessId}`, { waitUntil: "networkidle" });
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    await checkpointScreenshot(context, page, SPEC_NAME, "finance-domain-opens");
    expect(fatalErrors()).toHaveLength(0);
  });

  test("13-08 — revisiting the session detail page shows the handoff link, not the Activate button (idempotent, no re-trigger surface)", async () => {
    await page.goto(`/owner/startup/${handoffSessionId}`, { waitUntil: "networkidle" });
    await page.click("[data-testid='tab-blueprint']");
    await expect(page.locator("[data-testid='handoff-complete']")).toBeVisible();
    await expect(page.locator("[data-testid='handoff-business-link']")).toHaveAttribute(
      "href",
      `/owner/home?businessId=${handoffBusinessId}`
    );
    await expect(page.locator("[data-testid='activate-business-btn']")).toHaveCount(0);
  });

  test("13-09 — page reload preserves the same business link (persisted, not re-derived per-request)", async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.click("[data-testid='tab-blueprint']");
    await expect(page.locator("[data-testid='handoff-business-link']")).toHaveAttribute(
      "href",
      `/owner/home?businessId=${handoffBusinessId}`
    );
    expect(fatalErrors()).toHaveLength(0);
  });

  test("13-10 — session-level GET confirms exactly one linked business across repeated reads (no duplicate on revisit)", async () => {
    const res1 = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get(`/api/owner/startup/sessions/${handoffSessionId}`)
    );
    const res2 = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get(`/api/owner/startup/sessions/${handoffSessionId}`)
    );
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.session.businessId).toBe(handoffBusinessId);
    expect(body2.session.businessId).toBe(handoffBusinessId);
    expect(body1.session.status).toBe("ACTIVE");
  });

  test("13-11 — no 5xx responses were observed anywhere in this journey", () => {
    expect(networkFailures).toEqual([]);
  });

  test("13-12 — no fatal console errors were observed anywhere in this journey", () => {
    expect(fatalErrors()).toHaveLength(0);
  });

  // ─── Logout / re-login proof (runs last so it doesn't disrupt the journey) ──

  test("AUTH-04 — logout revokes the session; the session-scoped API rejects the old cookie", async () => {
    await logoutProductionOwner(page, context);
    const res = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get(`/api/owner/startup/sessions/${handoffSessionId}`)
    );
    expect([401, 403]).toContain(res.status());
  });

  test("AUTH-05 — re-login succeeds and the acceptance business remains visible", async () => {
    await authenticateProductionOwner(page);
    const res = await timedApiCall(context, "GET", "/api/owner/startup/sessions/:sessionId", () =>
      page.request.get(`/api/owner/startup/sessions/${handoffSessionId}`)
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).session.businessId).toBe(handoffBusinessId);
  });
});
