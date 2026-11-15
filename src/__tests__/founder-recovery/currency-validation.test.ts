import { describe, it, expect } from "vitest";
import { businessCreateSchema, metricSnapshotSchema } from "@/domain/founder-recovery/validation";
import { normalizeBusinessCurrency, SUPPORTED_BUSINESS_CURRENCIES } from "@/domain/founder-recovery/currency";

const base = { name: "Acme", businessType: "generic_local_service" as const };
const snap = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

describe("business currency is a supported canonical code on every write schema", () => {
  it("accepts every supported code", () => {
    for (const c of SUPPORTED_BUSINESS_CURRENCIES) {
      expect(businessCreateSchema.safeParse({ ...base, currency: c }).success).toBe(true);
    }
  });
  it("normalises lowercase / mixed case / padding to the canonical code", () => {
    for (const raw of ["inr", "Inr", "  usd  "]) {
      const r = businessCreateSchema.safeParse({ ...base, currency: raw });
      expect(r.success && r.data.currency).toBe(raw.trim().toUpperCase());
    }
    const s = metricSnapshotSchema.safeParse({ ...snap, currency: "gbp" });
    expect(s.success && s.data.currency).toBe("GBP");
  });
  it.each([["abc1"], ["abcd"], ["12"], ["$"], ["IN"], ["INRX"], ["ABCDEFGHI"], ["   "], [""], ["XXX"], ["ZZZ"], ["I N"]])(
    "rejects %j and names the currency field",
    (raw) => {
      const r = businessCreateSchema.safeParse({ ...base, currency: raw });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "currency")).toBe(true);
      expect(metricSnapshotSchema.safeParse({ ...snap, currency: raw }).success).toBe(false);
    },
  );
  it("rejects a missing or non-string currency", () => {
    expect(businessCreateSchema.safeParse({ ...base }).success).toBe(false);
    expect(businessCreateSchema.safeParse({ ...base, currency: 5 }).success).toBe(false);
    expect(normalizeBusinessCurrency(null)).toBeNull();
  });
});
