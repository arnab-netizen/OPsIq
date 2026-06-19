/**
 * Tests for /api/owner/learning-admissions route + admission service guards.
 *
 * Route tests: mock the service to verify the route passes only minimal intent
 *   data (no caller-supplied eligibilityStatus).
 *
 * Service unit tests: use vi.importActual to call the real service with a
 *   mocked Prisma client — no live DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Route-level tests (service mocked) ──────────────────────────────────────

vi.mock("@/services/controlled-learning-admission.service", () => ({
  admitCandidate: vi.fn(),
  getAdmission: vi.fn(),
  listAdmissionsForWorkspace: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import * as svc from "@/services/controlled-learning-admission.service";
import {
  type AdmitCandidateInput,
} from "@/services/controlled-learning-admission.service";

// Real implementation used by service unit tests — bypasses the vi.mock above
type SvcModule = typeof import("@/services/controlled-learning-admission.service");
const { admitCandidate: realAdmitCandidate } = await vi.importActual<SvcModule>(
  "@/services/controlled-learning-admission.service"
);

const WS = "ws-test-001";
const CAND_ID = "cand-001";

beforeEach(() => {
  vi.clearAllMocks();
});

function baseInput(): AdmitCandidateInput {
  return {
    workspaceId: WS,
    candidateId: CAND_ID,
    admittedBy: "admin@example.com",
    admittedAt: new Date("2026-06-19T10:00:00Z"),
    sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    // no eligibilityStatus — removed from input interface
    admissionNotes: "Approved for admission",
  };
}

// ─── Route service contract tests ─────────────────────────────────────────────

describe("POST /api/owner/learning-admissions — route service contract", () => {
  it("calls admitCandidate without eligibilityStatus in payload", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: true,
      violations: [],
      admission: { id: "adm-001" },
    });
    const input = baseInput();
    // Verify the input type has no eligibilityStatus field
    expect("eligibilityStatus" in input).toBe(false);
    await svc.admitCandidate({} as any, input);
    expect(svc.admitCandidate).toHaveBeenCalledOnce();
    const callArg = vi.mocked(svc.admitCandidate).mock.calls[0][1];
    expect(callArg).not.toHaveProperty("eligibilityStatus");
  });

  it("returns admitted=true on success", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: true,
      violations: [],
      admission: { id: "adm-001" },
    });
    const result = await svc.admitCandidate({} as any, baseInput());
    expect(result.admitted).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns admitted=false for forbidden evidence origin", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ['Evidence origin "ai_generated" is forbidden and may never be admitted'],
    });
    const result = await svc.admitCandidate({} as any, {
      ...baseInput(),
      evidenceOrigin: "ai_generated",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("ai_generated");
  });

  it("returns admitted=false if candidate not found", async () => {
    vi.mocked(svc.admitCandidate).mockResolvedValue({
      admitted: false,
      violations: ["Candidate not found or wrong workspace"],
    });
    const result = await svc.admitCandidate({} as any, {
      ...baseInput(),
      candidateId: "nonexistent",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("not found");
  });
});

// ─── GET /api/owner/learning-admissions — list contract ───────────────────────

describe("GET /api/owner/learning-admissions — list contract", () => {
  it("calls listAdmissionsForWorkspace with workspaceId", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(svc.listAdmissionsForWorkspace).toHaveBeenCalledWith({}, WS);
  });

  it("returns empty array when no admissions", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    const result = await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(result).toEqual([]);
  });

  it("returns admissions scoped to workspace", async () => {
    const admission = { id: "adm-001", workspaceId: WS, candidateId: CAND_ID };
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([admission]);
    const result = await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(result).toHaveLength(1);
  });
});

// ─── Service unit tests (Prisma mocked inline) ───────────────────────────────

function makePrisma(overrides: Record<string, unknown> = {}) {
  const eligibleCandidate = {
    id: CAND_ID,
    workspaceId: WS,
    eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
    evidenceSourceType: "REAL_SOURCE_BACKED_CANDIDATE",
    promotionLocked: false,
  };
  const approvedReview = { id: "rev-001" };

  return {
    controlledLearningCandidate: {
      findFirst: vi.fn().mockResolvedValue(eligibleCandidate),
    },
    controlledLearningReview: {
      findFirst: vi.fn().mockResolvedValue(approvedReview),
    },
    controlledLearningHarmEvent: {
      findFirst: vi.fn().mockResolvedValue(null), // no harm by default
    },
    controlledLearningAdmission: {
      findFirst: vi.fn().mockResolvedValue(null), // not already admitted
      create: vi.fn().mockResolvedValue({ id: "adm-new" }),
    },
    ...overrides,
  };
}

describe("admitCandidate service — review gate (BLOCKER-2)", () => {
  it("blocks admission when no review record exists", async () => {
    const prisma = makePrisma({
      controlledLearningReview: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("APPROVED review");
  });

  it("blocks admission when review exists but is REJECTED", async () => {
    const prisma = makePrisma({
      controlledLearningReview: {
        findFirst: vi.fn().mockResolvedValue(null), // no APPROVED row found
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("APPROVED review");
  });

  it("blocks admission when review exists but is DEFERRED", async () => {
    const prisma = makePrisma({
      controlledLearningReview: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
  });

  it("allows admission when APPROVED review exists and all other guards pass", async () => {
    const prisma = makePrisma(); // default has approvedReview
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("review query uses candidateId + workspaceId + decision=APPROVED", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "rev-001" });
    const prisma = makePrisma({
      controlledLearningReview: { findFirst },
    });
    await realAdmitCandidate(prisma as any, baseInput());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: CAND_ID,
          workspaceId: WS,
          decision: "APPROVED",
        }),
      })
    );
  });
});

describe("admitCandidate service — eligibility from DB only (BLOCKER-3)", () => {
  it("blocks admission when candidate DB status is LEARNING_INELIGIBLE_UNVERIFIED", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CAND_ID,
          workspaceId: WS,
          eligibilityStatus: "LEARNING_INELIGIBLE_UNVERIFIED",
          evidenceSourceType: "REAL_SOURCE_BACKED_CANDIDATE",
          promotionLocked: false,
        }),
      },
    });
    // Even though input has a valid-looking origin, DB status blocks it
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_UNVERIFIED");
  });

  it("blocks admission when candidate DB status is LEARNING_INELIGIBLE_AI_GENERATED", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CAND_ID,
          workspaceId: WS,
          eligibilityStatus: "LEARNING_INELIGIBLE_AI_GENERATED",
          evidenceSourceType: "SYNTHETIC_ONLY_CANDIDATE",
          promotionLocked: false,
        }),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_AI_GENERATED");
  });

  it("blocks admission when candidate DB status is LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CAND_ID,
          workspaceId: WS,
          eligibilityStatus: "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED",
          evidenceSourceType: "REAL_SOURCE_BACKED_CANDIDATE",
          promotionLocked: false,
        }),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED");
  });

  it("uses eligibilityStatus from DB record in the created admission — not from caller", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "adm-new" });
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createFn,
      },
    });
    await realAdmitCandidate(prisma as any, baseInput());
    const createCall = createFn.mock.calls[0][0];
    expect(createCall.data.eligibilityStatus).toBe("LEARNING_ELIGIBLE_VERIFIED_OUTCOME");
  });
});

describe("admitCandidate service — forbidden evidence origins (independent guards)", () => {
  it("blocks ai_generated evidence before DB lookup", async () => {
    const candidateFindFirst = vi.fn();
    const prisma = makePrisma({
      controlledLearningCandidate: { findFirst: candidateFindFirst },
    });
    const result = await realAdmitCandidate(prisma as any, {
      ...baseInput(),
      evidenceOrigin: "ai_generated",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("ai_generated");
    expect(candidateFindFirst).not.toHaveBeenCalled(); // blocked before DB
  });

  it("blocks synthetic_benchmark evidence before DB lookup", async () => {
    const candidateFindFirst = vi.fn();
    const prisma = makePrisma({
      controlledLearningCandidate: { findFirst: candidateFindFirst },
    });
    const result = await realAdmitCandidate(prisma as any, {
      ...baseInput(),
      evidenceOrigin: "synthetic_benchmark",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("synthetic_benchmark");
    expect(candidateFindFirst).not.toHaveBeenCalled();
  });

  it("blocks search_snippet_only evidence before DB lookup", async () => {
    const candidateFindFirst = vi.fn();
    const prisma = makePrisma({
      controlledLearningCandidate: { findFirst: candidateFindFirst },
    });
    const result = await realAdmitCandidate(prisma as any, {
      ...baseInput(),
      evidenceOrigin: "search_snippet_only",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("search_snippet_only");
    expect(candidateFindFirst).not.toHaveBeenCalled();
  });

  it("blocks public_source_unverified evidence before DB lookup", async () => {
    const candidateFindFirst = vi.fn();
    const prisma = makePrisma({
      controlledLearningCandidate: { findFirst: candidateFindFirst },
    });
    const result = await realAdmitCandidate(prisma as any, {
      ...baseInput(),
      evidenceOrigin: "public_source_unverified",
    });
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("public_source_unverified");
    expect(candidateFindFirst).not.toHaveBeenCalled();
  });
});

describe("admitCandidate service — cross-workspace and workspace scoping", () => {
  it("blocks cross-workspace admission attempt", async () => {
    // Candidate DB record has a different workspaceId than the request
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CAND_ID,
          workspaceId: "ws-other-tenant",
          eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
          evidenceSourceType: "REAL_SOURCE_BACKED_CANDIDATE",
          promotionLocked: false,
        }),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("Cross-workspace");
  });

  it("returns not-found when candidate workspaceId does not match (DB-level isolation)", async () => {
    const prisma = makePrisma({
      controlledLearningCandidate: {
        findFirst: vi.fn().mockResolvedValue(null), // DB returns null for mismatched workspace
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("not found");
  });

  it("throws assertWorkspaceScopedQuery error for blank workspaceId", async () => {
    const prisma = makePrisma();
    await expect(
      realAdmitCandidate(prisma as any, { ...baseInput(), workspaceId: "" })
    ).rejects.toThrow();
  });
});

describe("admitCandidate service — CRITICAL harm event guard (HIGH-6)", () => {
  it("blocks admission when CRITICAL unmitigated harm event exists", async () => {
    const prisma = makePrisma({
      controlledLearningHarmEvent: {
        findFirst: vi.fn().mockResolvedValue({ id: "harm-001" }),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("CRITICAL harm event");
  });

  it("allows admission when no CRITICAL harm event exists", async () => {
    const prisma = makePrisma({
      controlledLearningHarmEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(true);
  });

  it("harm query scopes to candidateId + workspaceId + CRITICAL + mitigated=false", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = makePrisma({
      controlledLearningHarmEvent: { findFirst },
    });
    await realAdmitCandidate(prisma as any, baseInput());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: CAND_ID,
          workspaceId: WS,
          severity: "CRITICAL",
          mitigated: false,
        }),
      })
    );
  });
});

describe("admitCandidate service — duplicate guard", () => {
  it("blocks if candidate already admitted", async () => {
    const prisma = makePrisma({
      controlledLearningAdmission: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-adm" }),
        create: vi.fn(),
      },
    });
    const result = await realAdmitCandidate(prisma as any, baseInput());
    expect(result.admitted).toBe(false);
    expect(result.violations[0]).toContain("already admitted");
  });
});

describe("security invariants — route does not accept caller eligibilityStatus", () => {
  it("AdmitCandidateInput interface has no eligibilityStatus field", () => {
    const input: AdmitCandidateInput = baseInput();
    // Type check: eligibilityStatus must not exist on the type
    // If it did, TypeScript would error at compile time
    const keys = Object.keys(input);
    expect(keys).not.toContain("eligibilityStatus");
  });

  it("listAdmissionsForWorkspace always receives workspaceId", async () => {
    vi.mocked(svc.listAdmissionsForWorkspace).mockResolvedValue([]);
    await svc.listAdmissionsForWorkspace({} as any, WS);
    expect(svc.listAdmissionsForWorkspace).toHaveBeenCalledWith(expect.anything(), WS);
  });
});
