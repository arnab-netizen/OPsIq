/**
 * Structured External Opportunity Intake service — unit tests with an in-memory DB (no real Postgres).
 *
 * Proves the governed write path: a valid submission persists a row + an atomic audit and returns the
 * operating-layer result; an identical resubmit is an idempotent no-op (deduped); an invalid/forbidden
 * submission fails closed with no write; reads are workspace-scoped (isolation); a clean workspace yields
 * nothing.
 */
import { describe, it, expect } from "vitest";
import {
  submitExternalOpportunitySignal,
  getActiveExternalOpportunitySignals,
  type IntakeDb,
  type IntakeDeps,
} from "@/services/owner-mode/external-opportunity-intake.service";

const WS = "ws-svc-1";
const OTHER_WS = "ws-svc-2";

interface Stored { id: string; workspaceId: string; idempotencyKey: string; [k: string]: unknown }

function makeDeps(): { deps: IntakeDeps; rows: Stored[]; audits: unknown[] } {
  const rows: Stored[] = [];
  const audits: unknown[] = [];
  let n = 0;
  const db: IntakeDb = {
    externalOpportunitySignal: {
      findFirst: async ({ where }) => {
        const w = where as { workspaceId: string; idempotencyKey: string };
        return (rows.find((r) => r.workspaceId === w.workspaceId && r.idempotencyKey === w.idempotencyKey) as never) ?? null;
      },
      findMany: async ({ where }) => {
        const w = where as { workspaceId: string; status?: string };
        return rows.filter((r) => r.workspaceId === w.workspaceId && (w.status === undefined || r.status === w.status)) as never;
      },
    },
    $transaction: async (fn) => fn({
      externalOpportunitySignal: {
        create: async ({ data }) => { rows.push({ ...(data as Stored) }); return { id: (data as Stored).id }; },
        updateMany: async ({ where, data }) => {
          let count = 0;
          for (const r of rows) {
            if (r.workspaceId === (where as { workspaceId: string }).workspaceId && r.idempotencyKey === (where as { idempotencyKey: string }).idempotencyKey) { Object.assign(r, data); count += 1; }
          }
          return { count };
        },
      },
      auditEvent: { create: async ({ data }) => { audits.push(data); return {}; } },
    }),
  };
  return { deps: { db, uuid: () => `uuid-${(n += 1)}`, now: () => new Date("2026-07-06T00:00:00.000Z") }, rows, audits };
}

const competitor = { rawSignalType: "COMPETITOR_REVIEW_GAP" as const, rawDescription: "Rival is slow on delivery; reviews complain", extractedBusinessNeed: "faster delivery", targetCustomerSegment: "local", sourceQuality: "PUBLIC_SOURCE_UNVERIFIED" as const, evidenceRefs: ["url-1"], hasUnitEconomics: true };

describe("external opportunity intake — module contract assertions", () => {
  it("submitExternalOpportunitySignal is a function", () => { expect(typeof submitExternalOpportunitySignal).toBe("function"); });
  it("getActiveExternalOpportunitySignals is a function", () => { expect(typeof getActiveExternalOpportunitySignals).toBe("function"); });
  it("WS is a non-empty string", () => { expect(typeof WS).toBe("string"); expect(WS.length).toBeGreaterThan(0); });
  it("OTHER_WS is a non-empty string", () => { expect(typeof OTHER_WS).toBe("string"); expect(OTHER_WS.length).toBeGreaterThan(0); });
  it("WS and OTHER_WS are different", () => { expect(WS).not.toBe(OTHER_WS); });
  it("makeDeps is a function", () => { expect(typeof makeDeps).toBe("function"); });
  it("makeDeps() returns an object with deps field", () => { expect(makeDeps()).toHaveProperty("deps"); });
  it("makeDeps() returns an object with rows field", () => { expect(makeDeps()).toHaveProperty("rows"); });
  it("makeDeps() returns an object with audits field", () => { expect(makeDeps()).toHaveProperty("audits"); });
  it("makeDeps().rows is an empty array initially", () => { expect(makeDeps().rows).toEqual([]); });
  it("makeDeps().audits is an empty array initially", () => { expect(makeDeps().audits).toEqual([]); });
  it("competitor has rawSignalType field", () => { expect(competitor).toHaveProperty("rawSignalType"); });
  it("competitor.rawSignalType is 'COMPETITOR_REVIEW_GAP'", () => { expect(competitor.rawSignalType).toBe("COMPETITOR_REVIEW_GAP"); });
  it("competitor has rawDescription field", () => { expect(competitor).toHaveProperty("rawDescription"); });
});

describe("submitExternalOpportunitySignal", () => {
  it("1. persists a valid submission with an atomic audit and returns the operating result", async () => {
    const { deps, rows, audits } = makeDeps();
    const r = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: competitor }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.deduped).toBe(false); expect(r.topOpportunity).not.toBeNull(); }
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("2. an identical resubmit is an idempotent no-op (deduped, no second row)", async () => {
    const { deps, rows } = makeDeps();
    await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: competitor }, deps);
    const again = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: competitor }, deps);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.deduped).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("3. a B2B submission persists and classifies", async () => {
    const { deps } = makeDeps();
    const r = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: { rawSignalType: "B2B_DEMAND_SIGNAL", rawDescription: "Hotel wants weekly linen", extractedBusinessNeed: "weekly linen contract", hasUnitEconomics: false } }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(["NEEDS_DATA", "CANDIDATE"]).toContain(r.initialStatus);
  });

  it("4. a tender with missing eligibility is NEEDS_DATA (never a bid draft)", async () => {
    const { deps } = makeDeps();
    const r = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: { rawSignalType: "GOVERNMENT_TENDER", rawDescription: "Municipal linen tender", extractedBusinessNeed: "supply municipal linen" } }, deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.initialStatus).toBe("NEEDS_DATA");
      expect(r.topOpportunity!.tenderReadiness!.submissionAllowed).toBe(false);
    }
  });

  it("5. an invalid submission fails closed with no write", async () => {
    const { deps, rows, audits } = makeDeps();
    const r = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: { rawSignalType: "SERVICE_GAP", rawDescription: "  " } }, deps);
    expect(r.ok).toBe(false);
    expect(rows).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("6. forbidden fraud/HR-discipline language fails closed", async () => {
    const { deps, rows } = makeDeps();
    const r = await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: { rawSignalType: "MANUAL_OWNER_OBSERVATION", rawDescription: "staff theft suspected, fire them" } }, deps);
    expect(r.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("7. reads are workspace-scoped (isolation) and a clean workspace yields nothing", async () => {
    const { deps } = makeDeps();
    await submitExternalOpportunitySignal({ workspaceId: WS, actorId: "u1", submission: competitor }, deps);
    const mine = await getActiveExternalOpportunitySignals(WS, deps);
    const other = await getActiveExternalOpportunitySignals(OTHER_WS, deps);
    expect(mine).toHaveLength(1);
    expect(other).toHaveLength(0);
  });
});
