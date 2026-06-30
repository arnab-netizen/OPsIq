/**
 * Real input paths — parser + manual-entry + structured-import (DI mock-db, no live DB).
 * Proves: manual entry updates confidence; structured import updates confidence; malformed rejected;
 * cross-business rejected; cross-workspace rejected; category classified; UI status (suppliedAfter)
 * reflects updated data; the DB/provider path mapping (rowsToSuppliedCategories) reflects confirmed
 * intakes. (The live DB/provider path itself is exercised by the [db] suites.)
 */
import { describe, it, expect, vi } from "vitest";
import { parseInputRecord, intakeDomainToCategory } from "@/domain/owner-mode/input-record-parser";
import {
  submitManualEntry,
  submitStructuredImport,
  planManualEntry,
  type ManualEntryDeps,
} from "@/services/owner-mode/owner-manual-entry.service";
import { rowsToSuppliedCategories } from "@/services/owner-mode/owner-onboarding.service";
import type { OwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import type { OwnerInputRecord } from "@/domain/owner-mode/input-record-parser";

const WS = "11111111-1111-1111-1111-111111111111";
const BIZ = "22222222-2222-2222-2222-222222222222";

function record(over: Partial<OwnerInputRecord> = {}): OwnerInputRecord {
  return {
    workspaceId: WS,
    businessId: BIZ,
    category: "revenue_sales",
    source: "manual",
    fields: { revenue: 120000 },
    ...over,
  };
}

function depsWith(priorSupplied: OwnerInputRecord["category"][], createSpy = vi.fn().mockResolvedValue({ id: "intake-1" })): ManualEntryDeps {
  return {
    db: {
      ownerBusiness: { findFirst: vi.fn().mockResolvedValue({ id: BIZ }) },
      ownerDataIntake: { create: createSpy },
    },
    now: new Date("2026-06-30T00:00:00Z"),
    actorId: "actor-1",
    loadContext: vi.fn().mockResolvedValue({ business: { businessType: "Laundry & dry cleaning", operatingModel: "owner_operated" }, priorSupplied }),
    emitAudit: vi.fn().mockResolvedValue(undefined),
  };
}

describe("input record parser", () => {
  it("classifies the category and normalizes fields for a valid record", () => {
    const r = parseInputRecord(record(), { workspaceId: WS, businessId: BIZ });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.category).toBe("revenue_sales");
      expect(r.normalizedFields.revenue).toBe(120000);
      expect(r.rowCount).toBe(1);
    }
  });

  it("rejects a malformed record (no usable fields / bad types / negative amounts)", () => {
    expect(parseInputRecord(record({ fields: {} }), { workspaceId: WS, businessId: BIZ }).ok).toBe(false);
    expect(parseInputRecord(record({ fields: { revenue: Number.NaN } }), { workspaceId: WS, businessId: BIZ }).ok).toBe(false);
    expect(parseInputRecord(record({ fields: { revenue: -5 } }), { workspaceId: WS, businessId: BIZ }).ok).toBe(false);
    expect(parseInputRecord(record({ category: "not_a_category" as never }), { workspaceId: WS, businessId: BIZ }).ok).toBe(false);
    expect(parseInputRecord(null, { workspaceId: WS, businessId: BIZ }).ok).toBe(false);
  });

  it("rejects cross-workspace and cross-business records with the correct rejection class", () => {
    const xw = parseInputRecord(record({ workspaceId: "99999999-9999-9999-9999-999999999999" }), { workspaceId: WS, businessId: BIZ });
    expect(xw.ok).toBe(false);
    if (!xw.ok) expect(xw.rejection).toBe("cross_workspace");

    const xb = parseInputRecord(record({ businessId: "88888888-8888-8888-8888-888888888888" }), { workspaceId: WS, businessId: BIZ });
    expect(xb.ok).toBe(false);
    if (!xb.ok) expect(xb.rejection).toBe("cross_business");
  });
});

describe("manual entry path", () => {
  it("manual entry persists, audits, and updates confidence when relevant data is supplied", async () => {
    // Prior: everything except revenue → low. Supplying revenue (relevant critical) → improves.
    const deps = depsWith(["expenses", "cash_debt", "equipment_logs", "fixed_costs"]);
    const res = await submitManualEntry({ workspaceId: WS, businessId: BIZ, record: record() }, deps);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.category).toBe("revenue_sales");
      expect(res.confirmed).toBe(true);
      expect(res.confidenceImproved).toBe(true);
      expect(res.suppliedAfter).toContain("revenue_sales");
    }
    expect(deps.db.ownerDataIntake.create).toHaveBeenCalledOnce();
    expect(deps.emitAudit).toHaveBeenCalledOnce();
  });

  it("rejects when the business does not exist in the workspace (isolation past the parser)", async () => {
    const deps = depsWith([]);
    (deps.db.ownerBusiness.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await submitManualEntry({ workspaceId: WS, businessId: BIZ, record: record() }, deps);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rejection).toBe("business_not_found");
    expect(deps.db.ownerDataIntake.create).not.toHaveBeenCalled();
  });

  it("a malformed record never reaches the DB", async () => {
    const deps = depsWith([]);
    const res = await submitManualEntry({ workspaceId: WS, businessId: BIZ, record: record({ fields: { revenue: -1 } }) }, deps);
    expect(res.ok).toBe(false);
    expect(deps.db.ownerDataIntake.create).not.toHaveBeenCalled();
  });

  it("an unconfirmed entry does NOT yet raise confidence (governed import staging)", () => {
    const parsed = parseInputRecord(record(), { workspaceId: WS, businessId: BIZ });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const confirmed = planManualEntry(parsed, { businessType: "Laundry" }, ["expenses", "cash_debt", "equipment_logs", "fixed_costs"], true);
      const staged = planManualEntry(parsed, { businessType: "Laundry" }, ["expenses", "cash_debt", "equipment_logs", "fixed_costs"], false);
      expect(confirmed.confidenceImproved).toBe(true);
      expect(staged.confidenceImproved).toBe(false);
    }
  });
});

describe("structured import path", () => {
  it("imports valid records, rejects malformed ones, and updates confidence on confirmed records", async () => {
    // Prior is missing exactly one relevant critical (expenses); importing it raises confidence.
    const deps = depsWith(["revenue_sales", "cash_debt", "equipment_logs", "fixed_costs"]);
    const records: OwnerInputRecord[] = [
      record({ category: "expenses", fields: { costOfGoods: 40000 } }),
      record({ category: "marketing", fields: { marketingSpend: 5000 } }),
      record({ category: "revenue_sales", fields: { revenue: -1 } }), // malformed
    ];
    const res = await submitStructuredImport({ workspaceId: WS, businessId: BIZ, records, confirm: true }, deps);
    expect(res.acceptedCount).toBe(2);
    expect(res.rejectedCount).toBe(1);
    expect(res.rejected[0].index).toBe(2);
    // At least one accepted record reports a confidence improvement.
    expect(res.accepted.some((a) => a.ok && a.confidenceImproved)).toBe(true);
  });
});

describe("DB/provider path reflects confirmed intakes", () => {
  function rows(partial: Partial<OwnerDomainRows>): OwnerDomainRows {
    return {
      cashflow: null, finance: null, wcItems: [], capacity: null, compliance: [],
      proofs: [], workload: null, standingCount: 0, business: null, learningCount: 0,
      ...partial,
    } as OwnerDomainRows;
  }
  it("a confirmed intake's targetDomain becomes a supplied category in the read path", () => {
    const supplied = rowsToSuppliedCategories(rows({ confirmedIntakeDomains: ["b2b_contracts", "complaints_reviews"] }));
    expect(supplied).toContain("b2b_contracts");
    expect(supplied).toContain("complaints_reviews");
  });
  it("intakeDomainToCategory ignores unknown domains (no inflation from junk)", () => {
    expect(intakeDomainToCategory("totally_unknown")).toBeNull();
    expect(intakeDomainToCategory(null)).toBeNull();
    expect(intakeDomainToCategory("revenue_sales")).toBe("revenue_sales");
  });
});
