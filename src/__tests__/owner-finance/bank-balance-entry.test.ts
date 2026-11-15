/**
 * UX-05: the "add your bank balance" next action must be completable from where the owner reads it. "Cashflow" is
 * not a page an owner can reach from the navigation, so no owner-facing instruction may send them there by name;
 * the action instead says which number is needed and links straight to the entry. Storage, calculations and the
 * abstention wording are unchanged.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FINANCE_REC_TEMPLATES } from "@/domain/owner-finance/recommendations";
import { BANK_BALANCE_COPY } from "@/domain/owner-finance/quick-entry";
import { bankBalanceEntryFor, BANK_BALANCE_ENTRY_HREF } from "@/domain/owner-finance/bank-balance-entry";
import { BankBalanceEntryLink } from "@/components/owner/BankBalanceEntryLink";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Owner-facing instructions that used to name Guided setup / the Cashflow page as the place to go. */
const OLD_DIRECTIONS = /Guided setup or|on the Cashflow page|in Cashflow\b|directly in Cashflow|Cashflow page|Go to Cashflow/;
const OWNER_FACING_SOURCES = [
  "src/domain/owner-finance/recommendations.ts",
  "src/domain/owner-finance/opportunity-rules.ts",
  "src/domain/owner-finance/quick-entry.ts",
  "src/domain/owner-budget/updated-plan.ts",
  "src/domain/owner-portfolio/investment-eligibility.ts",
  "src/app/(authenticated)/owner/onboarding/page.tsx",
];

describe("no owner-facing instruction sends the owner to an undiscoverable Cashflow page", () => {
  it.each(OWNER_FACING_SOURCES)("%s", (rel) => {
    // Comments may use the domain name; only the strings an owner reads matter.
    const code = read(rel).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(OLD_DIRECTIONS);
  });
});

describe("the bank-balance recommendation", () => {
  const rec = FINANCE_REC_TEMPLATES.FIN_LIQUIDITY_UNCONFIRMED;

  it("still says what number is needed, and how to enter 0 or leave it unknown", () => {
    expect(rec.recommendationCode).toBe("FINREC_CONFIRM_BANK_BALANCE");
    expect(rec.title).toBe("Add your bank balance");
    expect(rec.requiredOwnerAction).toMatch(/total across your bank accounts/);
    expect(rec.requiredOwnerAction).toMatch(/cash in hand/);
    expect(rec.requiredOwnerAction).toMatch(/Enter 0 only if you really hold nothing there/);
    expect(rec.requiredOwnerAction).toMatch(/leave a figure blank if you don't know it/);
    expect(rec.requiredOwnerAction).toMatch(/rather than guess/);
  });

  it("names the link that opens the entry instead of an internal page", () => {
    expect(rec.requiredOwnerAction).toMatch(/“Enter your bank balance” link/);
    expect(rec.requiredOwnerAction).not.toMatch(/Cashflow/);
  });

  it("keeps its verification and category unchanged", () => {
    expect(rec.category).toBe("improve_data_quality");
    expect(rec.verificationMethod).toBe("On your next diagnosis, confirm OpsIQ shows how many days your cash will last instead of asking for the bank balance.");
  });
});

describe("the bank-balance field hint", () => {
  it("keeps the do-not-count-twice rule without naming Cashflow", () => {
    expect(BANK_BALANCE_COPY.hint).toMatch(/never both, or it is counted twice/);
    expect(BANK_BALANCE_COPY.hint).not.toMatch(/Cashflow/);
  });
});

describe("the entry link", () => {
  it("is offered only for the bank-balance action codes", () => {
    expect(bankBalanceEntryFor("FIN_LIQUIDITY_UNCONFIRMED")?.href).toBe(BANK_BALANCE_ENTRY_HREF);
    expect(bankBalanceEntryFor("FINREC_CONFIRM_BANK_BALANCE")?.href).toBe(BANK_BALANCE_ENTRY_HREF);
    expect(bankBalanceEntryFor("FIN_LOW_MARGIN")).toBeNull();
    expect(bankBalanceEntryFor(null)).toBeNull();
    expect(bankBalanceEntryFor(undefined)).toBeNull();
  });

  it("renders a real link for the bank-balance action and nothing for any other", () => {
    const shown = renderToStaticMarkup(createElement(BankBalanceEntryLink, { code: "FIN_LIQUIDITY_UNCONFIRMED" }));
    expect(shown).toContain('href="/owner/cashflow"');
    expect(shown).toContain("Enter your bank balance");
    expect(renderToStaticMarkup(createElement(BankBalanceEntryLink, { code: "FIN_LOW_MARGIN" }))).toBe("");
  });
});
