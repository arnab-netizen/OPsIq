/**
 * Cross-domain regression: every owner-facing finding reader ranks by canonical
 * severity (critical → high → medium → low, ties by impact) regardless of the
 * order the DB returns rows in. The fake DB here returns findings fully
 * reversed (least severe first), so any reader that keeps DB order — or sorts
 * the plain String column lexically — fails on every position.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anyQueryOrdersBySeverity,
  CANONICAL_CODES,
  codes,
  resetFakeDb,
  REVERSED_DB_FINDINGS,
  setDbFindingOrder,
} from "@/__tests__/owner-spine/severity-order-fixtures";

vi.mock("@/lib/db", async () => ({
  db: (await import("@/__tests__/owner-spine/severity-order-fixtures")).fakeDb,
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/founder-recovery/business.service", async () =>
  (await import("@/__tests__/owner-spine/severity-order-fixtures")).businessServiceMock
);

import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { getFinanceDiagnosis, listFinanceCycleFindings } from "@/services/owner-finance/diagnosis.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";
import { getCashflowDiagnosis, listCashflowCycleFindings } from "@/services/owner-cashflow/diagnosis.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";
import { getSalesDiagnosis, listSalesCycleFindings } from "@/services/owner-sales/diagnosis.service";
import { getOperationsDashboard } from "@/services/owner-operations/dashboard.service";
import { getOperationsDiagnosis, listOperationsCycleFindings } from "@/services/owner-operations/diagnosis.service";
import { getSopDashboard } from "@/services/owner-sop/dashboard.service";
import { getSopDiagnosis, listSopCycleFindings } from "@/services/owner-sop/diagnosis.service";
import { getMarketingDashboard } from "@/services/owner-marketing/dashboard.service";
import { getMarketingDiagnosis, listMarketingCycleFindings } from "@/services/owner-marketing/diagnosis.service";
import { getRecoveryDashboard } from "@/services/founder-recovery/dashboard.service";
import { getCycle } from "@/services/founder-recovery/cycle.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getCycleExplanations } from "@/services/owner-trust/trust.service";

type Reader = () => Promise<{ findings: Array<{ code: string }> } | Array<{ code: string }>>;

const DOMAIN_READERS: Record<string, { dashboard: Reader; diagnosis: Reader; list: Reader }> = {
  finance: {
    dashboard: async () => (await getFinanceDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getFinanceDiagnosis("c-1", "ws-1"),
    list: () => listFinanceCycleFindings("c-1", "ws-1"),
  },
  cashflow: {
    dashboard: async () => (await getCashflowDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getCashflowDiagnosis("c-1", "ws-1"),
    list: () => listCashflowCycleFindings("c-1", "ws-1"),
  },
  sales: {
    dashboard: async () => (await getSalesDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getSalesDiagnosis("c-1", "ws-1"),
    list: () => listSalesCycleFindings("c-1", "ws-1"),
  },
  operations: {
    dashboard: async () => (await getOperationsDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getOperationsDiagnosis("c-1", "ws-1"),
    list: () => listOperationsCycleFindings("c-1", "ws-1"),
  },
  sop: {
    dashboard: async () => (await getSopDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getSopDiagnosis("c-1", "ws-1"),
    list: () => listSopCycleFindings("c-1", "ws-1"),
  },
  marketing: {
    dashboard: async () => (await getMarketingDashboard("ws-1", "b-1")).latestCycle,
    diagnosis: () => getMarketingDiagnosis("c-1", "ws-1"),
    list: () => listMarketingCycleFindings("c-1", "ws-1"),
  },
};

function findingCodes(result: Awaited<ReturnType<Reader>>): string[] {
  return codes(Array.isArray(result) ? result : result.findings);
}

beforeEach(() => {
  resetFakeDb();
  setDbFindingOrder(REVERSED_DB_FINDINGS);
});

describe("cross-domain severity order — DB returns findings least-severe first", () => {
  it("fixture really is hostile: DB order is the exact reverse of canonical", () => {
    expect(codes(REVERSED_DB_FINDINGS)).toEqual(["F_LOW", "F_MED_X", "F_MED_Y", "F_HIGH", "F_CRIT"]);
    expect(CANONICAL_CODES).toEqual(["F_CRIT", "F_HIGH", "F_MED_Y", "F_MED_X", "F_LOW"]);
  });

  for (const [domain, readers] of Object.entries(DOMAIN_READERS)) {
    it(`${domain}: dashboard, diagnosis and findings list rank critical → high → medium (impact tie-break) → low`, async () => {
      expect(findingCodes(await readers.dashboard())).toEqual(CANONICAL_CODES);
      expect(findingCodes(await readers.diagnosis())).toEqual(CANONICAL_CODES);
      expect(findingCodes(await readers.list())).toEqual(CANONICAL_CODES);
      expect(anyQueryOrdersBySeverity()).toBe(false);
    });

    it(`${domain}: Trust explanations rank canonically`, async () => {
      const result = await getCycleExplanations(domain as Parameters<typeof getCycleExplanations>[0], "c-1", "ws-1");
      expect(result.explanations.map((e) => e.findingCode)).toEqual(CANONICAL_CODES);
      expect(result.explanations.map((e) => e.severity)).toEqual(["critical", "high", "medium", "medium", "low"]);
    });
  }

  it("recovery: dashboard and getCycle rank canonically", async () => {
    const payload = await getRecoveryDashboard("ws-1", "b-1");
    expect(codes(payload.latestCycle!.findings)).toEqual(CANONICAL_CODES);
    expect(codes((await getCycle("c-1", "ws-1")).findings)).toEqual(CANONICAL_CODES);
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });

  it("business condition: every domain's topFindingCodes are the three most severe", async () => {
    const result = await getBusinessCondition("ws-1", "b-1");
    const scores = result.profile!.domainScores;
    expect(scores).toHaveLength(8);
    for (const s of scores) expect(s.topFindingCodes, s.domain).toEqual(CANONICAL_CODES.slice(0, 3));
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });

  it("home: top risks are the critical findings", async () => {
    const result = await getOwnerHome("ws-1", "b-1");
    const top = result.summary!.top3Risks;
    expect(top.map((r) => r.severity)).toEqual(["critical", "critical", "critical"]);
    expect(anyQueryOrdersBySeverity()).toBe(false);
  });
});
