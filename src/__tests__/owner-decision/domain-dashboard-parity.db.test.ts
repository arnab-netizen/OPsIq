/* eslint-disable @typescript-eslint/no-explicit-any -- seeded snapshot inputs and dashboard payloads are untyped */
/**
 * P1 — cross-surface invariant through the REAL domain dashboard services (what each page renders):
 * a domain page's next step is never a candidate the canonical owner decision excludes, and it is the
 * canonical decision's first item of that domain. Current and out-of-date evidence, per domain.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/domain-dashboard-parity.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { getStrategyDashboard } from "@/services/owner-strategy/dashboard.service";
import { getOwnerHome } from "@/services/owner-home/home.service";

const actor = randomUUID();
beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `parity-${actor}@example.com`, name: "Parity QA", isActive: true, updatedAt: new Date() } });
});

function period(daysAgoEnd: number) {
  const end = new Date(Date.now() - daysAgoEnd * 86_400_000);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

type Seed = (businessId: string, workspaceId: string, daysAgoEnd: number) => Promise<void>;
const DOMAINS: Array<{ domain: string; seed: Seed; dashboard: (ws: string, b: string) => Promise<any> }> = [
  {
    domain: "sales",
    seed: async (b, ws, d) => {
      const s = await createSalesSnapshot(b, { ...period(d), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000, newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2 } as any, actor, ws);
      await runSalesDiagnosis(b, s.id, actor, ws);
    },
    dashboard: getSalesDashboard,
  },
  {
    domain: "cashflow",
    seed: async (b, ws, d) => {
      const s = await createCashflowSnapshot(b, { ...period(d), currency: "INR", cashInHand: 5000, bankBalance: 0, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000, payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000 }, actor, ws);
      await runCashflowDiagnosis(b, s.id, actor, ws);
    },
    dashboard: getCashflowDashboard,
  },
  {
    domain: "finance",
    seed: async (b, ws, d) => {
      const s = await createFinancialSnapshot(b, { ...period(d), currency: "INR", revenue: 100000, discountAmount: 5000 } as any, actor, ws);
      await runFinanceDiagnosis(b, s.id, actor, ws);
    },
    dashboard: getFinanceDashboard,
  },
  {
    domain: "strategy",
    seed: async (b, ws, d) => {
      const s = await createStrategySnapshot(b, { ...period(d), currency: "INR", optionName: "New van", currentRevenue: 100000, expectedRevenueChange: 30000, costChange: 5000, investmentRequired: 100000, timeToImpactMonths: 3, riskLevel: "medium", cashAvailable: 50000 } as any, actor, ws);
      await runStrategyDiagnosis(b, s.id, actor, ws);
    },
    dashboard: getStrategyDashboard,
  },
];

describe("[db] P1 — every domain dashboard's next step obeys the canonical eligibility contract", () => {
  for (const { domain, seed, dashboard } of DOMAINS) {
    for (const [label, daysAgoEnd] of [["current", 0], ["out-of-date", 120]] as const) {
      it(`[db] ${domain} (${label} evidence): the page's next step is the decision's first ${domain} item and never an excluded one`, async () => {
        const workspaceId = randomUUID();
        const b = await createBusiness({ name: `Parity ${domain}`, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
        await seed(b.id, workspaceId, daysAgoEnd);
        const decision = (await getOwnerHome(workspaceId, b.id)).currentOwnerDecision!;
        const excludedRowIds = new Set(decision.excluded.map((e) => String(e.candidateId).split(":").pop()));
        const first = decision.attention.find((t) => t.domain === domain) ?? null;
        const page = await dashboard(workspaceId, b.id);
        const step = page.recommendedNextAction;
        // Never an excluded row.
        if (step) expect(excludedRowIds.has(String(step.id))).toBe(false);
        // Exactly the canonical first item of the domain (a row by id, or the canonical item itself).
        const stepCandidateId = step ? (step.localStepSource === "domain_action" ? `domain_action:${domain}:${step.id}` : step.id) : null;
        if (domain === "strategy" && page.decisionStep?.state === "current") {
          // Strategy keeps its decision's primary step while that row is eligible (Strategy coherence).
          expect(decision.attention.some((t) => t.candidateId === stepCandidateId)).toBe(true);
        } else {
          expect(stepCandidateId).toBe(first?.candidateId ?? null);
        }
        if (label === "out-of-date") expect(step?.localStepSource).toBe("evidence_refresh");
        await teardownOwnerBusiness(b.id);
      });
    }
  }
});
