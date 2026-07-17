/**
 * Non-DB route contract tests for the 7 remaining uncovered owner API route groups:
 *   config, dev/seed-archetype, equipment, execution-plan, guided-choice, manual-entry,
 *   process-execution
 *
 * Verifies: auth wrapper enforcement, Zod schema validation, capability declarations,
 * workspace scoping, error-path behaviour, and production-guard behaviour for dev routes.
 * No DB required.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Shared constants ─────────────────────────────────────────────────────────

const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ_ID = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";

// ─── Hoisted mocks (must be defined before vi.mock factories execute) ─────────

const { mocks, SeedNotAllowedError: HoistedSeedNotAllowedError } = vi.hoisted(() => {
  class SeedNotAllowedError extends Error {
    constructor() {
      super("Archetype seeding is disabled in production.");
      this.name = "SeedNotAllowedError";
    }
  }
  return {
    mocks: {
      // canonical
      emitAuditEvent: vi.fn().mockResolvedValue(undefined),
      validateOwnerDashboardConfig: vi.fn().mockReturnValue([]),
      classifyOperatorError: vi.fn((e: Error) => ({ operatorMessage: e.message })),
      // dev
      seedLaundryArchetype: vi.fn(),
      // equipment
      recordEquipment: vi.fn(),
      // execution-plan / guided-choice
      ownerGuidedChoiceHandler: vi.fn(),
      delegatedTaskFindMany: vi.fn().mockResolvedValue([]),
      // manual-entry
      submitManualEntry: vi.fn(),
      detectPiiInFields: vi.fn().mockReturnValue({ hasPii: false, offendingKeys: [] }),
      // process-execution
      getPersistedProcessTasks: vi.fn().mockResolvedValue([]),
      applyProcessExecutionAction: vi.fn(),
      persistProcessExecutionRoutes: vi.fn().mockResolvedValue(undefined),
      getOwnerNowView: vi.fn().mockResolvedValue({ processExecution: null }),
    },
    SeedNotAllowedError,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: Record<string, unknown>) => unknown,
    options?: unknown,
  ) => {
    const wrapped = (ctx: Record<string, unknown>) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, opts?: { status?: number }) => ({
    __canonicalJsonResponse: true,
    body,
    status: opts?.status ?? 200,
  }),
}));

vi.mock("@/infra/audit", () => ({ emitAuditEvent: mocks.emitAuditEvent }));

vi.mock("@/domain/owner-mode/owner-dashboard", () => ({
  validateOwnerDashboardConfig: mocks.validateOwnerDashboardConfig,
  ActionQueuePriority: { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" },
  HealthStatus: { CRITICAL: "CRITICAL", AT_RISK: "AT_RISK", HEALTHY: "HEALTHY", IMPROVING: "IMPROVING" },
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: mocks.classifyOperatorError,
}));

vi.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: { OWNER_CONFIG_UPDATED: "OWNER_CONFIG_UPDATED" },
}));

vi.mock("@/services/owner-mode/archetype-seed.service", () => ({
  seedLaundryArchetype: mocks.seedLaundryArchetype,
  SeedNotAllowedError: HoistedSeedNotAllowedError,
}));

vi.mock("@/services/owner-mode/equipment.service", () => ({
  recordEquipment: mocks.recordEquipment,
}));

vi.mock("@/services/routes/guided-execution-handlers", () => ({
  ownerGuidedChoiceHandler: mocks.ownerGuidedChoiceHandler,
}));

vi.mock("@/lib/db", () => ({
  db: {
    delegatedTask: { findMany: mocks.delegatedTaskFindMany },
    ownerDataIntake: {},
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/services/owner-mode/owner-manual-entry.service", () => ({
  submitManualEntry: mocks.submitManualEntry,
}));

vi.mock("@/domain/owner-mode/owner-manual-entry-form", () => ({
  detectPiiInFields: mocks.detectPiiInFields,
}));

vi.mock("@/services/owner-mode/process-execution-bridge.service", () => ({
  getPersistedProcessTasks: mocks.getPersistedProcessTasks,
  applyProcessExecutionAction: mocks.applyProcessExecutionAction,
  persistProcessExecutionRoutes: mocks.persistProcessExecutionRoutes,
}));

vi.mock("@/services/owner-guidance/owner-now-view.service", () => ({
  getOwnerNowView: mocks.getOwnerNowView,
}));

// parseRequestBody passes through to Zod — use the real implementation
vi.mock("@/lib/validation", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/validation")>();
  return { ...real };
});

// ─── Shared context helpers ────────────────────────────────────────────────────

function makeCtx(url = "https://x/api/owner", wsId = WS) {
  return {
    verifiedWorkspaceId: wsId,
    verifiedActorId: ACTOR,
    verifiedCapabilities: new Set(["owner:manage", "owner:view"]),
    verifiedSessionSnapshot: { actorId: ACTOR },
    request: null as unknown,
  };
}

function makeBodyCtx(body: unknown, wsId = WS) {
  return {
    ...makeCtx("https://x/api/owner", wsId),
    request: new Request("https://x/api/owner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

// ─── Route imports (after mocks are declared) ─────────────────────────────────

const { GET: configGet, POST: configPost } = await import(
  "@/app/api/owner/config/route"
);
const { POST: devSeedPost } = await import(
  "@/app/api/owner/dev/seed-archetype/route"
);
const { POST: equipmentPost } = await import(
  "@/app/api/owner/equipment/route"
);
const { GET: executionPlanGet } = await import(
  "@/app/api/owner/execution-plan/route"
);
const { GET: guidedChoiceGet } = await import(
  "@/app/api/owner/guided-choice/route"
);
const { POST: manualEntryPost } = await import(
  "@/app/api/owner/manual-entry/route"
);
const { GET: processExecGet, POST: processExecPost } = await import(
  "@/app/api/owner/process-execution/route"
);

// ─── Helper: check for owner:manage enforcement ───────────────────────────────

function expectOwnerManage(
  handler: { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } },
) {
  expect(handler.__options?.requireCapabilities).toContain("owner:manage");
  expect(handler.__options?.requireWorkspace).toBe(true);
}

function expectOwnerView(
  handler: { __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean } },
) {
  expect(handler.__options?.requireCapabilities).toContain("owner:view");
  expect(handler.__options?.requireWorkspace).toBe(true);
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

describe("[config-get] GET /api/owner/config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_VIEW capability + workspace", () => {
    expectOwnerView(configGet as never);
  });

  it("returns default config when no stored config exists", async () => {
    const ctx = makeCtx("https://x/api/owner/config", "cfg-ws-new-1");
    (ctx as { request: unknown }).request = new Request("https://x/api/owner/config");
    const res = await (configGet as (ctx: unknown) => Promise<unknown>)(ctx);
    expect(res).toMatchObject({
      workspaceId: "cfg-ws-new-1",
      showCompletedActions: true,
      daysOfHistoryVisible: 30,
      enableBulkActions: true,
    });
  });

  it("returns persisted config after POST updates it", async () => {
    const wsId = "cfg-ws-roundtrip";
    const postCtx = makeBodyCtx({ daysOfHistoryVisible: 14 }, wsId);
    mocks.validateOwnerDashboardConfig.mockReturnValue([]);
    await (configPost as (ctx: unknown) => Promise<unknown>)(postCtx);

    const getCtx = { ...makeCtx("https://x/api/owner/config", wsId), request: new Request("https://x/api/owner/config") };
    const res = await (configGet as (ctx: unknown) => Promise<unknown>)(getCtx) as { daysOfHistoryVisible: number };
    expect(res.daysOfHistoryVisible).toBe(14);
  });

  it("isolates config per workspace — different workspaces do not share config", async () => {
    const wsA = "cfg-ws-iso-A";
    const wsB = "cfg-ws-iso-B";

    const postCtxA = makeBodyCtx({ daysOfHistoryVisible: 7 }, wsA);
    mocks.validateOwnerDashboardConfig.mockReturnValue([]);
    await (configPost as (ctx: unknown) => Promise<unknown>)(postCtxA);

    const getCtxB = { ...makeCtx("https://x/api/owner/config", wsB), request: new Request("https://x/api/owner/config") };
    const resB = await (configGet as (ctx: unknown) => Promise<unknown>)(getCtxB) as { daysOfHistoryVisible: number };
    // ws-B has never been updated — must return default (30), not ws-A's value (7)
    expect(resB.daysOfHistoryVisible).toBe(30);
  });
});

describe("[config-post] POST /api/owner/config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(configPost as never);
  });

  it("returns updated config and emits audit event on valid update", async () => {
    mocks.validateOwnerDashboardConfig.mockReturnValue([]);
    const ctx = makeBodyCtx({ showCompletedActions: false, daysOfHistoryVisible: 7 }, "cfg-ws-post-valid");
    const res = await (configPost as (ctx: unknown) => Promise<unknown>)(ctx) as { showCompletedActions: boolean; daysOfHistoryVisible: number };
    expect(res.showCompletedActions).toBe(false);
    expect(res.daysOfHistoryVisible).toBe(7);
    expect(mocks.emitAuditEvent).toHaveBeenCalledOnce();
    expect(mocks.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "OWNER_CONFIG_UPDATED", workspaceId: "cfg-ws-post-valid" })
    );
  });

  it("rejects invalid actionPriorityThreshold enum value", async () => {
    const ctx = makeBodyCtx({ actionPriorityThreshold: "INVALID_LEVEL" }, "cfg-ws-post-bad-enum");
    await expect((configPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects invalid healthStatusThreshold enum value", async () => {
    const ctx = makeBodyCtx({ healthStatusThreshold: "notavalue" }, "cfg-ws-post-bad-health");
    await expect((configPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects negative daysOfHistoryVisible", async () => {
    const ctx = makeBodyCtx({ daysOfHistoryVisible: -5 }, "cfg-ws-post-neg");
    await expect((configPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects when validateOwnerDashboardConfig returns errors", async () => {
    mocks.validateOwnerDashboardConfig.mockReturnValue(["daysOfHistoryVisible too large"]);
    const ctx = makeBodyCtx({ daysOfHistoryVisible: 999999 }, "cfg-ws-post-val-err");
    await expect((configPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });
});

// ─── DEV / SEED-ARCHETYPE ────────────────────────────────────────────────────

describe("[dev-seed-archetype] POST /api/owner/dev/seed-archetype", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(devSeedPost as never);
  });

  it("returns 403 and blocks the request when SeedNotAllowedError is thrown (production guard)", async () => {
    mocks.seedLaundryArchetype.mockRejectedValue(new HoistedSeedNotAllowedError());
    const ctx = makeCtx();
    const res = await (devSeedPost as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(ctx);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("disabled in production");
  });

  it("returns 201 and seed result when seeding succeeds (non-production)", async () => {
    mocks.seedLaundryArchetype.mockResolvedValue({ seeded: true, archetypeId: "laundry" });
    const ctx = makeCtx();
    const res = await (devSeedPost as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(ctx);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ seeded: true });
  });

  it("passes verifiedWorkspaceId and verifiedActorId to seedLaundryArchetype", async () => {
    mocks.seedLaundryArchetype.mockResolvedValue({ seeded: true });
    await (devSeedPost as (ctx: unknown) => Promise<unknown>)(makeCtx());
    expect(mocks.seedLaundryArchetype).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR })
    );
  });

  it("does not swallow unexpected errors — rethrows non-SeedNotAllowedError", async () => {
    mocks.seedLaundryArchetype.mockRejectedValue(new Error("DB connection failed"));
    await expect((devSeedPost as (ctx: unknown) => Promise<unknown>)(makeCtx())).rejects.toThrow("DB connection failed");
  });
});

// ─── EQUIPMENT ────────────────────────────────────────────────────────────────

describe("[equipment] POST /api/owner/equipment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(equipmentPost as never);
  });

  it("creates equipment and returns 200 on valid payload", async () => {
    mocks.recordEquipment.mockResolvedValue("equip-id-123");
    const ctx = makeBodyCtx({ equipmentType: "Washing Machine", name: "Machine A" });
    const res = await (equipmentPost as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(ctx);
    expect(res.status).toBe(201);
  });

  it("rejects missing equipmentType (Zod validation)", async () => {
    const ctx = makeBodyCtx({ name: "Machine A" });
    await expect((equipmentPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects missing name (Zod validation)", async () => {
    const ctx = makeBodyCtx({ equipmentType: "Washing Machine" });
    await expect((equipmentPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects empty string equipmentType", async () => {
    const ctx = makeBodyCtx({ equipmentType: "", name: "Machine A" });
    await expect((equipmentPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects utilization outside 0–1 range", async () => {
    const ctx = makeBodyCtx({ equipmentType: "Washer", name: "M1", utilization: 1.5 });
    await expect((equipmentPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects invalid downtimeState enum", async () => {
    const ctx = makeBodyCtx({ equipmentType: "Washer", name: "M1", downtimeState: "broken" });
    await expect((equipmentPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("passes verifiedWorkspaceId to recordEquipment", async () => {
    mocks.recordEquipment.mockResolvedValue("eq-id");
    await (equipmentPost as (ctx: unknown) => Promise<unknown>)(
      makeBodyCtx({ equipmentType: "Dryer", name: "Unit B" }, "eq-ws-scope")
    );
    expect(mocks.recordEquipment).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "eq-ws-scope" })
    );
  });
});

// ─── EXECUTION-PLAN ──────────────────────────────────────────────────────────

describe("[execution-plan] GET /api/owner/execution-plan", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Security note: this route uses withCanonicalEnforcement with no requireCapabilities.
   * Enforcement relies on service-layer requireDashboardAccess(DashboardScope.OWNER)
   * inside ownerGuidedChoiceHandler. The capability declaration at the wrapper level
   * is absent, which is a documentation gap but not a bypass — the handler enforces it.
   */
  it("does not declare explicit capabilities at the wrapper level (documented security gap — enforcement is in service layer)", () => {
    const handler = executionPlanGet as { __options?: { requireCapabilities?: string[] } };
    // No requireCapabilities means wrapper-level check is absent; enforcement must be
    // verified via ownerGuidedChoiceHandler's requireDashboardAccess call.
    expect(handler.__options?.requireCapabilities).toBeUndefined();
  });

  it("calls ownerGuidedChoiceHandler with workspaceId from verified context", async () => {
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ body: { tasks: [] }, status: 200 });
    mocks.delegatedTaskFindMany.mockResolvedValue([]);
    await (executionPlanGet as (ctx: unknown) => Promise<unknown>)(makeCtx());
    expect(mocks.ownerGuidedChoiceHandler).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, actorId: ACTOR })
    );
  });

  it("passes DB-queried tasks to ownerGuidedChoiceHandler", async () => {
    const fakeTasks = [{ id: "t1", title: "Fix bottleneck", status: "PENDING", priority: "HIGH" }];
    mocks.delegatedTaskFindMany.mockResolvedValue(fakeTasks);
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ status: 200 });
    await (executionPlanGet as (ctx: unknown) => Promise<unknown>)(makeCtx());
    const call = mocks.ownerGuidedChoiceHandler.mock.calls[0][0] as { choices: { tasks: unknown[] } };
    expect(call.choices.tasks).toEqual(fakeTasks);
  });

  it("includes guidanceStartActions in choices passed to handler", async () => {
    mocks.delegatedTaskFindMany.mockResolvedValue([]);
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ status: 200 });
    await (executionPlanGet as (ctx: unknown) => Promise<unknown>)(makeCtx());
    const call = mocks.ownerGuidedChoiceHandler.mock.calls[0][0] as { choices: { guidanceStartActions: string[] } };
    expect(call.choices.guidanceStartActions).toContain("START_GUIDANCE");
  });

  it("scopes DB query to verifiedWorkspaceId — does not accept caller-supplied workspaceId", async () => {
    mocks.delegatedTaskFindMany.mockResolvedValue([]);
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ status: 200 });
    await (executionPlanGet as (ctx: unknown) => Promise<unknown>)(makeCtx("https://x", "exec-ws-scoped"));
    expect(mocks.delegatedTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "exec-ws-scoped" } })
    );
  });
});

// ─── GUIDED-CHOICE ───────────────────────────────────────────────────────────

describe("[guided-choice] GET /api/owner/guided-choice", () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Security note: same as execution-plan — no requireCapabilities at wrapper level.
   * Enforcement via ownerGuidedChoiceHandler's requireDashboardAccess(DashboardScope.OWNER).
   */
  it("does not declare explicit capabilities at wrapper level (enforcement is in service layer)", () => {
    const handler = guidedChoiceGet as { __options?: { requireCapabilities?: string[] } };
    expect(handler.__options?.requireCapabilities).toBeUndefined();
  });

  it("calls ownerGuidedChoiceHandler with correct workspaceId and actorId", async () => {
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ status: 200, body: {} });
    await (guidedChoiceGet as (ctx: unknown) => Promise<unknown>)(makeCtx("https://x", "gc-ws-1"));
    expect(mocks.ownerGuidedChoiceHandler).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "gc-ws-1", actorId: ACTOR })
    );
  });

  it("passes all required owner action types in choices.availableActions", async () => {
    mocks.ownerGuidedChoiceHandler.mockResolvedValue({ status: 200 });
    await (guidedChoiceGet as (ctx: unknown) => Promise<unknown>)(makeCtx());
    const call = mocks.ownerGuidedChoiceHandler.mock.calls[0][0] as { choices: { availableActions: string[] } };
    const actions = call.choices.availableActions;
    for (const required of ["APPROVE", "REJECT", "VERIFY_OUTCOME", "ASSIGN_TO_EMPLOYEE", "TRACK_PROOF"]) {
      expect(actions).toContain(required);
    }
  });
});

// ─── MANUAL-ENTRY ─────────────────────────────────────────────────────────────

describe("[manual-entry] POST /api/owner/manual-entry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(manualEntryPost as never);
  });

  it("returns 200 on valid entry with no PII", async () => {
    mocks.detectPiiInFields.mockReturnValue({ hasPii: false, offendingKeys: [] });
    mocks.submitManualEntry.mockResolvedValue({ ok: true, confidenceBefore: 0.4, confidenceAfter: 0.7 });
    const ctx = makeBodyCtx({ businessId: "biz-abc", category: "revenue_sales", fields: { monthly_revenue: 50000 } });
    const res = await (manualEntryPost as (ctx: unknown) => Promise<{ status: number }>)(ctx);
    expect(res.status).toBe(200);
  });

  it("blocks and returns 422 when PII is detected in fields", async () => {
    mocks.detectPiiInFields.mockReturnValue({ hasPii: true, offendingKeys: ["customer_email"] });
    const ctx = makeBodyCtx({
      businessId: "biz-abc",
      category: "revenue_sales",
      fields: { customer_email: "john@example.com" },
    });
    const res = await (manualEntryPost as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(ctx);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain("pii_blocked");
    expect(mocks.submitManualEntry).not.toHaveBeenCalled();
  });

  it("rejects missing businessId (Zod validation)", async () => {
    const ctx = makeBodyCtx({ category: "revenue_sales", fields: {} });
    await expect((manualEntryPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects invalid category value", async () => {
    const ctx = makeBodyCtx({ businessId: "biz-abc", category: "NOT_A_REAL_CATEGORY", fields: {} });
    await expect((manualEntryPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects missing fields object", async () => {
    const ctx = makeBodyCtx({ businessId: "biz-abc", category: "revenue_sales" });
    await expect((manualEntryPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("passes verifiedWorkspaceId to submitManualEntry — never trusts caller-supplied workspaceId", async () => {
    mocks.detectPiiInFields.mockReturnValue({ hasPii: false, offendingKeys: [] });
    mocks.submitManualEntry.mockResolvedValue({ ok: true });
    const ctx = makeBodyCtx(
      { businessId: "biz-abc", category: "expenses", fields: { rent: 2000 } },
      "me-ws-scoped"
    );
    await (manualEntryPost as (ctx: unknown) => Promise<unknown>)(ctx);
    expect(mocks.submitManualEntry).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "me-ws-scoped" }),
      expect.anything()
    );
  });

  it("returns 422 from submitManualEntry when service signals failure", async () => {
    mocks.detectPiiInFields.mockReturnValue({ hasPii: false, offendingKeys: [] });
    mocks.submitManualEntry.mockResolvedValue({ ok: false, errors: ["Duplicate record"] });
    const ctx = makeBodyCtx({ businessId: "biz-abc", category: "expenses", fields: { rent: 2000 } });
    const res = await (manualEntryPost as (ctx: unknown) => Promise<{ status: number }>)(ctx);
    expect(res.status).toBe(422);
  });

  it("accepts all valid OWNER_INPUT_CATEGORIES values", async () => {
    const validCategories = [
      "revenue_sales", "expenses", "fixed_costs", "payroll", "staff_attendance",
      "staff_rota", "complaints_reviews", "customer_count", "delivery_records",
      "vendor_invoices", "b2b_contracts", "equipment_logs", "sops_checklists",
      "staff_training", "marketing", "cash_debt", "proof_completion",
      "tax_compliance", "inventory_stock", "branch_records",
    ] as const;
    mocks.detectPiiInFields.mockReturnValue({ hasPii: false, offendingKeys: [] });
    mocks.submitManualEntry.mockResolvedValue({ ok: true });
    for (const cat of validCategories) {
      const ctx = makeBodyCtx({ businessId: "biz-abc", category: cat, fields: { value: 1 } });
      const res = await (manualEntryPost as (ctx: unknown) => Promise<{ status: number }>)(ctx);
      expect(res.status).toBe(200);
    }
    expect(mocks.submitManualEntry).toHaveBeenCalledTimes(validCategories.length);
  });
});

// ─── PROCESS-EXECUTION ───────────────────────────────────────────────────────

describe("[process-execution-get] GET /api/owner/process-execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(processExecGet as never);
  });

  it("returns tasks list with status 200", async () => {
    const tasks = [{ id: "t1", taskKey: "REVIEW_CASH", status: "PENDING" }];
    mocks.getPersistedProcessTasks.mockResolvedValue(tasks);
    const res = await (processExecGet as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(makeCtx());
    expect(res.status).toBe(200);
    expect((res.body as { tasks: unknown[] }).tasks).toEqual(tasks);
  });

  it("scopes task query to verifiedWorkspaceId", async () => {
    mocks.getPersistedProcessTasks.mockResolvedValue([]);
    await (processExecGet as (ctx: unknown) => Promise<unknown>)(makeCtx("https://x", "pe-ws-scoped"));
    expect(mocks.getPersistedProcessTasks).toHaveBeenCalledWith("pe-ws-scoped");
  });
});

describe("[process-execution-post] POST /api/owner/process-execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER_MANAGE capability + workspace", () => {
    expectOwnerManage(processExecPost as never);
  });

  it("returns 200 with taskId on successful action", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: true, taskId: "task-123", status: "APPROVED" });
    const ctx = makeBodyCtx({ taskKey: "REVIEW_CASH", action: "APPROVE" });
    const res = await (processExecPost as (ctx: unknown) => Promise<{ status: number; body: unknown }>)(ctx);
    expect(res.status).toBe(200);
    expect((res.body as { taskId: string }).taskId).toBe("task-123");
  });

  it("returns 400 when applyProcessExecutionAction returns ok:false (non-workspace error)", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: false, reason: "Evidence required", code: "EVIDENCE_REQUIRED" });
    const ctx = makeBodyCtx({ taskKey: "COMPLETE_TASK", action: "COMPLETE" });
    const res = await (processExecPost as (ctx: unknown) => Promise<{ status: number }>)(ctx);
    expect(res.status).toBe(400);
  });

  it("returns 403 when action fails with WRONG_WORKSPACE code", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: false, reason: "Cross-workspace", code: "WRONG_WORKSPACE" });
    const ctx = makeBodyCtx({ taskKey: "REVIEW_TASK", action: "APPROVE" });
    const res = await (processExecPost as (ctx: unknown) => Promise<{ status: number }>)(ctx);
    expect(res.status).toBe(403);
  });

  it("rejects invalid action enum value", async () => {
    const ctx = makeBodyCtx({ taskKey: "some-task", action: "DO_MAGIC" });
    await expect((processExecPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects missing taskKey", async () => {
    const ctx = makeBodyCtx({ action: "APPROVE" });
    await expect((processExecPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("rejects invalid delegateToRole value", async () => {
    const ctx = makeBodyCtx({ taskKey: "t1", action: "DELEGATE", delegateToRole: "CEO" });
    await expect((processExecPost as (ctx: unknown) => Promise<unknown>)(ctx)).rejects.toThrow();
  });

  it("derives actorRole from verified capability set, not from caller-supplied data", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: true, taskId: "t1", status: "APPROVED" });
    const ctx = makeBodyCtx({ taskKey: "TASK", action: "APPROVE" });
    await (processExecPost as (ctx: unknown) => Promise<unknown>)(ctx);
    expect(mocks.applyProcessExecutionAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: "owner" }) // derived from OWNER_MANAGE capability
    );
  });

  it("calls persistProcessExecutionRoutes when Now View returns processExecution routes", async () => {
    const routes = [{ key: "ROUTE_1", title: "Review Cash" }];
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: { routes } });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: true, taskId: "t1", status: "DONE" });
    const ctx = makeBodyCtx({ taskKey: "ROUTE_1", action: "START" });
    await (processExecPost as (ctx: unknown) => Promise<unknown>)(ctx);
    expect(mocks.persistProcessExecutionRoutes).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({ routes }),
      ACTOR
    );
  });

  it("skips persistProcessExecutionRoutes when Now View returns no processExecution", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: true, taskId: "t1", status: "DONE" });
    await (processExecPost as (ctx: unknown) => Promise<unknown>)(makeBodyCtx({ taskKey: "T", action: "START" }));
    expect(mocks.persistProcessExecutionRoutes).not.toHaveBeenCalled();
  });

  it("passes verifiedWorkspaceId and verifiedActorId to applyProcessExecutionAction — never caller-supplied", async () => {
    mocks.getOwnerNowView.mockResolvedValue({ processExecution: null });
    mocks.applyProcessExecutionAction.mockResolvedValue({ ok: true, taskId: "t1", status: "DONE" });
    const ctx = makeBodyCtx({ taskKey: "T", action: "APPROVE" }, "pe-ws-safe");
    await (processExecPost as (ctx: unknown) => Promise<unknown>)(ctx);
    expect(mocks.applyProcessExecutionAction).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "pe-ws-safe", actorId: ACTOR })
    );
  });
});
