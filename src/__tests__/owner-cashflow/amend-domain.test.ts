/**
 * Pure decisions behind the Cashflow bank-balance edit: what counts as a change / a replacement, the strict amend body,
 * the 1e12 ceiling on every Cashflow figure, and the edit screen's draft/confirm/failure classification.
 */
import { describe, it, expect } from "vitest";
import { planCashflowAmend } from "@/domain/owner-cashflow/amend";
import { cashflowSnapshotAmendSchema, cashflowSnapshotCreateSchema } from "@/domain/owner-cashflow/validation";
import { OVERDRAFT_BANK_BALANCE_SENTENCE } from "@/domain/owner-cashflow/overdraft-copy";
import { BANK_BALANCE_COPY, parseQuickAmount } from "@/domain/owner-finance/quick-entry";
import {
  assessCashflowEditDraft,
  classifyCashflowWriteFailure,
  draftFromFigures,
  formatCashflowAmount,
  parseEditParam,
  replacementQuestions,
} from "@/domain/owner-cashflow/edit-flow";

const T0 = "2026-10-01T10:00:00.000Z";

describe("planCashflowAmend", () => {
  it("filling a blank figure is a change that needs NO confirmation", () => {
    const p = planCashflowAmend({ bankBalance: null, cashInHand: 5 }, { bankBalance: 100 });
    expect(p.changes).toEqual([{ field: "bankBalance", before: null, after: 100, replacesRecordedValue: false }]);
    expect(p.needsConfirmation).toBe(false);
    expect(p.noOp).toBe(false);
  });
  it("changing or clearing a recorded figure needs confirmation", () => {
    expect(planCashflowAmend({ bankBalance: 50, cashInHand: null }, { bankBalance: 60 }).needsConfirmation).toBe(true);
    const clear = planCashflowAmend({ bankBalance: 50, cashInHand: null }, { bankBalance: null });
    expect(clear.needsConfirmation).toBe(true);
    expect(clear.changes[0]).toMatchObject({ before: 50, after: null, replacesRecordedValue: true });
  });
  it("the same value, an untouched field and clearing an already-blank field are all no-ops", () => {
    expect(planCashflowAmend({ bankBalance: 50, cashInHand: null }, { bankBalance: 50 }).noOp).toBe(true);
    expect(planCashflowAmend({ bankBalance: 50, cashInHand: null }, {}).noOp).toBe(true);
    expect(planCashflowAmend({ bankBalance: 50, cashInHand: null }, { cashInHand: null }).noOp).toBe(true);
  });
  it("a recorded zero is a recorded value: replacing it needs confirmation, filling a blank with 0 does not", () => {
    expect(planCashflowAmend({ bankBalance: 0, cashInHand: null }, { bankBalance: 10 }).needsConfirmation).toBe(true);
    expect(planCashflowAmend({ bankBalance: null, cashInHand: null }, { bankBalance: 0 }).needsConfirmation).toBe(false);
  });
  it("only fields that differ are reported; a mixed edit still needs confirmation for the replaced one", () => {
    const p = planCashflowAmend({ bankBalance: 50, cashInHand: null }, { bankBalance: 60, cashInHand: 5 });
    expect(p.changes.map((c) => [c.field, c.replacesRecordedValue])).toEqual([["bankBalance", true], ["cashInHand", false]]);
    expect(p.needsConfirmation).toBe(true);
  });
});

describe("cashflowSnapshotAmendSchema / create ceiling", () => {
  const ok = (b: unknown) => cashflowSnapshotAmendSchema.safeParse(b).success;
  it("requires a freshness token and at least one figure", () => {
    expect(ok({ bankBalance: 1 })).toBe(false);
    expect(ok({ expectedUpdatedAt: T0 })).toBe(false);
    expect(ok({ expectedUpdatedAt: T0, confirmReplace: true })).toBe(false);
    expect(ok({ expectedUpdatedAt: T0, bankBalance: 1 })).toBe(true);
    expect(ok({ expectedUpdatedAt: T0, cashInHand: null })).toBe(true);
  });
  it("rejects negative, NaN, Infinity, above-1e12 and non-numeric figures; allows 0 and exactly 1e12", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1e12 + 1, "5", true]) expect(ok({ expectedUpdatedAt: T0, bankBalance: bad }), String(bad)).toBe(false);
    for (const good of [0, 1e12, 0.01]) expect(ok({ expectedUpdatedAt: T0, bankBalance: good }), String(good)).toBe(true);
  });
  it("is strict: period, currency and any other column cannot be sent", () => {
    for (const extra of [{ periodStart: "2026-09-01" }, { periodEnd: "2026-09-30" }, { currency: "USD" }, { receivables: 1 }, { notes: "x" }]) {
      expect(ok({ expectedUpdatedAt: T0, bankBalance: 1, ...extra })).toBe(false);
    }
  });
  it("the create schema now has the same 1e12 ceiling on every figure", () => {
    const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" };
    for (const f of ["bankBalance", "cashInHand", "receivables", "payables", "rentDue", "ownerWithdrawal", "dailyCollections", "taxDue"]) {
      expect(cashflowSnapshotCreateSchema.safeParse({ ...base, [f]: 1e12 + 1 }).success, f).toBe(false);
      expect(cashflowSnapshotCreateSchema.safeParse({ ...base, [f]: 1e12 }).success, f).toBe(true);
      expect(cashflowSnapshotCreateSchema.safeParse({ ...base, [f]: -1 }).success, f).toBe(false);
    }
  });
});

describe("edit screen decisions", () => {
  const current = { bankBalance: 1500, cashInHand: null };
  it("starts from what is recorded (a blank stays blank) and sees an untouched form as unchanged", () => {
    const draft = draftFromFigures(current);
    expect(draft).toEqual({ bankBalance: "1500", cashInHand: "" });
    expect(assessCashflowEditDraft(draft, current).unchanged).toBe(true);
  });
  it("replacing a recorded figure is flagged; filling a blank is not; emptying a recorded figure is a clear", () => {
    expect(assessCashflowEditDraft({ bankBalance: "2000", cashInHand: "" }, current)).toMatchObject({ replacesRecordedValue: true, proposed: { bankBalance: 2000 } });
    expect(assessCashflowEditDraft({ bankBalance: "1500", cashInHand: "10" }, current)).toMatchObject({ replacesRecordedValue: false, proposed: { cashInHand: 10 } });
    expect(assessCashflowEditDraft({ bankBalance: "", cashInHand: "" }, current)).toMatchObject({ replacesRecordedValue: true, proposed: { bankBalance: null } });
  });
  it("owner-typed junk is an inline error and proposes nothing (0 is a real value)", () => {
    expect(assessCashflowEditDraft({ bankBalance: "abc", cashInHand: "" }, current).errors.bankBalance).toBeTruthy();
    expect(assessCashflowEditDraft({ bankBalance: "-5", cashInHand: "" }, current).errors.bankBalance).toBeTruthy();
    expect(assessCashflowEditDraft({ bankBalance: "1e13", cashInHand: "" }, current).errors.bankBalance).toBeTruthy();
    expect(assessCashflowEditDraft({ bankBalance: "1500", cashInHand: "0" }, current).proposed).toEqual({ cashInHand: 0 });
  });
  it("the confirm step names the current and the new value", () => {
    const a = assessCashflowEditDraft({ bankBalance: "2000", cashInHand: "" }, current);
    expect(replacementQuestions(a.changes, "INR")).toEqual(["Replace Bank balance INR 1,500 with INR 2,000?"]);
    const clear = assessCashflowEditDraft({ bankBalance: "", cashInHand: "" }, current);
    expect(replacementQuestions(clear.changes, "INR")).toEqual(["Clear Bank balance (now INR 1,500)?"]);
    expect(replacementQuestions(assessCashflowEditDraft({ bankBalance: "1500", cashInHand: "7" }, current).changes, "INR")).toEqual([]);
  });
  it("shows 'Not recorded' for a blank, never 0", () => {
    expect(formatCashflowAmount(null, "INR")).toBe("Not recorded");
    expect(formatCashflowAmount(0, "INR")).toBe("INR 0");
  });
  it("classifies failures by the server's machine code, never by message text", () => {
    expect(classifyCashflowWriteFailure(409, { code: "CASHFLOW_STALE", error: "x", updatedAt: T0, current: { bankBalance: 9, cashInHand: null } })).toMatchObject({ kind: "STALE", updatedAt: T0, current: { bankBalance: 9, cashInHand: null } });
    expect(classifyCashflowWriteFailure(409, { code: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED", error: "x" }).kind).toBe("CONFIRMATION_REQUIRED");
    expect(classifyCashflowWriteFailure(409, { code: "CASHFLOW_PERIOD_EXISTS", error: "x", snapshotId: "abc", updatedAt: T0 })).toMatchObject({ kind: "PERIOD_EXISTS", snapshotId: "abc" });
    expect(classifyCashflowWriteFailure(409, { error: "This entry changed since you opened it." }).kind).toBe("OTHER"); // text alone decides nothing
    expect(classifyCashflowWriteFailure(500, { error: "boom" }).kind).toBe("OTHER");
    expect(classifyCashflowWriteFailure(409, "garbage").kind).toBe("OTHER");
  });
  it("?edit= is honoured only for a well-formed id", () => {
    expect(parseEditParam("d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7")).toBe("d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7");
    for (const bad of ["", null, undefined, "1", "../x", "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7' OR 1=1"]) expect(parseEditParam(bad as string)).toBeNull();
  });
});

describe("overdraft copy: one sentence, wherever a bank balance is asked for or a negative one refused", () => {
  const SENTENCE = "If your account is overdrawn, leave the bank balance blank and record the overdraft under money owed (debt).";
  it("the shared sentence is the agreed wording", () => expect(OVERDRAFT_BANK_BALANCE_SENTENCE).toBe(SENTENCE));
  it("the Cashflow create and amend schemas refuse a negative bank balance with it (cash in hand keeps the plain message)", () => {
    const create = cashflowSnapshotCreateSchema.safeParse({ periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "GBP", bankBalance: -1, cashInHand: -1 });
    expect(create.success).toBe(false);
    const msgs = new Map((create.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));
    expect(msgs.get("bankBalance")).toContain(SENTENCE);
    expect(msgs.get("cashInHand")).toBe("Value cannot be negative");
    const amend = cashflowSnapshotAmendSchema.safeParse({ expectedUpdatedAt: "2026-10-01T10:00:00.000Z", bankBalance: -5 });
    expect(amend.success).toBe(false);
    expect(amend.error?.issues[0].message).toContain(SENTENCE);
  });
  it("the quick-entry bank hint and negative bank message carry it; other figures keep 'Enter 0 if there was none'", () => {
    expect(BANK_BALANCE_COPY.hint).toContain(SENTENCE);
    expect(parseQuickAmount("-5", { bankBalance: true })).toMatchObject({ kind: "invalid", message: expect.stringContaining(SENTENCE) });
    expect(parseQuickAmount("-5")).toEqual({ kind: "invalid", message: "This can't be negative. Enter 0 if there was none." });
    expect(assessCashflowEditDraft({ bankBalance: "-5", cashInHand: "" }, { bankBalance: null, cashInHand: null }).errors.bankBalance).toContain(SENTENCE);
  });
});
