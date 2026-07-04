/**
 * Phase 2 Slice 2 — Wealth Path read service: pure mapper + route enforcement.
 *
 * The DB-backed `getWealthPath` path is proven in `wealth-path.db.test.ts`
 * (CI, TEST_WITH_DB). This suite proves the pure snapshot→input mapping and
 * that the runtime surface is canonically enforced — both runnable without a DB.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { mapMetricSnapshotToWealthPathInput } from "@/services/owner-strategy/wealth-path.service";
import { classifyWealthPath } from "@/domain/owner-strategy/wealth-path";

describe("mapMetricSnapshotToWealthPathInput — honest derivation", () => {
  it("derives margins and repeat ratio from a real snapshot", () => {
    const input = mapMetricSnapshotToWealthPathInput({
      revenue: 100000,
      grossProfit: 60000,
      netProfit: 20000,
      repeatCustomers: 30,
      newCustomers: 10,
    });
    expect(input.monthlyRevenue).toBe(100000);
    expect(input.grossMarginPct).toBe(60);
    expect(input.netMarginPct).toBe(20);
    expect(input.repeatCustomerPct).toBe(75);
  });

  it("returns empty input for a null snapshot (no invention)", () => {
    expect(mapMetricSnapshotToWealthPathInput(null)).toEqual({});
  });

  it("does not divide by zero / missing revenue → margins undefined", () => {
    const input = mapMetricSnapshotToWealthPathInput({ revenue: 0, grossProfit: 10, netProfit: 5 });
    expect(input.grossMarginPct).toBeUndefined();
    expect(input.netMarginPct).toBeUndefined();
  });

  it("leaves margin undefined when a component is missing", () => {
    const input = mapMetricSnapshotToWealthPathInput({ revenue: 50000, grossProfit: 20000 });
    expect(input.grossMarginPct).toBe(40);
    expect(input.netMarginPct).toBeUndefined();
    expect(input.repeatCustomerPct).toBeUndefined();
  });

  it("mapped-then-classified stays PROVISIONAL when structural signals are absent", () => {
    // Even with healthy margins, snapshot data alone lacks moat/expansion/owner
    // signals → the verdict must be provisional and block high-risk execution.
    const input = mapMetricSnapshotToWealthPathInput({
      revenue: 100000,
      grossProfit: 70000,
      netProfit: 25000,
      repeatCustomers: 40,
      newCustomers: 10,
    });
    const r = classifyWealthPath(input);
    expect(r.provisionalLowConfidence).toBe(true);
    expect(r.blocksHighRiskExecution).toBe(true);
    expect(r.missingInputs).toContain("expansionPath");
  });
});

describe("wealth-path route — canonical enforcement wiring (no server)", () => {
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, "../../app/api/owner/wealth-path/route.ts"),
    "utf8",
  );

  it("uses withCanonicalEnforcement and requires a workspace", () => {
    expect(routeSrc).toContain("withCanonicalEnforcement");
    expect(routeSrc).toContain("requireWorkspace: true");
  });

  it("gates the read on OWNER_VIEW", () => {
    expect(routeSrc).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });

  it("does not import auth libraries directly (canonical path only)", () => {
    expect(routeSrc).not.toMatch(/from ["']@\/lib\/auth-guard["']/);
    expect(routeSrc).not.toMatch(/requireAuth\b/);
  });
});
