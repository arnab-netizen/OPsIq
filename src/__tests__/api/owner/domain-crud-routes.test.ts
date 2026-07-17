/**
 * Domain CRUD route contracts — cashflow, finance, marketing, sales, sop, strategy, recovery
 *
 * Covers the shared route pattern across 7 domain modules:
 *   GET  /domain/dashboard                            OWNER_VIEW
 *   GET  /domain/businesses/[id]/snapshots            OWNER_VIEW
 *   POST /domain/businesses/[id]/snapshots            OWNER_MANAGE
 *   POST /domain/businesses/[id]/diagnoses            OWNER_MANAGE
 *   GET  /domain/snapshots/[snapshotId]               OWNER_VIEW
 *   GET  /domain/diagnoses/[cycleId]                  OWNER_VIEW
 *   GET  /domain/diagnoses/[cycleId]/findings         OWNER_VIEW
 *   GET  /domain/diagnoses/[cycleId]/actions          OWNER_VIEW
 *   GET  /domain/actions/[actionId]                   OWNER_VIEW
 *   PATCH/domain/actions/[actionId]                   OWNER_MANAGE
 *   POST /domain/actions/[actionId]/verify            OWNER_MANAGE
 *
 * Recovery additionally:
 *   GET  /recovery/businesses                         OWNER_VIEW
 *   POST /recovery/businesses                         OWNER_MANAGE
 *   GET  /recovery/businesses/[id]                    OWNER_VIEW
 *   PATCH/recovery/businesses/[id]                    OWNER_MANAGE
 *   GET  /recovery/businesses/[id]/cycles             OWNER_VIEW
 *   POST /recovery/businesses/[id]/cycles             OWNER_MANAGE
 *   GET  /recovery/cycles/[cycleId]                   OWNER_VIEW
 *
 * Auth enforcement tested: OWNER_VIEW, OWNER_MANAGE capability checks.
 * UUID validation: invalid path params → 422.
 * Body validation: missing required fields → 422.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Shared UUIDs
// ---------------------------------------------------------------------------
const WS = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const ACTOR = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const BIZ_ID = "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7";
const SNAP_ID = "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7";
const CYCLE_ID = "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8";
const ACTION_ID = "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9";
const INVALID_ID = "not-a-uuid";

// ---------------------------------------------------------------------------
// withCanonicalEnforcement mock
// ---------------------------------------------------------------------------
vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: Record<string, unknown>, params?: Record<string, string>) => unknown,
    options: { requireCapabilities?: string[]; requireWorkspace?: boolean }
  ) => {
    const wrapped = (ctx: Record<string, unknown>, params?: Record<string, string>) =>
      handler(ctx, params);
    wrapped.__options = options;
    return wrapped;
  },
}));

vi.mock("@/lib/canonical-json-response", () => ({
  canonicalJson: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
}));

// ---------------------------------------------------------------------------
// Service mocks (per domain) — use string literals, not constants (mocks are hoisted)
// ---------------------------------------------------------------------------
vi.mock("@/services/owner-cashflow/dashboard.service", () => ({
  getCashflowDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-cashflow/snapshot.service", () => ({
  listCashflowSnapshots: vi.fn().mockResolvedValue([]),
  createCashflowSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getCashflowSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-cashflow/diagnosis.service", () => ({
  runCashflowDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getCashflowDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listCashflowCycleFindings: vi.fn().mockResolvedValue([]),
  listCashflowCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-cashflow/action.service", () => ({
  getCashflowAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateCashflowAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-cashflow/verification.service", () => ({
  recordCashflowVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/owner-finance/dashboard.service", () => ({
  getFinanceDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-finance/snapshot.service", () => ({
  listFinancialSnapshots: vi.fn().mockResolvedValue([]),
  createFinancialSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getFinancialSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-finance/diagnosis.service", () => ({
  runFinanceDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getFinanceDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listFinanceCycleFindings: vi.fn().mockResolvedValue([]),
  listFinanceCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-finance/action.service", () => ({
  getFinanceAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateFinanceAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-finance/verification.service", () => ({
  recordFinanceVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/owner-marketing/dashboard.service", () => ({
  getMarketingDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-marketing/snapshot.service", () => ({
  listMarketingSnapshots: vi.fn().mockResolvedValue([]),
  createMarketingSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getMarketingSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-marketing/diagnosis.service", () => ({
  runMarketingDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getMarketingDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listMarketingCycleFindings: vi.fn().mockResolvedValue([]),
  listMarketingCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-marketing/action.service", () => ({
  getMarketingAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateMarketingAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-marketing/verification.service", () => ({
  recordMarketingVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/owner-sales/dashboard.service", () => ({
  getSalesDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-sales/snapshot.service", () => ({
  listSalesSnapshots: vi.fn().mockResolvedValue([]),
  createSalesSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getSalesSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-sales/diagnosis.service", () => ({
  runSalesDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getSalesDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listSalesCycleFindings: vi.fn().mockResolvedValue([]),
  listSalesCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-sales/action.service", () => ({
  getSalesAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateSalesAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-sales/verification.service", () => ({
  recordSalesVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/owner-sop/dashboard.service", () => ({
  getSopDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-sop/snapshot.service", () => ({
  listSopSnapshots: vi.fn().mockResolvedValue([]),
  createSopSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getSopSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-sop/diagnosis.service", () => ({
  runSopDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getSopDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listSopCycleFindings: vi.fn().mockResolvedValue([]),
  listSopCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-sop/action.service", () => ({
  getSopAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateSopAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-sop/verification.service", () => ({
  recordSopVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/owner-strategy/dashboard.service", () => ({
  getStrategyDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/owner-strategy/snapshot.service", () => ({
  listStrategySnapshots: vi.fn().mockResolvedValue([]),
  createStrategySnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
  getStrategySnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/owner-strategy/diagnosis.service", () => ({
  runStrategyDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getStrategyDiagnosis: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  listStrategyCycleFindings: vi.fn().mockResolvedValue([]),
  listStrategyCycleActions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/owner-strategy/action.service", () => ({
  getStrategyAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateStrategyAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/owner-strategy/verification.service", () => ({
  recordStrategyVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

vi.mock("@/services/founder-recovery/dashboard.service", () => ({
  getRecoveryDashboard: vi.fn().mockResolvedValue({ dashboard: true }),
}));
vi.mock("@/services/founder-recovery/business.service", () => ({
  listBusinesses: vi.fn().mockResolvedValue([]),
  createBusiness: vi.fn().mockResolvedValue({ id: "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7" }),
  getBusiness: vi.fn().mockResolvedValue({ id: "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7" }),
  updateBusiness: vi.fn().mockResolvedValue({ id: "c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7" }),
}));
vi.mock("@/services/founder-recovery/snapshot.service", () => ({
  listSnapshots: vi.fn().mockResolvedValue([]),
  createSnapshot: vi.fn().mockResolvedValue({ id: "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7" }),
}));
vi.mock("@/services/founder-recovery/cycle.service", () => ({
  listCycles: vi.fn().mockResolvedValue([]),
  runCycle: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
  getCycle: vi.fn().mockResolvedValue({ id: "e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8" }),
}));
vi.mock("@/services/founder-recovery/action.service", () => ({
  getRecoveryAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
  updateRecoveryAction: vi.fn().mockResolvedValue({ id: "f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9" }),
}));
vi.mock("@/services/founder-recovery/verification.service", () => ({
  recordVerification: vi.fn().mockResolvedValue({ id: "v1" }),
}));

// ---------------------------------------------------------------------------
// Route imports
// ---------------------------------------------------------------------------
import { GET as cashflowDashboardGet } from "@/app/api/owner/cashflow/dashboard/route";
import {
  GET as cashflowBizSnapshotsGet,
  POST as cashflowBizSnapshotsPost,
} from "@/app/api/owner/cashflow/businesses/[businessId]/snapshots/route";
import { POST as cashflowBizDiagnosesPost } from "@/app/api/owner/cashflow/businesses/[businessId]/diagnoses/route";
import { GET as cashflowSnapshotGet } from "@/app/api/owner/cashflow/snapshots/[snapshotId]/route";
import { GET as cashflowDiagGet } from "@/app/api/owner/cashflow/diagnoses/[cycleId]/route";
import { GET as cashflowDiagFindingsGet } from "@/app/api/owner/cashflow/diagnoses/[cycleId]/findings/route";
import { GET as cashflowDiagActionsGet } from "@/app/api/owner/cashflow/diagnoses/[cycleId]/actions/route";
import {
  GET as cashflowActionGet,
  PATCH as cashflowActionPatch,
} from "@/app/api/owner/cashflow/actions/[actionId]/route";
import { POST as cashflowVerifyPost } from "@/app/api/owner/cashflow/actions/[actionId]/verify/route";

import { GET as financeDashboardGet } from "@/app/api/owner/finance/dashboard/route";
import {
  GET as financeBizSnapshotsGet,
  POST as financeBizSnapshotsPost,
} from "@/app/api/owner/finance/businesses/[businessId]/snapshots/route";
import { POST as financeBizDiagnosesPost } from "@/app/api/owner/finance/businesses/[businessId]/diagnoses/route";
import { GET as financeSnapshotGet } from "@/app/api/owner/finance/snapshots/[snapshotId]/route";
import { GET as financeDiagGet } from "@/app/api/owner/finance/diagnoses/[cycleId]/route";
import { GET as financeDiagFindingsGet } from "@/app/api/owner/finance/diagnoses/[cycleId]/findings/route";
import { GET as financeDiagActionsGet } from "@/app/api/owner/finance/diagnoses/[cycleId]/actions/route";
import {
  GET as financeActionGet,
  PATCH as financeActionPatch,
} from "@/app/api/owner/finance/actions/[actionId]/route";
import { POST as financeVerifyPost } from "@/app/api/owner/finance/actions/[actionId]/verify/route";

import { GET as marketingDashboardGet } from "@/app/api/owner/marketing/dashboard/route";
import {
  GET as marketingBizSnapshotsGet,
  POST as marketingBizSnapshotsPost,
} from "@/app/api/owner/marketing/businesses/[businessId]/snapshots/route";
import { POST as marketingBizDiagnosesPost } from "@/app/api/owner/marketing/businesses/[businessId]/diagnoses/route";
import { GET as marketingSnapshotGet } from "@/app/api/owner/marketing/snapshots/[snapshotId]/route";
import { GET as marketingDiagGet } from "@/app/api/owner/marketing/diagnoses/[cycleId]/route";
import { GET as marketingDiagFindingsGet } from "@/app/api/owner/marketing/diagnoses/[cycleId]/findings/route";
import { GET as marketingDiagActionsGet } from "@/app/api/owner/marketing/diagnoses/[cycleId]/actions/route";
import {
  GET as marketingActionGet,
  PATCH as marketingActionPatch,
} from "@/app/api/owner/marketing/actions/[actionId]/route";
import { POST as marketingVerifyPost } from "@/app/api/owner/marketing/actions/[actionId]/verify/route";

import { GET as salesDashboardGet } from "@/app/api/owner/sales/dashboard/route";
import {
  GET as salesBizSnapshotsGet,
  POST as salesBizSnapshotsPost,
} from "@/app/api/owner/sales/businesses/[businessId]/snapshots/route";
import { POST as salesBizDiagnosesPost } from "@/app/api/owner/sales/businesses/[businessId]/diagnoses/route";
import { GET as salesSnapshotGet } from "@/app/api/owner/sales/snapshots/[snapshotId]/route";
import { GET as salesDiagGet } from "@/app/api/owner/sales/diagnoses/[cycleId]/route";
import { GET as salesDiagFindingsGet } from "@/app/api/owner/sales/diagnoses/[cycleId]/findings/route";
import { GET as salesDiagActionsGet } from "@/app/api/owner/sales/diagnoses/[cycleId]/actions/route";
import {
  GET as salesActionGet,
  PATCH as salesActionPatch,
} from "@/app/api/owner/sales/actions/[actionId]/route";
import { POST as salesVerifyPost } from "@/app/api/owner/sales/actions/[actionId]/verify/route";

import { GET as sopDashboardGet } from "@/app/api/owner/sop/dashboard/route";
import {
  GET as sopBizSnapshotsGet,
  POST as sopBizSnapshotsPost,
} from "@/app/api/owner/sop/businesses/[businessId]/snapshots/route";
import { POST as sopBizDiagnosesPost } from "@/app/api/owner/sop/businesses/[businessId]/diagnoses/route";
import { GET as sopSnapshotGet } from "@/app/api/owner/sop/snapshots/[snapshotId]/route";
import { GET as sopDiagGet } from "@/app/api/owner/sop/diagnoses/[cycleId]/route";
import { GET as sopDiagFindingsGet } from "@/app/api/owner/sop/diagnoses/[cycleId]/findings/route";
import { GET as sopDiagActionsGet } from "@/app/api/owner/sop/diagnoses/[cycleId]/actions/route";
import {
  GET as sopActionGet,
  PATCH as sopActionPatch,
} from "@/app/api/owner/sop/actions/[actionId]/route";
import { POST as sopVerifyPost } from "@/app/api/owner/sop/actions/[actionId]/verify/route";

import {
  GET as strategyBizSnapshotsGet,
  POST as strategyBizSnapshotsPost,
} from "@/app/api/owner/strategy/businesses/[businessId]/snapshots/route";
import { POST as strategyBizDiagnosesPost } from "@/app/api/owner/strategy/businesses/[businessId]/diagnoses/route";
import { GET as strategySnapshotGet } from "@/app/api/owner/strategy/snapshots/[snapshotId]/route";
import { GET as strategyDiagGet } from "@/app/api/owner/strategy/diagnoses/[cycleId]/route";
import { GET as strategyDiagFindingsGet } from "@/app/api/owner/strategy/diagnoses/[cycleId]/findings/route";
import { GET as strategyDiagActionsGet } from "@/app/api/owner/strategy/diagnoses/[cycleId]/actions/route";
import {
  GET as strategyActionGet,
  PATCH as strategyActionPatch,
} from "@/app/api/owner/strategy/actions/[actionId]/route";
import { POST as strategyVerifyPost } from "@/app/api/owner/strategy/actions/[actionId]/verify/route";

import { GET as recoveryDashboardGet } from "@/app/api/owner/recovery/dashboard/route";
import {
  GET as recoveryBusinessesGet,
  POST as recoveryBusinessesPost,
} from "@/app/api/owner/recovery/businesses/route";
import {
  GET as recoveryBusinessGet,
  PATCH as recoveryBusinessPatch,
} from "@/app/api/owner/recovery/businesses/[businessId]/route";
import {
  GET as recoveryBizSnapshotsGet,
  POST as recoveryBizSnapshotsPost,
} from "@/app/api/owner/recovery/businesses/[businessId]/snapshots/route";
import {
  GET as recoveryBizCyclesGet,
  POST as recoveryBizCyclesPost,
} from "@/app/api/owner/recovery/businesses/[businessId]/cycles/route";
import { GET as recoveryCycleGet } from "@/app/api/owner/recovery/cycles/[cycleId]/route";
import {
  GET as recoveryActionGet,
  PATCH as recoveryActionPatch,
} from "@/app/api/owner/recovery/actions/[actionId]/route";
import { POST as recoveryVerifyPost } from "@/app/api/owner/recovery/actions/[actionId]/verify/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const OWNER_VIEW = "owner:view";
const OWNER_MANAGE = "owner:manage";

function makeCtx(
  body: unknown,
  wsId = WS,
  actorId = ACTOR,
  url = "http://localhost/api/owner/x"
) {
  return {
    verifiedWorkspaceId: wsId,
    verifiedActorId: actorId,
    request: new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

function makeGetCtx(url = `http://localhost/api/owner/x`) {
  return {
    verifiedWorkspaceId: WS,
    verifiedActorId: ACTOR,
    request: new NextRequest(url, { method: "GET" }),
  };
}

type WrappedHandler = ((...args: unknown[]) => unknown) & {
  __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
};

function expectOwnerView(handler: WrappedHandler) {
  expect(handler.__options?.requireCapabilities).toContain(OWNER_VIEW);
  expect(handler.__options?.requireWorkspace).toBe(true);
}

function expectOwnerManage(handler: WrappedHandler) {
  expect(handler.__options?.requireCapabilities).toContain(OWNER_MANAGE);
  expect(handler.__options?.requireWorkspace).toBe(true);
}

// Valid minimal snapshot payloads (ZodEffects — all require periodStart <= periodEnd)
const SNAP_BODY_BASE = {
  periodStart: "2024-01-01",
  periodEnd: "2024-01-31",
  currency: "GBP",
};

// ---------------------------------------------------------------------------
// Cashflow domain
// ---------------------------------------------------------------------------
describe("cashflow domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(cashflowDashboardGet as WrappedHandler));

  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(cashflowBizSnapshotsGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(cashflowBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — rejects invalid businessId", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    await expect(
      (cashflowBizSnapshotsPost as Function)(ctx, { businessId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("biz snapshots POST — rejects missing currency", async () => {
    const ctx = makeCtx({ periodStart: "2024-01-01", periodEnd: "2024-01-31" });
    await expect(
      (cashflowBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (cashflowBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(cashflowBizDiagnosesPost as WrappedHandler));

  it("biz diagnoses POST — accepts valid snapshotId", async () => {
    const ctx = makeCtx({ snapshotId: SNAP_ID });
    const res = await (cashflowBizDiagnosesPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz diagnoses POST — rejects invalid snapshotId", async () => {
    const ctx = makeCtx({ snapshotId: INVALID_ID });
    await expect(
      (cashflowBizDiagnosesPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(cashflowSnapshotGet as WrappedHandler));
  it("snapshot GET — rejects invalid snapshotId", async () => {
    await expect(
      (cashflowSnapshotGet as Function)(makeGetCtx(), { snapshotId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(cashflowDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(cashflowDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(cashflowDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(cashflowActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(cashflowActionPatch as WrappedHandler));
  it("action PATCH — rejects invalid actionId", async () => {
    const ctx = makeCtx({ status: "in_progress" });
    await expect(
      (cashflowActionPatch as Function)(ctx, { actionId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("verify POST — OWNER_MANAGE", () => expectOwnerManage(cashflowVerifyPost as WrappedHandler));
  it("verify POST — accepts valid body", async () => {
    const ctx = makeCtx({ beforeValue: 1000, afterValue: 1200, targetDirection: "up" });
    const res = await (cashflowVerifyPost as Function)(ctx, { actionId: ACTION_ID });
    expect(res.status).toBe(201);
  });
  it("verify POST — rejects invalid targetDirection", async () => {
    const ctx = makeCtx({ beforeValue: 0, afterValue: 0, targetDirection: "sideways" });
    await expect(
      (cashflowVerifyPost as Function)(ctx, { actionId: ACTION_ID })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Finance domain
// ---------------------------------------------------------------------------
describe("finance domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(financeDashboardGet as WrappedHandler));

  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(financeBizSnapshotsGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(financeBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (financeBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz snapshots POST — rejects invalid businessId", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    await expect(
      (financeBizSnapshotsPost as Function)(ctx, { businessId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(financeBizDiagnosesPost as WrappedHandler));

  it("biz diagnoses POST — rejects missing snapshotId", async () => {
    const ctx = makeCtx({});
    await expect(
      (financeBizDiagnosesPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(financeSnapshotGet as WrappedHandler));
  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(financeDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(financeDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(financeDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(financeActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(financeActionPatch as WrappedHandler));
  it("verify POST — OWNER_MANAGE", () => expectOwnerManage(financeVerifyPost as WrappedHandler));

  it("verify POST — accepts valid body", async () => {
    const ctx = makeCtx({ beforeValue: 0, afterValue: 500, targetDirection: "up" });
    const res = await (financeVerifyPost as Function)(ctx, { actionId: ACTION_ID });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Marketing domain
// ---------------------------------------------------------------------------
describe("marketing domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(marketingDashboardGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(marketingBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (marketingBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(marketingBizDiagnosesPost as WrappedHandler));

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(marketingSnapshotGet as WrappedHandler));
  it("snapshot GET — rejects invalid id", async () => {
    await expect(
      (marketingSnapshotGet as Function)(makeGetCtx(), { snapshotId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(marketingDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(marketingDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(marketingDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(marketingActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(marketingActionPatch as WrappedHandler));
  it("verify POST — OWNER_MANAGE", () =>
    expectOwnerManage(marketingVerifyPost as WrappedHandler));
});

// ---------------------------------------------------------------------------
// Sales domain
// ---------------------------------------------------------------------------
describe("sales domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(salesDashboardGet as WrappedHandler));

  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(salesBizSnapshotsGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(salesBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (salesBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(salesBizDiagnosesPost as WrappedHandler));

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(salesSnapshotGet as WrappedHandler));
  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(salesDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(salesDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(salesDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(salesActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () => expectOwnerManage(salesActionPatch as WrappedHandler));

  it("verify POST — OWNER_MANAGE", () => expectOwnerManage(salesVerifyPost as WrappedHandler));
  it("verify POST — accepts valid body", async () => {
    const ctx = makeCtx({ beforeValue: null, afterValue: 100, targetDirection: "up" });
    const res = await (salesVerifyPost as Function)(ctx, { actionId: ACTION_ID });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// SOP domain
// ---------------------------------------------------------------------------
describe("sop domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(sopDashboardGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(sopBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (sopBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(sopBizDiagnosesPost as WrappedHandler));

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(sopSnapshotGet as WrappedHandler));
  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(sopDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(sopDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(sopDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(sopActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () => expectOwnerManage(sopActionPatch as WrappedHandler));
  it("verify POST — OWNER_MANAGE", () => expectOwnerManage(sopVerifyPost as WrappedHandler));

  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(sopBizSnapshotsGet as WrappedHandler));
});

// ---------------------------------------------------------------------------
// Strategy domain (dashboard already tested in strategy-wealth-routes.test.ts)
// ---------------------------------------------------------------------------
describe("strategy domain routes (non-dashboard)", () => {
  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(strategyBizSnapshotsGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(strategyBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx(SNAP_BODY_BASE);
    const res = await (strategyBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz snapshots POST — rejects missing periodStart", async () => {
    const ctx = makeCtx({ periodEnd: "2024-01-31", currency: "GBP" });
    await expect(
      (strategyBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("biz diagnoses POST — OWNER_MANAGE", () =>
    expectOwnerManage(strategyBizDiagnosesPost as WrappedHandler));

  it("snapshot GET — OWNER_VIEW", () => expectOwnerView(strategySnapshotGet as WrappedHandler));
  it("snapshot GET — rejects invalid id", async () => {
    await expect(
      (strategySnapshotGet as Function)(makeGetCtx(), { snapshotId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("diagnosis GET — OWNER_VIEW", () => expectOwnerView(strategyDiagGet as WrappedHandler));
  it("diagnosis findings GET — OWNER_VIEW", () =>
    expectOwnerView(strategyDiagFindingsGet as WrappedHandler));
  it("diagnosis actions GET — OWNER_VIEW", () =>
    expectOwnerView(strategyDiagActionsGet as WrappedHandler));

  it("action GET — OWNER_VIEW", () => expectOwnerView(strategyActionGet as WrappedHandler));
  it("action PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(strategyActionPatch as WrappedHandler));
  it("verify POST — OWNER_MANAGE", () =>
    expectOwnerManage(strategyVerifyPost as WrappedHandler));
});

// ---------------------------------------------------------------------------
// Recovery domain
// ---------------------------------------------------------------------------
describe("recovery domain routes", () => {
  it("dashboard — OWNER_VIEW", () => expectOwnerView(recoveryDashboardGet as WrappedHandler));

  it("businesses list GET — OWNER_VIEW", () =>
    expectOwnerView(recoveryBusinessesGet as WrappedHandler));

  it("businesses POST — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryBusinessesPost as WrappedHandler));

  it("businesses POST — accepts valid body", async () => {
    const ctx = makeCtx({
      name: "Test Laundry",
      businessType: "laundry_local_service",
      currency: "GBP",
    });
    const res = await (recoveryBusinessesPost as Function)(ctx, {});
    expect(res.status).toBe(201);
  });

  it("businesses POST — rejects missing name", async () => {
    const ctx = makeCtx({ businessType: "laundry", currency: "GBP" });
    await expect((recoveryBusinessesPost as Function)(ctx, {})).rejects.toThrow();
  });

  it("business detail GET — OWNER_VIEW", () =>
    expectOwnerView(recoveryBusinessGet as WrappedHandler));

  it("business detail GET — rejects invalid businessId", async () => {
    await expect(
      (recoveryBusinessGet as Function)(makeGetCtx(), { businessId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("business detail PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryBusinessPatch as WrappedHandler));

  it("business detail PATCH — accepts partial update", async () => {
    const ctx = makeCtx({ name: "Updated Laundry" });
    await (recoveryBusinessPatch as Function)(ctx, { businessId: BIZ_ID });
  });

  it("biz snapshots GET — OWNER_VIEW", () =>
    expectOwnerView(recoveryBizSnapshotsGet as WrappedHandler));

  it("biz snapshots POST — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryBizSnapshotsPost as WrappedHandler));

  it("biz snapshots POST — accepts valid body", async () => {
    const ctx = makeCtx({ periodStart: "2024-01-01", periodEnd: "2024-01-31", currency: "GBP" });
    const res = await (recoveryBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz snapshots POST — rejects periodEnd before periodStart", async () => {
    const ctx = makeCtx({ periodStart: "2024-02-01", periodEnd: "2024-01-01", currency: "GBP" });
    await expect(
      (recoveryBizSnapshotsPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("biz cycles GET — OWNER_VIEW", () =>
    expectOwnerView(recoveryBizCyclesGet as WrappedHandler));

  it("biz cycles POST — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryBizCyclesPost as WrappedHandler));

  it("biz cycles POST — accepts valid snapshotId", async () => {
    const ctx = makeCtx({ snapshotId: SNAP_ID });
    const res = await (recoveryBizCyclesPost as Function)(ctx, { businessId: BIZ_ID });
    expect(res.status).toBe(201);
  });

  it("biz cycles POST — rejects invalid snapshotId", async () => {
    const ctx = makeCtx({ snapshotId: INVALID_ID });
    await expect(
      (recoveryBizCyclesPost as Function)(ctx, { businessId: BIZ_ID })
    ).rejects.toThrow();
  });

  it("cycle detail GET — OWNER_VIEW", () =>
    expectOwnerView(recoveryCycleGet as WrappedHandler));

  it("cycle detail GET — rejects invalid cycleId", async () => {
    await expect(
      (recoveryCycleGet as Function)(makeGetCtx(), { cycleId: INVALID_ID })
    ).rejects.toThrow();
  });

  it("action GET — OWNER_VIEW", () => expectOwnerView(recoveryActionGet as WrappedHandler));

  it("action PATCH — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryActionPatch as WrappedHandler));

  it("action PATCH — requires version field", async () => {
    const ctx = makeCtx({ status: "in_progress" });
    await expect(
      (recoveryActionPatch as Function)(ctx, { actionId: ACTION_ID })
    ).rejects.toThrow();
  });

  it("action PATCH — accepts valid update with version", async () => {
    const ctx = makeCtx({ status: "in_progress", version: 1 });
    await (recoveryActionPatch as Function)(ctx, { actionId: ACTION_ID });
  });

  it("action PATCH — rejects invalid status", async () => {
    const ctx = makeCtx({ status: "INVALID_STATUS", version: 1 });
    await expect(
      (recoveryActionPatch as Function)(ctx, { actionId: ACTION_ID })
    ).rejects.toThrow();
  });

  it("verify POST — OWNER_MANAGE", () =>
    expectOwnerManage(recoveryVerifyPost as WrappedHandler));

  it("verify POST — accepts valid body", async () => {
    const ctx = makeCtx({ afterValue: 500 });
    const res = await (recoveryVerifyPost as Function)(ctx, { actionId: ACTION_ID });
    expect(res.status).toBe(201);
  });

  it("verify POST — rejects missing afterValue", async () => {
    const ctx = makeCtx({ evidence: "done" });
    await expect(
      (recoveryVerifyPost as Function)(ctx, { actionId: ACTION_ID })
    ).rejects.toThrow();
  });
});
