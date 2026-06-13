/**
 * Owner Trust & Explainability page (`/owner/trust`) — UI wiring proof (no DOM).
 * Static source assertions that the page consumes only the read-only trust APIs
 * and surfaces the §18 credibility fields + audit trail. No business logic in UI.
 * A live page-render is proven by the deployed runtime proof (a `GET /owner/trust`
 * step in the trust smoke).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/(authenticated)/owner/trust/page.tsx"),
  "utf8"
);
const home = fs.readFileSync(
  path.resolve(__dirname, "../../app/(authenticated)/owner/page.tsx"),
  "utf8"
);

describe("Owner Trust & Explainability page wiring", () => {
  it("is a client page using shared UI primitives", () => {
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toContain('from "@/ui/primitives"');
  });

  it("reads only the read-only trust APIs (no mutation endpoints)", () => {
    expect(src).toContain("/api/owner/trust/cycles");
    expect(src).toContain("/api/owner/trust/explanations");
    expect(src).toContain("/api/owner/trust/audit-trail");
    expect(src).not.toMatch(/method:\s*["'](POST|PATCH|PUT|DELETE)["']/);
  });

  it("surfaces the §18 credibility fields", () => {
    expect(src).toContain("whatWasDetected");
    expect(src).toContain("whyItMatters");
    expect(src).toContain("sourceDataUsed");
    expect(src).toContain("calculationUsed");
    expect(src).toContain("confidence");
    expect(src).toContain("riskIfIgnored");
    expect(src).toContain("expectedImpact");
    expect(src).toContain("verification");
  });

  it("surfaces honesty (no invented values + data gaps) and the audit trail", () => {
    expect(src).toContain("hasInventedValues");
    expect(src).toContain("dataGaps");
    expect(src).toContain("Audit trail");
  });

  it("is linked from the owner command center home", () => {
    expect(home).toContain("/owner/trust");
  });
});
