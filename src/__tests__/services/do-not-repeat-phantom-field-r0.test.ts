/**
 * Phase R0 — D1-01: do-not-repeat.service phantom `code` field removal
 *
 * The Finding model has no `code` field. do-not-repeat.service previously
 * selected `code` from finding.findFirst, causing PrismaClientValidationError
 * at runtime. This test verifies the fix: only `impactArea` is selected.
 */
import {
  enforceDoNotRepeatForPromotion,
  recordDoNotRepeat,
  scopeKeyForImpactArea,
  type DnrDeps,
} from "@/services/owner-mode/do-not-repeat.service";

// ── mock audit ───────────────────────────────────────────────────────────────
jest.mock("@/infra/audit", () => ({
  emitAuditEvent: jest.fn().mockResolvedValue("audit-id"),
}));

jest.mock("@/domain/constants/audit-events", () => ({
  AUDIT_EVENTS: {
    OWNER_DO_NOT_REPEAT_BLOCKED: "OWNER_DO_NOT_REPEAT_BLOCKED",
    OWNER_DO_NOT_REPEAT_RECORDED: "OWNER_DO_NOT_REPEAT_RECORDED",
  },
}));

jest.mock("@/domain/owner-mode/do-not-repeat", () => ({
  evaluateDoNotRepeat: jest.fn().mockReturnValue({ blocked: false, reason: null }),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<{
  findingResult: { impactArea: string | null } | null;
  ruleResult: { blocksRepetition: boolean; changedContextExplanation: string | null } | null;
}> = {}): { deps: DnrDeps; findingFindFirst: jest.Mock; ruleCreate: jest.Mock } {
  const findingFindFirst = jest.fn().mockResolvedValue(overrides.findingResult ?? null);
  const ruleCreate = jest.fn().mockResolvedValue({ id: "rule-001" });

  const deps: DnrDeps = {
    db: {
      recommendation: {
        findUnique: jest.fn().mockResolvedValue({ findingId: "finding-001" }),
      },
      finding: {
        findFirst: findingFindFirst,
      },
      ownerDoNotRepeatRule: {
        findFirst: jest.fn().mockResolvedValue(overrides.ruleResult ?? null),
        create: ruleCreate,
      },
    } as unknown as DnrDeps["db"],
  };

  return { deps, findingFindFirst, ruleCreate };
}

// ── unit tests ────────────────────────────────────────────────────────────────

describe("do-not-repeat service — phantom field fix (D1-01)", () => {
  describe("scopeKeyForImpactArea", () => {
    test("returns scoped key for non-empty impactArea", () => {
      expect(scopeKeyForImpactArea("operations")).toBe("scope:operations");
    });

    test("normalises to lowercase", () => {
      expect(scopeKeyForImpactArea("SALES")).toBe("scope:sales");
    });

    test("returns null for null impactArea", () => {
      expect(scopeKeyForImpactArea(null)).toBeNull();
    });

    test("returns null for empty string after trim", () => {
      expect(scopeKeyForImpactArea("   ")).toBeNull();
    });
  });

  describe("finding.findFirst call shape — no phantom code field", () => {
    test("findFirst is called with select: { impactArea: true } only — no code field", async () => {
      const { deps, findingFindFirst } = makeDeps({ findingResult: { impactArea: "operations" } });

      await enforceDoNotRepeatForPromotion("rec-001", "ws-001", deps);

      expect(findingFindFirst).toHaveBeenCalledTimes(1);
      const callArgs = findingFindFirst.mock.calls[0][0];
      // Must include impactArea
      expect(callArgs.select).toHaveProperty("impactArea", true);
      // Must NOT include code — that field does not exist on the Finding model
      expect(callArgs.select).not.toHaveProperty("code");
    });

    test("scope key built from impactArea when finding has impactArea", async () => {
      const { deps } = makeDeps({ findingResult: { impactArea: "finance" } });
      // evaluateDoNotRepeat returns not blocked — no throw expected
      const { evaluateDoNotRepeat } = jest.requireMock("@/domain/owner-mode/do-not-repeat");
      evaluateDoNotRepeat.mockReturnValueOnce({ blocked: false, reason: null });

      await enforceDoNotRepeatForPromotion("rec-001", "ws-001", deps);

      const ruleCall = (deps.db.ownerDoNotRepeatRule.findFirst as jest.Mock).mock.calls[0][0];
      expect(ruleCall.where.memoryKey.in).toContain("scope:finance");
    });

    test("no keys built and no rule lookup when finding is null", async () => {
      const { deps, findingFindFirst } = makeDeps({ findingResult: null });

      await enforceDoNotRepeatForPromotion("rec-001", "ws-001", deps);

      expect(findingFindFirst).toHaveBeenCalledTimes(1);
      expect(deps.db.ownerDoNotRepeatRule.findFirst as jest.Mock).not.toHaveBeenCalled();
    });

    test("no keys built when impactArea is null", async () => {
      const { deps } = makeDeps({ findingResult: { impactArea: null } });

      await enforceDoNotRepeatForPromotion("rec-001", "ws-001", deps);

      // No memoryKeys → no rule lookup
      expect(deps.db.ownerDoNotRepeatRule.findFirst as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe("DoNotRepeatBlockedError", () => {
    test("throws DoNotRepeatBlockedError when rule matches and evaluateDoNotRepeat returns blocked", async () => {
      const { evaluateDoNotRepeat } = jest.requireMock("@/domain/owner-mode/do-not-repeat");
      evaluateDoNotRepeat.mockReturnValueOnce({ blocked: true, reason: "already tried" });

      const { deps } = makeDeps({
        findingResult: { impactArea: "revenue" },
        ruleResult: { blocksRepetition: true, changedContextExplanation: null },
      });

      await expect(
        enforceDoNotRepeatForPromotion("rec-001", "ws-001", deps)
      ).rejects.toMatchObject({ code: "DO_NOT_REPEAT_BLOCKED" });
    });
  });

  describe("recordDoNotRepeat", () => {
    test("creates rule row and emits audit — findFirst not involved", async () => {
      const { deps, findingFindFirst, ruleCreate } = makeDeps();

      await recordDoNotRepeat(
        {
          workspaceId: "ws-001",
          businessId: "biz-001",
          memoryKey: "scope:operations",
          summary: "Failed before",
          reason: "Same approach led to loss",
        },
        deps
      );

      expect(ruleCreate).toHaveBeenCalledTimes(1);
      expect(ruleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: "ws-001",
            memoryKey: "scope:operations",
            blocksRepetition: true,
          }),
        })
      );
      expect(findingFindFirst).not.toHaveBeenCalled();
    });
  });
});
