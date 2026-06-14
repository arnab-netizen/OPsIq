/**
 * Owner Home page (`/owner/home`) — UI wiring proof (no DOM).
 * Static source assertions that the mobile-first §19 home consumes only the read-only
 * owner-home API and surfaces every required field. No business logic in the UI.
 * A live page-render is proven by the deployed runtime proof (a `GET /owner/home` step
 * in the owner-home smoke).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/(authenticated)/owner/home/page.tsx"),
  "utf8"
);
const home = fs.readFileSync(
  path.resolve(__dirname, "../../app/(authenticated)/owner/page.tsx"),
  "utf8"
);

describe("Owner Home page wiring", () => {
  it("is a client page using shared UI primitives", () => {
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@/ui/primitives"');
  });

  it("reads only the read-only owner-home API (no mutations)", () => {
    expect(src).toContain("/api/owner/home");
    expect(src).not.toMatch(/method:\s*["'](POST|PATCH|PUT|DELETE)["']/);
  });

  it("surfaces every §19 owner-home field", () => {
    expect(src).toContain("Business health");
    expect(src).toContain("Cash danger");
    expect(src).toContain("Sales danger");
    expect(src).toContain("Operations danger");
    expect(src).toContain("Execution danger");
    expect(src).toContain("Today&apos;s required actions");
    expect(src).toContain("Top risks");
    expect(src).toContain("Top opportunities");
    expect(src).toContain("Last verified improvement");
  });

  it("reads the summary fields from the payload", () => {
    expect(src).toContain("businessHealthScore");
    expect(src).toContain("cashDanger");
    expect(src).toContain("requiredActions");
    expect(src).toContain("top3Risks");
    expect(src).toContain("top3Opportunities");
    expect(src).toContain("lastVerifiedImprovement");
  });

  it("is mobile-first and honest about missing data", () => {
    expect(src).toMatch(/max-w-md/); // mobile-first container
    expect(src).toContain("no data"); // honest unknown danger
    expect(src).toContain("No verified improvement yet");
  });

  it("is linked from the owner command center home", () => {
    expect(home).toContain("/owner/home");
  });
});
