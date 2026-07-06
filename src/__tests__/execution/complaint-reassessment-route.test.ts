/**
 * H6 (PASS 19): a complaint/rework event that contradicts an ACCEPTED proof routes into a governed
 * reassessment via the existing reassessment service — not left as an advisory string. Fail-closed:
 * only an ACCEPTED proof, only in-workspace event + proof, businessId required. Idempotent (dedupes).
 */
import { describe, it, expect, vi } from "vitest";
import { routeComplaintToReassessment, type ComplaintReworkDeps } from "@/services/execution/complaint-rework.service";
import type { ReassessmentDeps } from "@/services/owner-mode/reassessment-event.service";

const WS = "ws-h6";
const BIZ = "biz-h6";
const EVENT = "evt-1";
const PROOF = "proof-1";

function complaintDeps(proofStatus: string | null, eventExists = true): ComplaintReworkDeps {
  return {
    uuid: () => "id",
    now: () => 0,
    db: {
      operationalEvent: {
        findFirst: vi.fn(async () => (eventExists ? { id: EVENT, workspaceId: WS, relatedProofId: PROOF } : null)),
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: EVENT })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      proof: {
        findFirst: vi.fn(async () => (proofStatus ? { id: PROOF, status: proofStatus, submittedByUserId: null } : null)),
        findMany: vi.fn(async () => []),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn) => fn({} as never)),
    } as unknown as ComplaintReworkDeps["db"],
  };
}

/** A reassessment deps double that records one created row and dedupes a second identical open trigger. */
function reassessDeps(): { deps: ReassessmentDeps; created: () => number } {
  const rows: Array<{ id: string; workspaceId: string; businessId: string; trigger: string; status: string; sourceProofId: string | null; outcomeId: string | null; createdAt: Date }> = [];
  const deps: ReassessmentDeps = {
    uuid: () => `r-${rows.length}`,
    now: () => new Date("2026-07-06T00:00:00Z"),
    db: {
      ownerReassessmentEvent: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          rows.find((r) => r.workspaceId === where.workspaceId && r.trigger === where.trigger && r.sourceProofId === where.sourceProofId) ?? null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: data.id as string, workspaceId: data.workspaceId as string, businessId: data.businessId as string, trigger: data.trigger as string, status: data.status as string, sourceProofId: (data.sourceProofId as string) ?? null, outcomeId: (data.outcomeId as string) ?? null, createdAt: data.createdAt as Date };
          rows.push(row);
          return row;
        }),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
        ownerReassessmentEvent: {
          findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
            rows.find((r) => r.workspaceId === where.workspaceId && r.trigger === where.trigger && r.sourceProofId === where.sourceProofId) ?? null),
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            const row = { id: data.id as string, workspaceId: data.workspaceId as string, businessId: data.businessId as string, trigger: data.trigger as string, status: data.status as string, sourceProofId: (data.sourceProofId as string) ?? null, outcomeId: (data.outcomeId as string) ?? null, createdAt: data.createdAt as Date };
            rows.push(row);
            return row;
          }),
        },
        auditEvent: { create: vi.fn(async () => ({})) },
      })),
    } as unknown as ReassessmentDeps["db"],
  };
  return { deps, created: () => rows.length };
}

describe("H6 — complaint → reassessment routing", () => {
  it("a complaint against an ACCEPTED proof creates a governed reassessment (new_contradicting_evidence)", async () => {
    const r = reassessDeps();
    const res = await routeComplaintToReassessment(
      { workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF },
      complaintDeps("ACCEPTED"), r.deps,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.deduped).toBe(false);
    expect(r.created()).toBe(1);
  });

  it("is idempotent — a repeat for the same proof reuses the open reassessment (no duplicate)", async () => {
    const r = reassessDeps();
    await routeComplaintToReassessment({ workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps("ACCEPTED"), r.deps);
    const res2 = await routeComplaintToReassessment({ workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps("ACCEPTED"), r.deps);
    expect(res2.ok).toBe(true);
    if (res2.ok) expect(res2.deduped).toBe(true);
    expect(r.created()).toBe(1);
  });

  it("fails closed when the proof is not ACCEPTED (no contradiction, no reassessment)", async () => {
    const r = reassessDeps();
    const res = await routeComplaintToReassessment({ workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps("SUBMITTED"), r.deps);
    expect(res.ok).toBe(false);
    expect(r.created()).toBe(0);
  });

  it("fails closed when the proof is not in the workspace", async () => {
    const r = reassessDeps();
    const res = await routeComplaintToReassessment({ workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps(null), r.deps);
    expect(res.ok).toBe(false);
    expect(r.created()).toBe(0);
  });

  it("fails closed when the event is not in the workspace", async () => {
    const r = reassessDeps();
    const res = await routeComplaintToReassessment({ workspaceId: WS, businessId: BIZ, actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps("ACCEPTED", false), r.deps);
    expect(res.ok).toBe(false);
    expect(r.created()).toBe(0);
  });

  it("requires businessId (reassessment cannot be created without it)", async () => {
    const r = reassessDeps();
    const res = await routeComplaintToReassessment({ workspaceId: WS, businessId: "", actorId: null, eventId: EVENT, proofId: PROOF }, complaintDeps("ACCEPTED"), r.deps);
    expect(res.ok).toBe(false);
    expect(r.created()).toBe(0);
  });
});
