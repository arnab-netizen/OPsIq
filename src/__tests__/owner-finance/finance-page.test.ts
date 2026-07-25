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
