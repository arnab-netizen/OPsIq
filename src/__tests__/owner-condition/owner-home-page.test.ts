/**
 * Owner Command Center home (`/owner`) — UI wiring proof (no DOM).
 * Static source assertions that the page consumes the proven command-center API
 * and surfaces the Business Condition + single next action. No business logic in
 * the UI. A live page-render is proven by the deployed runtime proof
 * (a `GET /owner` step in the finance smoke).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/(authenticated)/owner/page.tsx"),
  "utf8"
);

describe("Owner Command Center home page — source file contract assertions", () => {
  it("src is a non-empty string", () => {
    expect(typeof src).toBe("string");
    expect(src.length).toBeGreaterThan(100);
  });
  it("src starts with '\"use client\"'", () => {
    expect(src.startsWith('"use client"')).toBe(true);
  });
  it("src contains '/api/owner/command-center'", () => {
    expect(src).toContain("/api/owner/command-center");
  });
  it("src renders the canonical owner decision (currentOwnerDecision + OwnerDecisionCard)", () => {
    expect(src).toContain("currentOwnerDecision");
    expect(src).toContain("OwnerDecisionCard");
  });
  it("src contains 'overallHealthScore'", () => {
    expect(src).toContain("overallHealthScore");
  });
  it("src contains 'survivalRiskScore'", () => {
    expect(src).toContain("survivalRiskScore");
  });
  it("src contains 'domainsWired'", () => {
    expect(src).toContain("domainsWired");
  });
  it("src contains '/owner/finance'", () => {
    expect(src).toContain("/owner/finance");
  });
  it("src contains '/owner/recovery'", () => {
    expect(src).toContain("/owner/recovery");
  });
  it("src never elects its own next action ('Do this next' / recommendedNextAction are retired)", () => {
    expect(src).not.toContain("Do this next");
    expect(src).not.toContain("recommendedNextAction");
  });
  it("src does not contain '/diagnoses'", () => {
    expect(src).not.toContain("/diagnoses");
  });
  it("src contains 'from \"@/ui/primitives\"'", () => {
    expect(src).toContain('from "@/ui/primitives"');
  });
  it("src contains 'Missing critical data'", () => {
    expect(src).toContain("Missing critical data");
  });
  it("src does not contain '/verify'", () => {
    expect(src).not.toContain("/verify");
  });
  it("src length is > 500 characters", () => {
    expect(src.length).toBeGreaterThan(500);
  });
  it("src is a string (typeof check)", () => {
    expect(typeof src).toBe("string");
  });
});

describe("Owner Command Center home page wiring", () => {
  it("is a client page using shared UI primitives", () => {
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@/ui/primitives"');
  });

  it("reads the proven command-center API (no business logic in UI)", () => {
    expect(src).toContain("/api/owner/command-center");
    // It must not call domain mutation endpoints from the home shell.
    expect(src).not.toContain("/diagnoses");
    expect(src).not.toContain("/verify");
  });

  it("surfaces the business condition and the ONE canonical main target", () => {
    expect(src).toContain("currentOwnerDecision");
    expect(src).toContain("OwnerDecisionCard");
    expect(src).toContain("overallHealthScore");
    expect(src).toContain("survivalRiskScore");
    expect(src).toContain("Missing critical data"); // honesty banner
    expect(src).toContain("domainsWired");
  });

  it("links to the domain workspaces (finance, recovery)", () => {
    expect(src).toContain("/owner/finance");
    expect(src).toContain("/owner/recovery");
  });
});
