/**
 * Phase 14-15 runtime surface — startup validation service + route + schema.
 * Proves the owner-facing startup validation path (POST /api/owner/startup-validate)
 * is wired, enforced, and body-validated, and returns validation-first results.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { validateStartupSession } from "@/services/owner-strategy/startup.service";
import { startupValidateRequestSchema } from "@/domain/owner-strategy/startup-mode.validation";

const INTAKE = { capitalAvailable: 300000, monthlySurvivalNeed: 40000, fastCashVsScale: "fast_cash" as const };
const IDEA = {
  name: "Local laundry",
  industry: "laundry",
  structural: { grossMarginPct: 55, netMarginPct: 18, expansionPath: "local" as const, capitalIntensity: "medium" as const, downsideRisk: "low" as const },
  estimatedStartupCost: 120000,
  estimatedMonthlyRevenue: 90000,
  estimatedMonthlyCost: 65000,
};

describe("validateStartupSession", () => {
  it("returns validation-first results + a command-center payload", () => {
    const out = validateStartupSession(INTAKE, [IDEA]);
    expect(out.validation.recommended?.name).toBe("Local laundry");
    expect(out.validation.launchAllowed).toBe(false);
    expect(out.validation.validationWorkPackage).not.toBeNull();
    expect(out.commandCenter.mode).toBe("startup");
    expect(out.commandCenter.nextBestMove.decision).toBe("VALIDATE_FIRST");
    expect(out.commandCenter.proofRequirement).toBeTruthy();
  });

  it("rejects unaffordable ideas with the capital gap exposed", () => {
    const pricey = { ...IDEA, name: "Big chain", estimatedStartupCost: 5000000 };
    const out = validateStartupSession(INTAKE, [pricey]);
    expect(out.validation.recommended).toBeNull();
    expect(out.validation.rejected[0].capitalGap).toBeGreaterThan(0);
  });
});

describe("startupValidateRequestSchema", () => {
  it("accepts a well-formed request", () => {
    const r = startupValidateRequestSchema.safeParse({ intake: INTAKE, ideas: [IDEA] });
    expect(r.success).toBe(true);
  });
  it("rejects an empty ideas array", () => {
    const r = startupValidateRequestSchema.safeParse({ intake: INTAKE, ideas: [] });
    expect(r.success).toBe(false);
  });
  it("rejects unknown structural fields (strict)", () => {
    const r = startupValidateRequestSchema.safeParse({ intake: INTAKE, ideas: [{ ...IDEA, structural: { ...IDEA.structural, madeUpField: 1 } }] });
    expect(r.success).toBe(false);
  });
});

describe("startup-validate route enforcement (no server)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../app/api/owner/startup-validate/route.ts"), "utf8");
  it("is canonically enforced, workspace-scoped, OWNER_VIEW, body-validated", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    expect(src).toContain("parseRequestBody");
  });
  it("does not import auth libraries directly", () => {
    expect(src).not.toMatch(/from ["']@\/lib\/auth-guard["']/);
  });
});
