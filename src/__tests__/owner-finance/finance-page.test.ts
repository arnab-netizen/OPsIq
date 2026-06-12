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
    for (const section of ["Findings", "Finance actions", "Recommended next financial action", "Diagnosis history"]) {
      expect(src, `page must render "${section}"`).toContain(section);
    }
    expect(src).toContain("Missing critical data"); // honesty banner
    expect(src).toContain("survivalState");
    expect(src).toContain("dataConfidenceScore");
  });

  it("drives action status via the finance API (no version field; uses status machine)", () => {
    expect(src).toContain('onUpdateAction(a, "assigned")');
    expect(src).toContain('onUpdateAction(a, "in_progress")');
    expect(src).toContain('onUpdateAction(a, "completed")');
    expect(src).not.toMatch(/version:\s*action\.version/); // finance actions have no version column
  });

  it("does not call any recovery write route or touch recovery tables", () => {
    expect(src).not.toContain("/api/owner/finance".replace("finance", "recovery") + "/dashboard");
    expect(src).not.toMatch(/recovery\/(cycles|actions)\//);
    // (business creation deliberately reuses the shared recovery businesses route)
    expect(src).toContain("/api/owner/recovery/businesses");
  });
});
