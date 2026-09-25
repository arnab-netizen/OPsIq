import { describe, expect, it } from "vitest";
import { validateQboWrite, type QboResolvedRef, type QboValidationContext } from "@/domain/quickbooks/qbo-accounting-validation";
import type { QboEntityName } from "@/domain/quickbooks/qbo-entities";

const ACTIVE: QboResolvedRef = { active: true };
const INACTIVE: QboResolvedRef = { active: false };

function makeCtx(overrides: Partial<QboValidationContext> = {}): QboValidationContext {
  const registry = new Map<string, QboResolvedRef>([
    ["Customer:1", ACTIVE],
    ["Customer:99", INACTIVE],
    ["Vendor:1", ACTIVE],
    ["Item:1", ACTIVE],
    ["Item:99", INACTIVE],
    ["Account:100", { active: true, accountType: "Bank" }],
    ["Account:200", { active: true, accountType: "Accounts Receivable" }],
    ["Account:201", { active: true, accountType: "Accounts Payable" }],
    ["Account:300", { active: true, accountType: "Expense" }],
    ["Account:301", { active: true, accountType: "Expense" }],
  ]);
  return {
    homeCurrency: "USD",
    multiCurrencyEnabled: false,
    resolveRef: (entity: QboEntityName, id: string) => registry.get(`${entity}:${id}`) ?? null,
    ...overrides,
  };
}

describe("validateQboWrite — Customer/Vendor", () => {
  it("accepts a valid Customer", () => {
    const result = validateQboWrite("Customer", "create", { DisplayName: "Acme Corp" }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects a missing DisplayName", () => {
    const result = validateQboWrite("Customer", "create", {}, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("DisplayName"))).toBe(true);
  });

  it("rejects a DisplayName containing ':'", () => {
    const result = validateQboWrite("Vendor", "create", { DisplayName: "Acme:Corp" }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects a DisplayName over 500 characters", () => {
    const result = validateQboWrite("Customer", "create", { DisplayName: "x".repeat(501) }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid email address", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", PrimaryEmailAddr: { Address: "not-an-email" } },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a valid email address", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", PrimaryEmailAddr: { Address: "owner@acme.com" } },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateQboWrite — Invoice", () => {
  const validLine = { Amount: 100, SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 2, UnitPrice: 50 } };

  it("accepts a valid Invoice", () => {
    const result = validateQboWrite("Invoice", "create", { CustomerRef: { value: "1" }, Line: [validLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("accepts an Invoice with NO TotalAmt at all — QBO computes it from lines", () => {
    const result = validateQboWrite("Invoice", "create", { CustomerRef: { value: "1" }, Line: [validLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("accepts an Invoice whose supplied TotalAmt matches the sum of its lines", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      { CustomerRef: { value: "1" }, TotalAmt: 100, Line: [validLine] },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an Invoice whose supplied TotalAmt does not match the sum of its lines", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      { CustomerRef: { value: "1" }, TotalAmt: 999, Line: [validLine] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not equal the sum of line Amounts"))).toBe(true);
  });

  it("rejects a missing CustomerRef", () => {
    const result = validateQboWrite("Invoice", "create", { Line: [validLine] }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("CustomerRef"))).toBe(true);
  });

  it("rejects an Invoice with no SalesItemLineDetail lines", () => {
    const result = validateQboWrite("Invoice", "create", { CustomerRef: { value: "1" }, Line: [] }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects a line missing ItemRef", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      { CustomerRef: { value: "1" }, Line: [{ Amount: 100, SalesItemLineDetail: { Qty: 1, UnitPrice: 100 } }] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects Amount that does not equal Qty * UnitPrice", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      {
        CustomerRef: { value: "1" },
        Line: [{ Amount: 999, SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 2, UnitPrice: 50 } }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not equal Qty"))).toBe(true);
  });

  it("rejects a negative line Amount", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      { CustomerRef: { value: "1" }, Line: [{ Amount: -5, SalesItemLineDetail: { ItemRef: { value: "1" } } }] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive ItemRef", () => {
    const result = validateQboWrite(
      "Invoice",
      "create",
      { CustomerRef: { value: "1" }, Line: [{ Amount: 100, SalesItemLineDetail: { ItemRef: { value: "99" } } }] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("inactive Item"))).toBe(true);
  });

  it("rejects an inactive CustomerRef", () => {
    const result = validateQboWrite("Invoice", "create", { CustomerRef: { value: "99" }, Line: [validLine] }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("inactive Customer"))).toBe(true);
  });

  it("rejects a CustomerRef that does not resolve at all", () => {
    const result = validateQboWrite("Invoice", "create", { CustomerRef: { value: "404" }, Line: [validLine] }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not exist"))).toBe(true);
  });
});

describe("validateQboWrite — Bill / PurchaseOrder", () => {
  const accountLine = { Amount: 250, AccountBasedExpenseLineDetail: { AccountRef: { value: "300" } } };
  const itemLine = { Amount: 50, ItemBasedExpenseLineDetail: { ItemRef: { value: "1" } } };

  it("accepts a Bill with an account-based line", () => {
    const result = validateQboWrite("Bill", "create", { VendorRef: { value: "1" }, TotalAmt: 250, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("accepts a Bill with an item-based line", () => {
    const result = validateQboWrite("Bill", "create", { VendorRef: { value: "1" }, TotalAmt: 50, Line: [itemLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects a Bill whose TotalAmt does not match the sum of its lines", () => {
    const result = validateQboWrite("Bill", "create", { VendorRef: { value: "1" }, TotalAmt: 0, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not equal the sum of line Amounts"))).toBe(true);
  });

  it("rejects a Bill missing VendorRef", () => {
    const result = validateQboWrite("Bill", "create", { TotalAmt: 250, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("accepts a Bill with NO TotalAmt at all — QBO computes it from lines", () => {
    const result = validateQboWrite("Bill", "create", { VendorRef: { value: "1" }, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects a Bill with a negative TotalAmt even when supplied alone", () => {
    const result = validateQboWrite("Bill", "create", { VendorRef: { value: "1" }, TotalAmt: -5, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("accepts a PurchaseOrder without an APAccountRef (optional)", () => {
    const result = validateQboWrite("PurchaseOrder", "create", { VendorRef: { value: "1" }, Line: [accountLine] }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects a PurchaseOrder with an inactive APAccountRef", () => {
    const ctx = makeCtx();
    const result = validateQboWrite(
      "PurchaseOrder",
      "create",
      { VendorRef: { value: "1" }, Line: [accountLine], APAccountRef: { value: "999" } },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a PurchaseOrder whose TotalAmt matches its lines, and rejects a mismatch", () => {
    const matching = validateQboWrite("PurchaseOrder", "create", { VendorRef: { value: "1" }, TotalAmt: 250, Line: [accountLine] }, makeCtx());
    expect(matching.ok).toBe(true);
    const mismatched = validateQboWrite("PurchaseOrder", "create", { VendorRef: { value: "1" }, TotalAmt: 1, Line: [accountLine] }, makeCtx());
    expect(mismatched.ok).toBe(false);
  });

  it("accepts a VendorCredit whose TotalAmt matches its lines, and rejects a mismatch", () => {
    const matching = validateQboWrite("VendorCredit", "create", { VendorRef: { value: "1" }, TotalAmt: 250, Line: [accountLine] }, makeCtx());
    expect(matching.ok).toBe(true);
    const mismatched = validateQboWrite("VendorCredit", "create", { VendorRef: { value: "1" }, TotalAmt: 1, Line: [accountLine] }, makeCtx());
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) expect(mismatched.issues.some((i) => i.includes("does not equal the sum of line Amounts"))).toBe(true);
  });

  it("accepts a Purchase (card/cash) whose TotalAmt matches its lines, and rejects a mismatch", () => {
    const base = { AccountRef: { value: "300" }, PaymentType: "Cash", Line: [accountLine] };
    const matching = validateQboWrite("Purchase", "create", { ...base, TotalAmt: 250 }, makeCtx());
    expect(matching.ok).toBe(true);
    const mismatched = validateQboWrite("Purchase", "create", { ...base, TotalAmt: 1 }, makeCtx());
    expect(mismatched.ok).toBe(false);
    const noTotal = validateQboWrite("Purchase", "create", base, makeCtx());
    expect(noTotal.ok).toBe(true);
  });

  it("accepts a Deposit whose TotalAmt matches its lines, and rejects a mismatch", () => {
    const base = { DepositToAccountRef: { value: "100" }, Line: [{ Amount: 250 }] };
    const matching = validateQboWrite("Deposit", "create", { ...base, TotalAmt: 250 }, makeCtx());
    expect(matching.ok).toBe(true);
    const mismatched = validateQboWrite("Deposit", "create", { ...base, TotalAmt: 1 }, makeCtx());
    expect(mismatched.ok).toBe(false);
    const noTotal = validateQboWrite("Deposit", "create", base, makeCtx());
    expect(noTotal.ok).toBe(true);
  });
});

describe("validateQboWrite — Payment (partial and over allocation)", () => {
  it("accepts a fully-allocated Payment linked to an Invoice", () => {
    const result = validateQboWrite(
      "Payment",
      "create",
      {
        CustomerRef: { value: "1" },
        TotalAmt: 100,
        Line: [{ Amount: 100, LinkedTxn: [{ TxnId: "55", TxnType: "Invoice" }] }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a partial allocation (sum of lines < TotalAmt)", () => {
    const result = validateQboWrite(
      "Payment",
      "create",
      {
        CustomerRef: { value: "1" },
        TotalAmt: 500,
        Line: [{ Amount: 300, LinkedTxn: [{ TxnId: "55", TxnType: "Invoice" }] }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an over-allocated Payment (sum of lines > TotalAmt)", () => {
    const result = validateQboWrite(
      "Payment",
      "create",
      {
        CustomerRef: { value: "1" },
        TotalAmt: 100,
        Line: [{ Amount: 60, LinkedTxn: [{ TxnId: "1", TxnType: "Invoice" }] }, { Amount: 60, LinkedTxn: [{ TxnId: "2", TxnType: "Invoice" }] }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("exceeds TotalAmt"))).toBe(true);
  });

  it("rejects a LinkedTxn with an unsupported TxnType", () => {
    const result = validateQboWrite(
      "Payment",
      "create",
      { CustomerRef: { value: "1" }, TotalAmt: 100, Line: [{ Amount: 100, LinkedTxn: [{ TxnId: "1", TxnType: "Bill" }] }] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive TotalAmt", () => {
    const result = validateQboWrite("Payment", "create", { CustomerRef: { value: "1" }, TotalAmt: 0, Line: [] }, makeCtx());
    expect(result.ok).toBe(false);
  });
});

describe("validateQboWrite — BillPayment", () => {
  it("accepts PayType Check with CheckPayment.BankAccountRef", () => {
    const result = validateQboWrite(
      "BillPayment",
      "create",
      {
        VendorRef: { value: "1" },
        TotalAmt: 250,
        PayType: "Check",
        CheckPayment: { BankAccountRef: { value: "100" } },
        Line: [{ Amount: 250, LinkedTxn: [{ TxnId: "1", TxnType: "Bill" }] }],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects PayType Check missing CheckPayment.BankAccountRef", () => {
    const result = validateQboWrite(
      "BillPayment",
      "create",
      { VendorRef: { value: "1" }, TotalAmt: 250, PayType: "Check", Line: [] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts PayType CreditCard with CreditCardPayment.CCAccountRef", () => {
    const ctx = makeCtx();
    const result = validateQboWrite(
      "BillPayment",
      "create",
      {
        VendorRef: { value: "1" },
        TotalAmt: 250,
        PayType: "CreditCard",
        CreditCardPayment: { CCAccountRef: { value: "100" } },
        Line: [{ Amount: 250, LinkedTxn: [{ TxnId: "1", TxnType: "Bill" }] }],
      },
      ctx,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unrecognized PayType", () => {
    const result = validateQboWrite("BillPayment", "create", { VendorRef: { value: "1" }, TotalAmt: 100, PayType: "Cash" }, makeCtx());
    expect(result.ok).toBe(false);
  });
});

describe("validateQboWrite — JournalEntry", () => {
  it("accepts a balanced JournalEntry", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } },
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unbalanced JournalEntry", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } },
          { Amount: 90, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not balance"))).toBe(true);
  });

  it("balances correctly despite the classic 0.1 + 0.2 float trap", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in raw float arithmetic; integer-cent
    // comparison must still treat this as balanced.
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 0.1, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } },
          { Amount: 0.2, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } },
          { Amount: 0.3, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects fewer than 2 lines", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      { Line: [{ Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } }] },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a line posting to Accounts Receivable without Entity Type Customer + EntityRef", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "200" } } },
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("Accounts Receivable"))).toBe(true);
  });

  it("accepts a line posting to Accounts Receivable WITH Entity Type Customer + EntityRef", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          {
            Amount: 100,
            JournalEntryLineDetail: {
              PostingType: "Debit",
              AccountRef: { value: "200" },
              Entity: { Type: "Customer", EntityRef: { value: "1" } },
            },
          },
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a line posting to Accounts Payable with Entity Type Customer instead of Vendor", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "300" } } },
          {
            Amount: 100,
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { value: "201" },
              Entity: { Type: "Customer", EntityRef: { value: "1" } },
            },
          },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive AccountRef", () => {
    const result = validateQboWrite(
      "JournalEntry",
      "create",
      {
        Line: [
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "999" } } },
          { Amount: 100, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "301" } } },
        ],
      },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateQboWrite — multicurrency", () => {
  it("rejects a foreign CurrencyRef when multicurrency is disabled", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", CurrencyRef: { value: "EUR" } },
      makeCtx({ multiCurrencyEnabled: false, homeCurrency: "USD" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts the home currency when multicurrency is disabled", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", CurrencyRef: { value: "USD" } },
      makeCtx({ multiCurrencyEnabled: false, homeCurrency: "USD" }),
    );
    expect(result.ok).toBe(true);
  });

  it("requires a positive ExchangeRate when CurrencyRef differs from home and multicurrency is enabled", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", CurrencyRef: { value: "EUR" } },
      makeCtx({ multiCurrencyEnabled: true, homeCurrency: "USD" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a foreign CurrencyRef with a positive ExchangeRate when multicurrency is enabled", () => {
    const result = validateQboWrite(
      "Customer",
      "create",
      { DisplayName: "Acme", CurrencyRef: { value: "EUR" }, ExchangeRate: 1.08 },
      makeCtx({ multiCurrencyEnabled: true, homeCurrency: "USD" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateQboWrite — TxnTaxDetail pass-through", () => {
  it("does not reject or alter a body carrying TxnTaxDetail (OpsIQ does not compute tax)", () => {
    const body = {
      CustomerRef: { value: "1" },
      Line: [{ Amount: 100, SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 1, UnitPrice: 100 } }],
      TxnTaxDetail: { TotalTax: 8.5, TaxLine: [{ Amount: 8.5, TaxLineDetail: { TaxRateRef: { value: "5" } } }] },
    };
    const result = validateQboWrite("Invoice", "create", body, makeCtx());
    expect(result.ok).toBe(true);
    // The input object itself must be untouched — no mutation of TxnTaxDetail.
    expect(body.TxnTaxDetail.TotalTax).toBe(8.5);
  });
});

describe("validateQboWrite — delete/void/inactivate and unsupported operations", () => {
  it("accepts a well-formed delete ref", () => {
    const result = validateQboWrite("Bill", "delete", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects delete missing SyncToken", () => {
    const result = validateQboWrite("Bill", "delete", { Id: "1" }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects delete for a name-list entity that does not support delete", () => {
    const result = validateQboWrite("Customer", "delete", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes("does not support"))).toBe(true);
  });

  it("rejects void for an entity with no void support", () => {
    const result = validateQboWrite("Bill", "void", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("accepts void for Invoice (operation-void mode)", () => {
    const result = validateQboWrite("Invoice", "void", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("accepts inactivate for a name-list entity", () => {
    const result = validateQboWrite("Customer", "inactivate", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(true);
  });

  it("rejects inactivate for a transaction entity", () => {
    const result = validateQboWrite("Invoice", "inactivate", { Id: "1", SyncToken: "0" }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects update missing Id/SyncToken", () => {
    const result = validateQboWrite("Bill", "update", { VendorRef: { value: "1" } }, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    const result = validateQboWrite("Bill", "create", null, makeCtx());
    expect(result.ok).toBe(false);
  });
});
