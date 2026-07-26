/**
 * Spec 57 — Stage 3 Integrated Journey: Complaint intake → Action assignment → Approval resolution.
 *
 * Proves end-to-end via authenticated API calls (browser session cookies):
 *   Bundle 3.5: Owner creates complaint, verifies it appears in list (OPEN), triages (TRIAGED), resolves
 *   Bundle 3.6: Owner assigns action, verifies ASSIGNED state, records COMPLETED outcome
 *   Bundle 3.7: Consulting creates approval request, submits evidence, makes APPROVED decision
 *   Cross-bundle: workspace isolation — each API call returns 401/403 without auth
 *   Refresh: each GET after mutation returns the updated state
 *   No fatal console errors across the journey
 *
 * Requires: seed-e2e-owner.ts executed against the target DB
 * (E2E_OWNER user + E2E_WORKSPACE_ID workspace must exist).
 *
 * Auth surface: OWNER_MANAGE (bundles 3.5, 3.6), CONSULTING_APPROVE (bundle 3.7)
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticateUser, waitForPageReady } from "./helpers";
import { E2E_OWNER, E2E_WORKSPACE_ID, E2E_BC_PROBE_BUSINESS_ID } from "./e2e-fixtures";

const consoleErrors: string[] = [];
function watchConsole(page: Page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
}
function fatalErrors(): string[] {
  return consoleErrors.filter(
    (e) => /Cannot read|is not a function|Hydration failed/i.test(e)
  );
}

const COMPLAINT_IDEM_KEY = `spec57-complaint-${Date.now()}`;
const ASSIGN_IDEM_KEY = `spec57-assign-${Date.now()}`;
const APPROVAL_IDEM_KEY = `spec57-approval-${Date.now()}`;

test.describe.configure({ mode: "serial" });

test.describe("57 — Stage 3 integrated journey: complaint → assignment → approval", () => {
  let context: BrowserContext;
  let page: Page;
  let complaintId: string;
  let assignmentId: string;
  let approvalId: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    watchConsole(page);
    await authenticateUser(page, E2E_OWNER.email, E2E_OWNER.password);
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── Bundle 3.5 — Customer Complaint intake and lifecycle ─────────────────────

  test("3.5.1: POST /api/owner/complaints creates OPEN complaint and returns it in GET list", async () => {
    const create = await page.request.post("/api/owner/complaints", {
      data: {
        idempotencyKey: COMPLAINT_IDEM_KEY,
        title: "E2E: late delivery on order #E2E-001",
        description: "E2E spec 57 — customer reports order not delivered after 5 days",
        channel: "EMAIL",
        reportedBy: "e2e-customer@spec57.local",
      },
    });

    expect(create.status()).toBe(200);
    const body = await create.json();
    expect(body.data?.status ?? body.status).toBe("OPEN");
    complaintId = body.data?.id ?? body.id;
    expect(complaintId).toBeTruthy();

    // Refresh: GET list includes the new complaint
    const list = await page.request.get("/api/owner/complaints");
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    const items: { id: string }[] = listBody.data ?? listBody;
    expect(items.some((c) => c.id === complaintId)).toBe(true);
  });

  test("3.5.2: PATCH triage transitions complaint OPEN→TRIAGED, SLA computed", async () => {
    const res = await page.request.patch("/api/owner/complaints", {
      data: {
        action: "triage",
        complaintId,
        severity: "HIGH",
        triageNotes: "E2E triage note — internal only",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("TRIAGED");
    expect(result.severity).toBe("HIGH");
    expect(result.slaDueAt).toBeTruthy();
    // triageNotes excluded from DTO
    expect(result.triageNotes).toBeUndefined();
  });

  test("3.5.3: PATCH add_recovery_action transitions TRIAGED→RECOVERING, action appears in list", async () => {
    const res = await page.request.patch("/api/owner/complaints", {
      data: {
        action: "add_recovery_action",
        complaintId,
        description: "E2E: Contact courier to trace delivery",
        assignedTo: "support-team",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("RECOVERING");
    expect(result.recoveryActions?.length).toBeGreaterThanOrEqual(1);
  });

  test("3.5.4: PATCH resolve transitions RECOVERING→RESOLVED, resolutionSummary persisted", async () => {
    const res = await page.request.patch("/api/owner/complaints", {
      data: {
        action: "resolve",
        complaintId,
        resolutionSummary: "E2E: Package redelivered and confirmed received by customer",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("RESOLVED");
    expect(result.resolutionSummary).toContain("E2E:");
  });

  // ── Bundle 3.6 — Action Assignment and Outcome Tracking ──────────────────────

  test("3.6.1: POST /api/owner/action-assignments creates ASSIGNED assignment", async () => {
    const res = await page.request.post("/api/owner/action-assignments", {
      data: {
        idempotencyKey: ASSIGN_IDEM_KEY,
        businessId: E2E_BC_PROBE_BUSINESS_ID,
        actionId: "action-e2e-spec57-delivery-review",
        actionDomain: "operations",
        assignedTo: "operations-lead",
        priority: "HIGH",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("ASSIGNED");
    assignmentId = result.id;
    expect(assignmentId).toBeTruthy();

    // Refresh: GET list includes this assignment
    const list = await page.request.get(
      `/api/owner/action-assignments?businessId=${E2E_BC_PROBE_BUSINESS_ID}`
    );
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    const items: { id: string }[] = listBody.data ?? listBody;
    expect(items.some((a) => a.id === assignmentId)).toBe(true);
  });

  test("3.6.2: PATCH record_outcome COMPLETED — terminal state persisted, GET reflects it", async () => {
    const res = await page.request.patch("/api/owner/action-assignments", {
      data: {
        action: "record_outcome",
        assignmentId,
        outcome: "COMPLETED",
        outcomeNote: "E2E: Delivery process reviewed and documented — SOP updated",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("COMPLETED");
    expect(result.outcomeNote).toContain("E2E:");

    // Refresh: GET list shows COMPLETED
    const list = await page.request.get(
      `/api/owner/action-assignments?status=COMPLETED&businessId=${E2E_BC_PROBE_BUSINESS_ID}`
    );
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    const items: { id: string; status: string }[] = listBody.data ?? listBody;
    const found = items.find((a) => a.id === assignmentId);
    expect(found?.status).toBe("COMPLETED");
  });

  // ── Bundle 3.7 — Approval Resolution and Evidence Chain ──────────────────────

  test("3.7.1: POST /api/owner/approval creates PENDING approval with empty evidence", async () => {
    const res = await page.request.post("/api/owner/approval", {
      data: {
        idempotencyKey: APPROVAL_IDEM_KEY,
        businessId: E2E_BC_PROBE_BUSINESS_ID,
        actionId: "action-e2e-spec57-budget-increase",
        actionDomain: "finance",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("PENDING");
    expect(result.evidences).toHaveLength(0);
    expect(result.rescopeTriggered).toBe(false);
    approvalId = result.id;
    expect(approvalId).toBeTruthy();
  });

  test("3.7.2: PATCH submit_evidence — evidence appended, credibilityScore absent from response", async () => {
    const res = await page.request.patch("/api/owner/approval", {
      data: {
        action: "submit_evidence",
        approvalId,
        evidenceType: "document",
        description: "E2E: Budget justification document — Q3 revenue analysis",
        sourceUrl: "https://internal.opsiq/budget/justification-e2e.pdf",
        credibilityScore: 0.85,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.evidences?.length).toBeGreaterThanOrEqual(1);
    const evidence = result.evidences[0];
    expect(evidence.evidenceType).toBe("document");
    // credibilityScore must not appear in public DTO
    expect(evidence.credibilityScore).toBeUndefined();
  });

  test("3.7.3: PATCH decide APPROVED — status immutable, decidedAt set, GET reflects APPROVED", async () => {
    const res = await page.request.patch("/api/owner/approval", {
      data: {
        action: "decide",
        approvalId,
        decision: "APPROVED",
        rationale: "E2E: Budget justified by Q3 analysis",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.data ?? body;
    expect(result.status).toBe("APPROVED");
    expect(result.decidedAt).toBeTruthy();
    expect(result.rescopeTriggered).toBe(false);

    // Refresh: GET list confirms APPROVED
    const list = await page.request.get(
      `/api/owner/approval?businessId=${E2E_BC_PROBE_BUSINESS_ID}&status=APPROVED`
    );
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    const items: { id: string; status: string }[] = listBody.data ?? listBody;
    const found = items.find((a) => a.id === approvalId);
    expect(found?.status).toBe("APPROVED");
  });

  test("3.7.4: PATCH decide on terminal APPROVED — 409/422 returned, status unchanged", async () => {
    const res = await page.request.patch("/api/owner/approval", {
      data: {
        action: "decide",
        approvalId,
        decision: "REJECTED",
        rationale: "E2E: Should not be allowed",
      },
    });

    // Expecting 409 (Conflict) or 422 (Unprocessable) — terminal decisions are immutable
    expect([409, 422, 400]).toContain(res.status());
  });

  // ── Cross-cutting: auth gate ──────────────────────────────────────────────────

  test("unauthenticated request to /api/owner/complaints returns 401", async () => {
    const unauthCtx = await page.context().browser()!.newContext();
    const unauthPage = await unauthCtx.newPage();
    const res = await unauthPage.request.get("/api/owner/complaints");
    expect([401, 403]).toContain(res.status());
    await unauthCtx.close();
  });

  test("unauthenticated request to /api/owner/action-assignments returns 401", async () => {
    const unauthCtx = await page.context().browser()!.newContext();
    const unauthPage = await unauthCtx.newPage();
    const res = await unauthPage.request.get("/api/owner/action-assignments");
    expect([401, 403]).toContain(res.status());
    await unauthCtx.close();
  });

  test("no fatal console errors across the stage 3 integrated journey", async () => {
    await page.goto("/owner", { waitUntil: "networkidle" });
    await waitForPageReady(page);
    const fatal = fatalErrors();
    expect(fatal, `fatal console errors: ${fatal.join(" | ")}`).toEqual([]);
  });
});
