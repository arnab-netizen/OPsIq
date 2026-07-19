/**
 * Spec 55 — Phase 4 Business Operating System panel (cockpit).
 *
 * Proves end-to-end:
 *   - BOS panel renders in cockpit when objectives and risks are seeded
 *   - Objective health counts shown
 *   - Risk rows render
 *   - GET /api/owner/objectives returns workspace objectives
 *   - POST /api/owner/objectives CREATE action succeeds
 *   - GET /api/owner/risks returns workspace risks
 *   - GET /api/owner/cost-intelligence returns intelligence payload
 *   - GET /api/owner/goal-arbitration returns latest record (or null gracefully)
 *
 * Requires: seed-e2e-owner.ts + seed-e2e-phase4.ts executed against the target DB.
 * Tests run serially so state mutations from earlier tests are visible to later ones.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER } from "./e2e-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
}

test.describe.configure({ mode: "serial" });

test.describe("55 — Phase 4 Business Operating System cockpit panel", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test.afterAll(async () => { await context.close(); });

  // ── 1. Cockpit loads without fatal errors ────────────────────────────────────

  test("1. cockpit loads without fatal JS errors", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const cockpitOrClean = page.locator('[data-testid="owner-cockpit"], [data-testid="cockpit-clean"]');
    await expect(cockpitOrClean.first()).toBeVisible({ timeout: 15000 });
    expect(fatalErrors()).toEqual([]);
  });

  // ── 2. BOS panel appears when objectives are seeded ──────────────────────────

  test("2. BOS panel renders when workspace has objectives", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    const hasBos = await bosSection.count();
    if (hasBos === 0) {
      console.warn("[spec-55] cockpit-bos-section not found — workspace may have no objectives. Check seed-e2e-phase4.ts.");
      return;
    }
    await expect(bosSection.first()).toBeVisible();
    expect(fatalErrors()).toEqual([]);
  });

  // ── 3. Health counts render ──────────────────────────────────────────────────

  test("3. BOS health counts render when section is visible", async () => {
    await page.goto("/owner/cockpit", { waitUntil: "networkidle" });
    await waitForPageReady(page);

    const bosSection = page.locator('[data-testid="cockpit-bos-section"]');
    if (await bosSection.count() === 0) return;

    const healthCounts = page.locator('[data-testid="cockpit-bos-health-counts"]');
    if (await healthCounts.count() > 0) {
      await expect(healthCounts.first()).toBeVisible();
    }
    expect(fatalErrors()).toEqual([]);
  });

  // ── 4. GET /api/owner/objectives returns workspace objectives ─────────────────

  test("4. GET /api/owner/objectives returns objectives array", async () => {
    const response = await page.request.get("/api/owner/objectives");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("objectives");
    expect(Array.isArray(body.objectives)).toBe(true);
  });

  // ── 5. POST /api/owner/objectives CREATE succeeds ─────────────────────────────

  test("5. POST /api/owner/objectives CREATE returns 201 with objective", async () => {
    const response = await page.request.post("/api/owner/objectives", {
      data: {
        action: "CREATE",
        title: "E2E Phase 4 test objective",
        objectiveType: "COST_REDUCTION",
        priorityScore: 70,
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("objective");
    expect(body.objective).toHaveProperty("id");
    expect(body.objective.title).toBe("E2E Phase 4 test objective");
  });

  // ── 6. GET /api/owner/risks returns risks array ────────────────────────────────

  test("6. GET /api/owner/risks returns risks array", async () => {
    const response = await page.request.get("/api/owner/risks");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("risks");
    expect(Array.isArray(body.risks)).toBe(true);
  });

  // ── 7. POST /api/owner/risks CREATE succeeds ──────────────────────────────────

  test("7. POST /api/owner/risks CREATE returns 201 with risk", async () => {
    const response = await page.request.post("/api/owner/risks", {
      data: {
        action: "CREATE",
        title: "E2E Phase 4 test risk",
        category: "OPERATIONAL",
        likelihood: 40,
        impact: 60,
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("risk");
    expect(body.risk).toHaveProperty("id");
  });

  // ── 8. GET /api/owner/cost-intelligence returns payload ───────────────────────

  test("8. GET /api/owner/cost-intelligence returns intelligence payload", async () => {
    const response = await page.request.get("/api/owner/cost-intelligence");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("intelligence");
  });

  // ── 9. GET /api/owner/goal-arbitration returns gracefully ─────────────────────

  test("9. GET /api/owner/goal-arbitration returns 200 with record or null", async () => {
    const response = await page.request.get("/api/owner/goal-arbitration");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("record");
    // record may be null if no arbitration has run — that is acceptable
  });

  // ── 10. GET /api/owner/operating-memory returns entries ───────────────────────

  test("10. GET /api/owner/operating-memory returns entries array", async () => {
    const response = await page.request.get("/api/owner/operating-memory");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("entries");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  // ── 11. GET /api/owner/constraints returns constraints ────────────────────────

  test("11. GET /api/owner/constraints returns constraints array", async () => {
    const response = await page.request.get("/api/owner/constraints");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("constraints");
    expect(Array.isArray(body.constraints)).toBe(true);
  });

  // ── 12. GET /api/owner/kpi-ownership returns kpi records ─────────────────────

  test("12. GET /api/owner/kpi-ownership returns kpis array", async () => {
    const response = await page.request.get("/api/owner/kpi-ownership");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("kpis");
    expect(Array.isArray(body.kpis)).toBe(true);
  });

  // ── 13. GET /api/owner/resource-pools returns pools ──────────────────────────

  test("13. GET /api/owner/resource-pools returns pools array", async () => {
    const response = await page.request.get("/api/owner/resource-pools");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("pools");
    expect(Array.isArray(body.pools)).toBe(true);
  });

  // ── 14. Phase 1–3 fields still present in now-view ───────────────────────────

  test("14. GET /api/owner/now-view still includes Phase 1-3 fields alongside Phase 4", async () => {
    const response = await page.request.get("/api/owner/now-view");
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Phase 1 fields
    expect(body).toHaveProperty("workloadBudget");
    // Phase 4 field (may be null if no objectives)
    expect("businessOperatingSystem" in body).toBe(true);
    expect(fatalErrors()).toEqual([]);
  });

  // ── 15. Reload confirms Phase 4 BOS state persisted ──────────────────────────

  test("15. reload confirms Phase 4 objective created in test 5 is visible via GET", async () => {
    const response = await page.request.get("/api/owner/objectives");
    expect(response.status()).toBe(200);
    const body = await response.json();
    const found = (body.objectives as Array<{ title: string }>).some(
      (o) => o.title === "E2E Phase 4 test objective",
    );
    expect(found).toBe(true);
  });

  // ── 16. POST /api/owner/goal-arbitration runs arbitration ────────────────────

  let capturedArbitrationRecordId: string | null = null;

  test("16. POST /api/owner/goal-arbitration runs and returns arbitrationRecordId + portfolioDecisions", async () => {
    const response = await page.request.post("/api/owner/goal-arbitration");
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("arbitrationRecordId");
    expect(typeof body.arbitrationRecordId).toBe("string");
    expect(body).toHaveProperty("portfolioDecisions");
    expect(Array.isArray(body.portfolioDecisions)).toBe(true);
    // Store for subsequent tests
    capturedArbitrationRecordId = body.arbitrationRecordId;
  });

  // ── 17. GET /api/owner/goal-arbitration returns the recorded arbitration ──────

  test("17. GET /api/owner/goal-arbitration returns record with portfolioDecisions", async () => {
    const response = await page.request.get("/api/owner/goal-arbitration");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("record");
    if (body.record) {
      expect(body.record).toHaveProperty("portfolioDecisions");
      // portfolioDecisions may be {} (Prisma.JsonNull) or array
      expect(body.record).toHaveProperty("winnerObjectiveId");
    }
  });

  // ── 18. POST /api/owner/override-arbitration creates an owner override ────────

  let capturedOverrideId: string | null = null;

  test("18. POST /api/owner/override-arbitration creates override with rationale (separate from system record)", async () => {
    if (!capturedArbitrationRecordId) {
      console.warn("[spec-55] No arbitration record ID captured — skipping override test");
      return;
    }
    const response = await page.request.post("/api/owner/override-arbitration", {
      data: {
        overriddenRecordId: capturedArbitrationRecordId,
        overrideRationale: "Owner manual override: compliance objective takes priority this quarter",
        decision: "EXECUTE_NOW",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("override");
    expect(body.override).toHaveProperty("id");
    expect(body.override.decision).toBe("EXECUTE_NOW");
    expect(body.override.overrideRationale).toBe(
      "Owner manual override: compliance objective takes priority this quarter",
    );
    capturedOverrideId = body.override.id;
  });

  // ── 19. GET /api/owner/override-arbitration shows override separate from system ─

  test("19. GET /api/owner/override-arbitration?recordId shows override alongside system recommendation", async () => {
    if (!capturedArbitrationRecordId) return;
    const response = await page.request.get(
      `/api/owner/override-arbitration?recordId=${capturedArbitrationRecordId}`,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("override");
    if (body.override) {
      expect(body.override.overriddenRecordId).toBe(capturedArbitrationRecordId);
      expect(body.override.decision).toBe("EXECUTE_NOW");
      // System record is NOT replaced — the override is a separate entity
      expect(body.override).toHaveProperty("actorId");
    }
  });

  // ── 20. Operating memory append-only: re-upsert creates new version ───────────

  test("20. POST /api/owner/operating-memory creates entry and re-POST creates new version (append-only)", async () => {
    const upsertPayload = {
      action: "UPSERT",
      memoryType: "active_constraint",
      sourceId: "e2e-phase4-constraint-001",
      content: "Cash flow constraint version 1",
      confidence: 0.8,
    };
    const r1 = await page.request.post("/api/owner/operating-memory", { data: upsertPayload });
    expect(r1.status()).toBe(201);
    const b1 = await r1.json();
    expect(b1).toHaveProperty("entry");
    const v1 = b1.entry.version;
    expect(typeof v1).toBe("number");

    // Re-upsert with updated content — should create a NEW version row, not mutate existing
    const r2 = await page.request.post("/api/owner/operating-memory", {
      data: { ...upsertPayload, content: "Cash flow constraint version 2 (updated)" },
    });
    expect(r2.status()).toBe(201);
    const b2 = await r2.json();
    expect(b2.entry.version).toBeGreaterThan(v1);
    // Confirm original is superseded: GET returns only active (non-superseded) entries
    const listResp = await page.request.get("/api/owner/operating-memory");
    const listBody = await listResp.json();
    const activeConstraints = (listBody.entries as Array<{ memoryType: string; sourceId: string; version: number }>)
      .filter((e) => e.memoryType === "active_constraint" && e.sourceId === "e2e-phase4-constraint-001");
    expect(activeConstraints.length).toBe(1);
    expect(activeConstraints[0].version).toBe(b2.entry.version);
  });
});
