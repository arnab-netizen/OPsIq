import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findFirst: vi.fn(), queryRaw: vi.fn(), executeRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(),
  db: { subscription: { findFirst: m.findFirst }, $queryRaw: m.queryRaw, $executeRaw: m.executeRaw },
}));

import { COMMERCIAL_CAPABILITIES as C, decideCommercialCapability } from "@/domain/commercial/commercial-capability";
import {
  assertCommercialCapability,
  assertDiagnosisAllowance,
  canPerformCommercialCapability,
  startupSessionIsFreeJourney,
} from "@/services/billing/commercial-policy.service";

const WS = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;
const tx = { subscription: { findFirst: m.findFirst }, $queryRaw: m.queryRaw, $executeRaw: m.executeRaw } as never;

function sub(status: string, periodEndOffsetDays = 10) {
  m.findFirst.mockResolvedValue({ status, currentPeriodEnd: new Date(Date.now() + periodEndOffsetDays * DAY) });
}
const diagnosisExists = (v: boolean) => m.queryRaw.mockResolvedValue([{ used: v }]);

describe("commercial policy: state matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
  });
  afterEach(() => {
    delete process.env.BILLING_PAYWALL_ENFORCEMENT;
  });

  describe("enforcement OFF (kill switch)", () => {
    it.each(["off", "ON", "true", "1", "", undefined])("value %j allows everything with zero database work", async (v) => {
      if (v === undefined) delete process.env.BILLING_PAYWALL_ENFORCEMENT;
      else process.env.BILLING_PAYWALL_ENFORCEMENT = v;
      for (const cap of Object.values(C)) {
        await expect(assertCommercialCapability(WS, cap)).resolves.toBeUndefined();
      }
      await expect(assertDiagnosisAllowance(tx, WS)).resolves.toBeUndefined();
      expect(m.findFirst).not.toHaveBeenCalled();
      expect(m.queryRaw).not.toHaveBeenCalled();
      expect(m.executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("enforcement ON, no subscription", () => {
    beforeEach(() => m.findFirst.mockResolvedValue(null));

    it("zero diagnoses: the first diagnosis is allowed", async () => {
      diagnosisExists(false);
      expect(await canPerformCommercialCapability(WS, C.FIRST_DIAGNOSIS)).toEqual({ allowed: true, reason: "first_diagnosis_available" });
      await expect(assertDiagnosisAllowance(tx, WS)).resolves.toBeUndefined();
      expect(m.executeRaw).toHaveBeenCalledTimes(1); // workspace advisory lock taken
    });

    it("a diagnosis already exists: the next one is denied with a 402", async () => {
      diagnosisExists(true);
      await expect(assertDiagnosisAllowance(tx, WS)).rejects.toMatchObject({
        statusCode: 402,
        code: "PLAN_LIMIT_EXCEEDED",
        details: { capability: C.SUBSEQUENT_DIAGNOSIS },
      });
    });

    it.each([C.GOVERNED_EXECUTION, C.APPROVAL_RESOLUTION, C.REASSESSMENT, C.CONTINUATION_ACTION, C.SUBSEQUENT_DIAGNOSIS])(
      "%s is denied (even before any diagnosis exists)",
      async (cap) => {
        diagnosisExists(false);
        await expect(assertCommercialCapability(WS, cap)).rejects.toMatchObject({ statusCode: 402, code: "PLAN_LIMIT_EXCEEDED" });
      },
    );
  });

  describe("enforcement ON, subscription states", () => {
    it.each([
      ["active", 10, true],
      ["active (cancel scheduled: still active until period end)", 10, true],
      ["past_due", -3, true], // inside the 7-day grace window
      ["past_due", -30, false], // grace expired
      ["paused", 10, false],
      ["canceled", 10, false],
      ["canceled", -1, false],
    ] as const)("%s (period end %i days) => entitled=%s for continuation", async (label, offset, expected) => {
      sub(label.startsWith("active") ? "active" : label);
      m.findFirst.mockResolvedValue({
        status: label.startsWith("active") ? "active" : label,
        currentPeriodEnd: new Date(Date.now() + offset * DAY),
      });
      diagnosisExists(true);
      const d = await canPerformCommercialCapability(WS, C.GOVERNED_EXECUTION);
      expect(d.allowed).toBe(expected);
      const diag = await canPerformCommercialCapability(WS, C.SUBSEQUENT_DIAGNOSIS);
      expect(diag.allowed).toBe(expected);
    });

    it("paid workspace never runs the diagnosis-existence query or takes the lock", async () => {
      sub("active");
      await expect(assertDiagnosisAllowance(tx, WS)).resolves.toBeUndefined();
      expect(m.queryRaw).not.toHaveBeenCalled();
      expect(m.executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("fail closed", () => {
    it("subscription lookup error denies", async () => {
      m.findFirst.mockRejectedValue(new Error("db down"));
      expect(await canPerformCommercialCapability(WS, C.GOVERNED_EXECUTION)).toEqual({ allowed: false, reason: "entitlement_unverifiable" });
      expect(await canPerformCommercialCapability(WS, C.FIRST_DIAGNOSIS)).toEqual({ allowed: false, reason: "entitlement_unverifiable" });
      await expect(assertDiagnosisAllowance(tx, WS)).rejects.toMatchObject({ statusCode: 402 });
    });

    it("diagnosis-existence lookup error denies the free diagnosis", async () => {
      m.findFirst.mockResolvedValue(null);
      m.queryRaw.mockRejectedValue(new Error("db down"));
      expect(await canPerformCommercialCapability(WS, C.FIRST_DIAGNOSIS)).toEqual({ allowed: false, reason: "entitlement_unverifiable" });
    });
  });

  describe("pure decision", () => {
    it("OFF wins over everything", () => {
      expect(decideCommercialCapability({ capability: C.GOVERNED_EXECUTION, enforced: false, entitled: false, priorDiagnosisCount: 9 }).allowed).toBe(true);
    });
    it("the free allowance only applies to FIRST_DIAGNOSIS", () => {
      expect(decideCommercialCapability({ capability: C.FIRST_DIAGNOSIS, enforced: true, entitled: false, priorDiagnosisCount: 0 }).allowed).toBe(true);
      expect(decideCommercialCapability({ capability: C.FIRST_DIAGNOSIS, enforced: true, entitled: false, priorDiagnosisCount: 1 })).toEqual({ allowed: false, reason: "first_diagnosis_used" });
      expect(decideCommercialCapability({ capability: C.REASSESSMENT, enforced: true, entitled: false, priorDiagnosisCount: 0 })).toEqual({ allowed: false, reason: "subscription_required" });
    });
  });
});

describe("Startup free journey rule (pure)", () => {
  const s = (o: Partial<{ ownerDiagnosisExists: boolean; otherSessionHasAnalysis: boolean; sessionDeliveredRecommendation: boolean }> = {}) =>
    startupSessionIsFreeJourney({ ownerDiagnosisExists: false, otherSessionHasAnalysis: false, sessionDeliveredRecommendation: false, ...o });
  it("the first session is free from its first step until it has delivered its first recommendation", () => {
    expect(s()).toBe(true);
  });
  it("is paid once the session delivered its recommendation (new analysis, rebuilds, reassessment)", () => {
    expect(s({ sessionDeliveredRecommendation: true })).toBe(false);
  });
  it("is paid when another Startup session already holds the free journey (second session, abandoned first)", () => {
    expect(s({ otherSessionHasAnalysis: true })).toBe(false);
  });
  it("is paid from the first step when an owner diagnosis already consumed the workspace allowance", () => {
    expect(s({ ownerDiagnosisExists: true })).toBe(false);
  });
});

