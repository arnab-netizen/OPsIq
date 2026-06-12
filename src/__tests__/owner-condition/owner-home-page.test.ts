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

  it("surfaces the business condition and the single next action", () => {
    expect(src).toContain("recommendedNextAction");
    expect(src).toContain("Do this next");
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
