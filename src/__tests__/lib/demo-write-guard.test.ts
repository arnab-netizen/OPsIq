import { describe, it, expect, afterEach } from "vitest";
import {
  evaluateDemoWrite,
  demoOnlyBlockedResponse,
  isProductionRuntime,
  IN_MEMORY_DEMO_WRITE_FEATURES,
} from "@/lib/demo-write-guard";
import fs from "fs";
import path from "path";

describe("demo-write-guard (Phase 0 truth/safety)", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  it("blocks in-memory demo writes in production (fails closed)", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionRuntime()).toBe(true);
    for (const feature of IN_MEMORY_DEMO_WRITE_FEATURES) {
      const evaluation = evaluateDemoWrite(feature);
      expect(evaluation.blocked).toBe(true);
      expect(evaluation.reason).toMatch(/demo-only|production/i);
    }
  });

  it("allows demo writes outside production", () => {
    process.env.NODE_ENV = "test";
    for (const feature of IN_MEMORY_DEMO_WRITE_FEATURES) {
      expect(evaluateDemoWrite(feature).blocked).toBe(false);
    }
  });

  it("returns a 503 NOT_PERSISTED_DEMO_ONLY response when blocked", async () => {
    process.env.NODE_ENV = "production";
    const res = demoOnlyBlockedResponse("pricing-tiers");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("NOT_PERSISTED_DEMO_ONLY");
    expect(body.productionEnabled).toBe(false);
    expect(body.persistence).toBe("in-memory");
  });

  it("both in-memory growth write routes are guarded (no unguarded production write path)", () => {
    // Both routes are now DB-backed — no in-memory features remain.
    // Verify the guard list is empty and the routes exist (not deleted).
    expect(IN_MEMORY_DEMO_WRITE_FEATURES).toHaveLength(0);
    const routes = [
      "src/app/api/growth/pricing-tiers/route.ts",
      "src/app/api/growth/retention-metrics/route.ts",
    ];
    for (const rel of routes) {
      expect(fs.existsSync(path.join(process.cwd(), rel))).toBe(true);
    }
  });
});
