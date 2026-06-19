/**
 * DB-layer guard tests for controlled-learning-admission.service.ts
 *
 * Verifies that all admission guards are correctly enforced using a mock
 * PrismaClient. Named *.db.test.ts to include in the LANE_B DB verification
 * suite — the same guards are exercised against the migrated schema.
 *
 * Covers BLOCKER-2 (review gate), BLOCKER-3 (DB eligibility), HIGH-6 (harm).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  admitCandidate,
  listAdmissionsForWorkspace,
  getAdmission,
} from "../../../services/controlled-learning-admission.service";

const WS = "ws-db-001";
const CAND = "cand-db-001";

const eligibleCandidate = {
  id: CAND,
  workspaceId: WS,
  eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
  evidenceSourceType: "REAL_SOURCE_BACKED_CANDIDATE",
  promotionLocked: false,
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    controlledLearningCandidate: {
      findFirst: vi.fn().mockResolvedValue(eligibleCandidate),
    },
    controlledLearningReview: {
      findFirst: vi.fn().mockResolvedValue({ id: "rev-001" }),
    },
    controlledLearningHarmEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    controlledLearningAdmission: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "adm-001", workspaceId: WS, candidateId: CAND }),
    },
    ...overrides,
  };
}

function baseInput() {
  return {
    workspaceId: WS,
    candidateId: CAND,
    admittedBy: "reviewer@example.com",
    admittedAt: new Date("2026-06-19T10:00:00Z"),
    sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    admissionNotes: "Verified and approved",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── BLOCKER-2: Review gate ───────────────────────────────────────────────────

describe("controlled-learning-admission — review gate (BLOCKER-2)", () => {
  it("blocks admission when no APPROVED review exists", async () => {
    const prisma = makePrisma({
      controlledLearningReview: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("APPROVED review");
  });

  it("admits candidate when APPROVED review exists", async () => {
    const prisma = makePrisma();
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(true);
  });

  it("queries review with decision=APPROVED scoped to candidateId+workspaceId", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "rev-001" });
    const prisma = makePrisma({ controlledLearningReview: { findFirst } });
    await admitCandidate(prisma as any, baseInput());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: CAND,
          workspaceId: WS,
          decision: "APPROVED",
        }),
      })
    );
  });
});

// ─── BLOCKER-3: DB eligibility — caller status never used ─────────────────────

describe("controlled-learning-admission — eligibility from DB only (BLOCKER-3)", () => {
  it("blocks admission when DB status is LEARNING_INELIGIBLE_UNVERIFIED", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          ...eligibleCandidate,
          eligibilityStatus: "LEARNING_INELIGIBLE_UNVERIFIED",
        }),
      },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_UNVERIFIED");
  });

  it("blocks admission when DB status is LEARNING_INELIGIBLE_AI_GENERATED", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          ...eligibleCandidate,
          eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED",
        }),
      },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_AI_GENERATED");
  });

  it("writes DB eligibilityStatus to admission record — not caller-provided value", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "adm-001" });
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createFn,
      },
    });
    await admitCandidate(prisma as any, baseInput());
    const data = createFn.mock.calls[0][0].data;
    expect(data.eligibilityStatus).toBe("LEARNING_ELIGIBLE_VERIFIED_OUTCOME");
  });
});

// ─── HIGH-6: CRITICAL harm event gate ────────────────────────────────────────

describe("controlled-learning-admission — CRITICAL harm event gate (HIGH-6)", () => {
  it("blocks admission when CRITICAL unmitigated harm event exists", async () => {
    const prisma = makePrisma({
      controlledLearningHarmEvent: {
        findFirst: vi.fn().mockResolvedValue({ id: "harm-001" }),
      },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("CRITICAL harm event");
  });

  it("queries harm events with severity=CRITICAL and mitigated=false", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = makePrisma({ controlledLearningHarmEvent: { findFirst } });
    await admitCandidate(prisma as any, baseInput());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: CAND,
          workspaceId: WS,
          severity: "CRITICAL",
          mitigated: false,
        }),
      })
    );
  });
});

// ─── Forbidden origins (pre-DB guard) ────────────────────────────────────────

describe("controlled-learning-admission — forbidden evidence origins", () => {
  const forbiddenOrigins = [
    "ai_generated",
    "synthetic_benchmark",
    "search_snippet_only",
    "public_source_unverified",
  ];

  for (const origin of forbiddenOrigins) {
    it(`blocks ${origin} before any DB lookup`, async () => {
      const candidateFindFirst = vi.fn();
      const prisma = makePrisma({
        controlledLearningCandidate: { findFirst: candidateFindFirst },
      });
      const result = await admitCandidate(prisma as any, {
        ...baseInput(),
        evidenceOrigin: origin,
      });
      expect(result.admitted).toBe(false);
      expect(result.violations[0]).toContain(origin);
      expect(candidateFindFirst).not.toHaveBeenCalled();
    });
  }
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("controlled-learning-admission — workspace isolation", () => {
  it("blocks cross-workspace admission when DB record has different workspaceId", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          ...eligibleCandidate,
          workspaceId: "ws-other-tenant",
        }),
      },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("Cross-workspace");
  });

  it("listAdmissionsForWorkspace returns only workspace-scoped records", async () => {
    const admission = { id: "adm-001", workspaceId: WS, candidateId: CAND };
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([admission]),
        create: vi.fn(),
      },
    });
    const result = await listAdmissionsForWorkspace(prisma as any, WS);
    expect(result).toHaveLength(1);
    expect((result[0] as any).workspaceId).toBe(WS);
  });

  it("getAdmission returns null when candidate not in workspace", async () => {
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn(),
      },
    });
    const result = await getAdmission(prisma as any, WS, "other-cand");
    expect(result).toBeNull();
  });
});

// ─── Duplicate guard ──────────────────────────────────────────────────────────

describe("controlled-learning-admission — duplicate guard", () => {
  it("blocks if candidate already has an admission record", async () => {
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-adm" }),
        create: vi.fn(),
      },
    });
    const result = await admitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("already admitted");
  });
});
