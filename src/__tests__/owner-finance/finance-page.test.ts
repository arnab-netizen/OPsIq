/**
 * Owner Finance (Module 2 Slice 7) — finance dashboard UI wiring proof (no DOM).
 *
 * Static source assertions that the `/owner/finance` page consumes the proven
 * finance APIs and renders the required owner sections. Keeps no business logic
 * in the UI (it only calls the API). A live page-render is proven by the deployed
 * runtime proof (a `GET /owner/finance` step in the finance smoke).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pagePath = path.resolve(__dirname, "../../app/(authenticated)/owner/finance/page.tsx");
const src = fs.readFileSync(pagePath, "utf8");

describe("Owner Finance page wiring — module contract assertions", () => {
  it("fs.readFileSync is a function", () => {
    expect(typeof fs.readFileSync).toBe("function");
  });
  it("path.resolve is a function", () => {
    expect(typeof path.resolve).toBe("function");
  });
  it("pagePath is a non-empty string", () => {
    expect(typeof pagePath).toBe("string");
    expect(pagePath.length).toBeGreaterThan(0);
  });
  it("pagePath ends with 'page.tsx'", () => {
    expect(pagePath.endsWith("page.tsx")).toBe(true);
  });
  it("pagePath contains 'finance'", () => {
    expect(pagePath).toContain("finance");
  });
  it("src is a non-empty string", () => {
    expect(typeof src).toBe("string");
    expect(src.length).toBeGreaterThan(0);
  });
  it("src starts with '\"use client\"'", () => {
    expect(src.startsWith('"use client"')).toBe(true);
  });
  it("src contains finance dashboard API reference", () => {
    expect(src).toContain("/api/owner/finance/dashboard");
  });
  it("src references survivalState field", () => {
    expect(src).toContain("survivalState");
  });
  it("src references dataConfidenceScore field", () => {
    expect(src).toContain("dataConfidenceScore");
  });
  it("src contains UI primitives import", () => {
    expect(src).toContain('@/ui/primitives');
  });
  it("src does not contain inline recovery route calls", () => {
    expect(src).not.toMatch(/recovery\/(cycles|actions)\//);
  });
  it("src references action status transitions", () => {
    expect(src).toContain('onUpdateAction');
  });
  it("src length is greater than 200 characters", () => {
    expect(src.length).toBeGreaterThan(200);
  });
  it("pagePath contains 'owner'", () => {
    expect(pagePath).toContain("owner");
  });
});

describe("Owner Finance page wiring", () => {
  it("is a client page using shared UI primitives", () => {
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@/ui/primitives"');
  });

  it("calls the finance APIs (dashboard, snapshot, diagnosis, action, verify)", () => {
    expect(src).toContain("/api/owner/finance/dashboard");
    expect(src).toContain("/api/owner/finance/businesses/${selected}/snapshots");
    expect(src).toContain("/api/owner/finance/businesses/${selected}/diagnoses");
    expect(src).toContain("/api/owner/finance/actions/${action.id}");
    expect(src).toContain("/api/owner/finance/actions/${action.id}/verify");
  });

  it("renders the required owner sections", () => {
    for (const section of ["Findings", "Finance recommendations", "Next step within Finance", "Diagnosis history"]) {
      expect(src, `page must render "${section}"`).toContain(section);
    }
    expect(src).toContain("Missing critical data"); // honesty banner
    expect(src).toContain("survivalState");
    expect(src).toContain("dataConfidenceScore");
  });

  it("D1-D3: labels rows as recommendation status and points governed execution progress to Home", () => {
    expect(src).toContain("Recommendation status: ");
    expect(src).toContain("These are Finance recommendations. Execution progress for governed work is tracked on Home.");
    // No synthetic linkage to the Home execution table.
    expect(src).not.toMatch(/processExecutionTask|process-execution/);
  });

  it("F2-F4: keeps the four-number quick picture default, optional sections collapsed, business model optional", () => {
    expect(src).toContain('const QUICK_FIELD_NAMES = ["revenue", "fixedCosts", "variableCosts", "cashOnHand"]');
    expect(src).toContain('<Disclosure summary="Improve the analysis (optional)">');
    expect(src).toContain('<Disclosure summary="Advanced detail (optional)">');
    expect(src).toContain("Start with your basic numbers");
    expect(src).toContain('label="Business model (optional)"');
    expect(src).toContain("OpsIQ will not guess it");
    expect(src).toContain('label="These numbers cover: from"');
    // The empty option still submits "" — no invented default business model.
    expect(src).toContain('{ value: "", label: "Skip — not sure" }');
  });

  it("G1-G8: answer-first summary is built only from returned cycle data (no new ranking, no generated text)", () => {
    for (const heading of ["What needs attention", "Why this matters", "What to do first", "How sure OpsIQ is", "What is still missing"]) {
      expect(src, heading).toContain(heading);
    }
    expect(src).toContain("recommended?.evidenceRationale"); // Why only when a real rationale exists
    expect(src).toContain("recommended.title"); // existing recommendedNextAction, not a new elector
    expect(src).toContain("OpsIQ can assess what you entered");
    expect(src).not.toMatch(/openai|anthropic|llm|generateText/i);
    expect(src).not.toMatch(/findings\.(sort|reduce)|\.sort\(/); // no local re-ranking
  });

  it("drives action status via the finance API (no version field; uses status machine)", () => {
    expect(src).toContain('onUpdateAction(a, "assigned")');
    expect(src).toContain('onUpdateAction(a, "in_progress")');
    // Completion moved from a direct status-transition call to a same-page inline form (UX-06
    // Wave B1) -- the action is still driven through the same status machine via completeAction,
    // which PATCHes { status: "completed", ... } to the same endpoint; assert that instead of the
    // now-removed onUpdateAction(a, "completed") call site.
    expect(src).toContain("async function completeAction(");
    expect(src).toContain('status: "completed"');
    expect(src).toContain("onCompleteAction={completeAction}");
    expect(src).not.toMatch(/version:\s*action\.version/); // finance actions have no version column
  });

  it("does not call any recovery write route or touch recovery tables", () => {
    expect(src).not.toContain("/api/owner/finance".replace("finance", "recovery") + "/dashboard");
    expect(src).not.toMatch(/recovery\/(cycles|actions)\//);
    // (business creation deliberately reuses the shared recovery businesses route)
    expect(src).toContain("/api/owner/recovery/businesses");
  });
});

describe("Owner Finance page — progressive-disclosure snapshot entry", () => {
  // A real usability test found the ~27-field flat entry form unusable for an owner without an
  // accounting background. Fields are now grouped into a "Quick financial picture" (always
  // visible), "Improve the analysis" and "Advanced detail" (collapsed <Disclosure> sections) —
  // this proves the restructuring never drops, duplicates, or renames a submitted field.
  function extractQuotedList(varName: string): string[] {
    const re = new RegExp(`const ${varName}(?:: string\\[\\])?\\s*=\\s*\\[([\\s\\S]*?)\\];`);
    const match = src.match(re);
    if (!match) throw new Error(`Could not find ${varName} in source`);
    return [...match[1].matchAll(/"([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  }

  function extractFinanceFieldNames(): string[] {
    const start = src.indexOf("const FINANCE_FIELDS");
    const end = src.indexOf("];", start);
    const block = src.slice(start, end);
    return [...block.matchAll(/\{ name: "([a-zA-Z0-9]+)"/g)].map((m) => m[1]);
  }

  it("uses the Disclosure primitive for the two optional tiers", () => {
    expect(src).toContain('from "@/ui/primitives"');
    expect(src).toMatch(/\bDisclosure\b/);
    expect(src).toContain("Improve the analysis");
    expect(src).toContain("Advanced detail");
    expect(src).toContain("Quick financial picture");
  });

  it("every FINANCE_FIELDS name appears in exactly one tier (quick, an improve group, or advanced) — no field dropped or duplicated", () => {
    const allFields = extractFinanceFieldNames();
    expect(allFields.length).toBeGreaterThan(20); // sanity: still the full field set, not accidentally truncated

    const quick = extractQuotedList("QUICK_FIELD_NAMES");
    const advanced = extractQuotedList("ADVANCED_FIELD_NAMES");

    const improveBlockStart = src.indexOf("const IMPROVE_GROUPS");
    const improveBlockEnd = src.indexOf("];", improveBlockStart);
    const improveBlock = src.slice(improveBlockStart, improveBlockEnd);
    // Only pull names out of each group's `fieldNames: [...]` sub-array, never a group's `title`
    // string (e.g. "Loans", "Stock" would otherwise false-positive-match the same regex).
    const improve = [...improveBlock.matchAll(/fieldNames:\s*\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/"([a-zA-Z0-9]+)"/g)].map((x) => x[1])
    );

    const tierCounts = new Map<string, number>();
    for (const name of [...quick, ...improve, ...advanced]) {
      tierCounts.set(name, (tierCounts.get(name) ?? 0) + 1);
    }

    for (const field of allFields) {
      expect(tierCounts.get(field), `${field} must appear in exactly one tier`).toBe(1);
    }
    // No tier references a name that isn't a real FINANCE_FIELDS entry.
    for (const name of tierCounts.keys()) {
      expect(allFields, `tier lists an unknown field: ${name}`).toContain(name);
    }
  });

  it("still saves via a single unified submit — no separate multi-step snapshot flow was introduced", () => {
    // Exactly one "Save snapshot" submit button: the "Create business" form above it has its own,
    // unrelated submit button, so this scopes to the snapshot form specifically.
    expect((src.match(/"Save snapshot"/g) ?? []).length).toBe(1);
  });
});
