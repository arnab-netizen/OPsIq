import { describe, it, expect } from "vitest";
import {
  QBO_IMPORT_NOTE,
  classifyCashflowRow,
  classifyFinanceChain,
  type FinanceVersionInput,
} from "@/services/privacy-erasure/qbo-erasure-classify";

const six = (o: Partial<Record<string, number | null>> = {}) => ({
  revenue: null, cost_of_goods: null, receivables: null, overdue_receivables: null, payables: null, overdue_payables: null, ...o,
});
const v = (o: Partial<FinanceVersionInput> & { id: string; version: number }): FinanceVersionInput => ({
  supersededById: null, changedFields: null, values: six(), notes: null, hasProvenance: false, ...o,
});

describe("QBO erasure — finance chain authorship (pure)", () => {
  it("a chain whose every version has QuickBooks provenance is QuickBooks-controlled: the whole chain is deleted", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10, receivables: 5 }), notes: QBO_IMPORT_NOTE }),
      v({ id: "b", version: 2, hasProvenance: true, changedFields: ["revenue"], values: six({ revenue: 12, receivables: 5 }) }),
    ]);
    expect(plan).toMatchObject({ mode: "DELETE_CHAIN", currentId: "b", deleteVersionIds: ["a", "b"] });
  });

  it("owner-amended: the owner's re-stated figure is kept, every other QuickBooks figure and the import note are removed, older versions deleted", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10, cost_of_goods: 4, receivables: 5 }), notes: QBO_IMPORT_NOTE }),
      v({ id: "b", version: 2, changedFields: ["revenue", "evidenceQuality"], values: { ...six({ revenue: 99, cost_of_goods: 4, receivables: 5 }), rent: 7 }, notes: QBO_IMPORT_NOTE }),
    ]);
    expect(plan).toMatchObject({ mode: "SCRUB_CURRENT", currentId: "b", deleteVersionIds: ["a"], clearNotes: true, deleteCurrent: false });
    if (plan.mode !== "SCRUB_CURRENT") throw new Error("unreachable");
    expect([...plan.nullColumns].sort()).toEqual(["cost_of_goods", "receivables"]);
    expect(plan.retainedOwnerColumns.sort()).toEqual(["rent", "revenue"]);
  });

  it("an owner who re-states a QuickBooks figure with the SAME number still owns it (explicit act); an untouched figure stays QuickBooks'", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10, payables: 3 }) }),
      v({ id: "b", version: 2, changedFields: ["revenue"], values: six({ revenue: 10, payables: 3 }) }),
    ]);
    if (plan.mode !== "SCRUB_CURRENT") throw new Error("expected scrub");
    expect(plan.nullColumns).toEqual(["payables"]);
    expect(plan.retainedOwnerColumns).toContain("revenue");
  });

  it("FAILS CLOSED: an amendment with unreadable lineage touches nothing, so inherited QuickBooks figures are removed", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10 }) }),
      v({ id: "b", version: 2, changedFields: null, values: six({ revenue: 10 }) }),
    ]);
    if (plan.mode !== "SCRUB_CURRENT") throw new Error("expected scrub");
    expect(plan.nullColumns).toEqual(["revenue"]);
    expect(plan.deleteCurrent).toBe(true); // nothing independently supportable remains
  });

  it("nothing owner-authored left after scrubbing -> the empty current version is deleted too", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10 }), notes: QBO_IMPORT_NOTE }),
      v({ id: "b", version: 2, changedFields: ["notes"], values: six({ revenue: 10 }), notes: QBO_IMPORT_NOTE }),
    ]);
    if (plan.mode !== "SCRUB_CURRENT") throw new Error("expected scrub");
    expect(plan.deleteCurrent).toBe(true);
  });

  it("an owner-typed note is retained even if the figures are all QuickBooks'", () => {
    const plan = classifyFinanceChain([
      v({ id: "a", version: 1, supersededById: "b", hasProvenance: true, values: six({ revenue: 10 }) }),
      v({ id: "b", version: 2, changedFields: ["notes"], values: six({ revenue: 10 }), notes: "my own remark" }),
    ]);
    if (plan.mode !== "SCRUB_CURRENT") throw new Error("expected scrub");
    expect(plan.deleteCurrent).toBe(false);
    expect(plan.clearNotes).toBe(false);
  });

  it("anomalies are reported, never guessed", () => {
    expect(classifyFinanceChain([])).toMatchObject({ mode: "ANOMALY", code: "EMPTY_CHAIN" });
    expect(classifyFinanceChain([v({ id: "a", version: 1 })])).toMatchObject({ mode: "ANOMALY", code: "NO_PROVENANCE" });
    expect(classifyFinanceChain([v({ id: "a", version: 1, hasProvenance: true }), v({ id: "b", version: 2, hasProvenance: true })])).toMatchObject({ mode: "ANOMALY", code: "NO_UNIQUE_HEAD" });
  });
});

describe("QBO erasure — cashflow authorship (pure)", () => {
  const base = { id: "c", notes: QBO_IMPORT_NOTE };
  it("untouched since QuickBooks' last stamp: the whole row is QuickBooks'", () => {
    expect(classifyCashflowRow({ ...base, updatedAtMs: 1000, latestStampMs: 1000, values: { bank_balance: 5 } })).toEqual({ mode: "DELETE_ROW", id: "c" });
  });
  it("written since: QuickBooks columns are removed, the owner's other columns stay", () => {
    const plan = classifyCashflowRow({ ...base, updatedAtMs: 2000, latestStampMs: 1000, values: { bank_balance: 5, receivables: 2, rent_due: 9 } });
    expect(plan).toMatchObject({ mode: "SCRUB_ROW", clearNotes: true, deleteRow: false, retainedOwnerColumns: ["rent_due"] });
    if (plan.mode === "SCRUB_ROW") expect([...plan.nullColumns].sort()).toEqual(["bank_balance", "receivables"]);
  });
  it("written since but nothing of the owner's remains: the row is deleted", () => {
    const plan = classifyCashflowRow({ ...base, updatedAtMs: 2000, latestStampMs: 1000, values: { bank_balance: 5 } });
    expect(plan).toMatchObject({ mode: "SCRUB_ROW", deleteRow: true });
  });
  it("a missing stamp is never treated as untouched", () => {
    expect(classifyCashflowRow({ ...base, updatedAtMs: 1000, latestStampMs: null, values: { bank_balance: 5 } }).mode).toBe("SCRUB_ROW");
  });
});
