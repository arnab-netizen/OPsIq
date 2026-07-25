/**
 * Jarvis 360 Slice 14 — compliance boundary (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { classifyComplianceRisk, isExpiringSoon, isExpired, COMPLIANCE_DISCLAIMER } from "@/domain/owner-mode/compliance-boundary";
import { recordComplianceItem, getComplianceReviewItems, type ComplianceDeps } from "@/services/owner-mode/compliance.service";

const NOW = new Date("2026-06-28T00:00:00Z");
beforeEach(() => emitAuditEvent.mockClear());

describe("compliance boundary — module contract assertions", () => {
  it("classifyComplianceRisk is a function", () => { expect(typeof classifyComplianceRisk).toBe("function"); });
  it("isExpiringSoon is a function", () => { expect(typeof isExpiringSoon).toBe("function"); });
  it("isExpired is a function", () => { expect(typeof isExpired).toBe("function"); });
  it("COMPLIANCE_DISCLAIMER is a string", () => { expect(typeof COMPLIANCE_DISCLAIMER).toBe("string"); });
  it("COMPLIANCE_DISCLAIMER is non-empty", () => { expect(COMPLIANCE_DISCLAIMER.length).toBeGreaterThan(0); });
  it("recordComplianceItem is a function", () => { expect(typeof recordComplianceItem).toBe("function"); });
  it("getComplianceReviewItems is a function", () => { expect(typeof getComplianceReviewItems).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW).toBeInstanceOf(Date); });
  it("classifyComplianceRisk({}) returns an object", () => { expect(typeof classifyComplianceRisk({})).toBe("object"); });
  it("classifyComplianceRisk({}).classification is 'informational'", () => { expect(classifyComplianceRisk({}).classification).toBe("informational"); });
  it("classifyComplianceRisk({}).blocked is false", () => { expect(classifyComplianceRisk({}).blocked).toBe(false); });
  it("classifyComplianceRisk({ expiryPassed: true }).blocked is true", () => { expect(classifyComplianceRisk({ expiryPassed: true }).blocked).toBe(true); });
  it("isExpired with past date returns true", () => { expect(isExpired(new Date("2026-01-01Z"), NOW)).toBe(true); });
  it("isExpired with future date returns false", () => { expect(isExpired(new Date("2027-01-01Z"), NOW)).toBe(false); });
});

describe("classifyComplianceRisk", () => {
  it("blocks until review when a document has expired", () => {
    const r = classifyComplianceRisk({ expiryPassed: true });
    expect(r.classification).toBe("blocked_until_review");
    expect(r.blocked).toBe(true);
  });
  it("requires professional review for contract/tax/staff-sensitive", () => {
    expect(classifyComplianceRisk({ contractOrLegalRisk: true }).professionalReviewRequired).toBe(true);
    expect(classifyComplianceRisk({ taxImpact: true }).professionalReviewRequired).toBe(true);
    expect(classifyComplianceRisk({ staffSensitive: true }).professionalReviewRequired).toBe(true);
  });
  it("cautions on advertising/privacy/expiring-soon, never definitive", () => {
    const r = classifyComplianceRisk({ advertisingClaim: true, dataPrivacy: true, expiringSoon: true });
    expect(r.classification).toBe("caution");
    expect(r.disclaimer).toBe(COMPLIANCE_DISCLAIMER);
  });
  it("is informational with no flags", () => {
    expect(classifyComplianceRisk({}).classification).toBe("informational");
  });
});

describe("expiry helpers", () => {
  it("detects expired and expiring-soon", () => {
    expect(isExpired(new Date("2026-06-01Z"), NOW)).toBe(true);
    expect(isExpired(new Date("2026-12-01Z"), NOW)).toBe(false);
    expect(isExpiringSoon(new Date("2026-07-10Z"), NOW, 30)).toBe(true);
    expect(isExpiringSoon(new Date("2026-12-01Z"), NOW, 30)).toBe(false);
  });
});

function makeDeps(rows: Array<{ id: string; kind: string; name: string; expiresAt: Date | null; createdAt?: Date }>) {
  const create = vi.fn(async () => ({ id: "c1" }));
  const deps: ComplianceDeps = { now: () => NOW, db: { ownerComplianceItem: { create, findMany: vi.fn(async () => rows) } } };
  return { deps, create };
}

describe("compliance service (DI)", () => {
  it("records an item + audits", async () => {
    const { deps, create } = makeDeps([]);
    const id = await recordComplianceItem({ workspaceId: "ws1", kind: "licence", name: "Trade licence", actorId: "u1" }, deps);
    expect(id).toBe("c1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("lists expired and expiring-soon items for review", async () => {
    const ts = new Date("2026-01-01Z");
    const { deps } = makeDeps([
      { id: "a", kind: "licence", name: "L", expiresAt: new Date("2026-06-01Z"), createdAt: ts },
      { id: "b", kind: "insurance", name: "I", expiresAt: new Date("2026-07-10Z"), createdAt: ts },
      { id: "c", kind: "permit", name: "P", expiresAt: new Date("2027-01-01Z"), createdAt: ts },
    ]);
    const items = await getComplianceReviewItems("ws1", deps);
    expect(items.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(items.find((i) => i.id === "a")!.state).toBe("expired");
    expect(items.find((i) => i.id === "b")!.state).toBe("expiring_soon");
  });
});
