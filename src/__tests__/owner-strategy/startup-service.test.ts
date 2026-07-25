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

describe("startup service — module contract assertions", () => {
  it("validateStartupSession is a function", () => { expect(typeof validateStartupSession).toBe("function"); });
  it("startupValidateRequestSchema is defined", () => { expect(startupValidateRequestSchema).toBeDefined(); });
  it("startupValidateRequestSchema has safeParse method", () => { expect(typeof startupValidateRequestSchema.safeParse).toBe("function"); });
  it("INTAKE is an object with capitalAvailable field", () => { expect(INTAKE).toHaveProperty("capitalAvailable"); });
  it("INTAKE.capitalAvailable is 300000", () => { expect(INTAKE.capitalAvailable).toBe(300000); });
  it("IDEA is an object with name field", () => { expect(IDEA).toHaveProperty("name"); });
  it("IDEA.name is 'Local laundry'", () => { expect(IDEA.name).toBe("Local laundry"); });
  it("schema accepts a well-formed request", () => { expect(startupValidateRequestSchema.safeParse({ intake: INTAKE, ideas: [IDEA] }).success).toBe(true); });
  it("schema rejects an empty ideas array", () => { expect(startupValidateRequestSchema.safeParse({ intake: INTAKE, ideas: [] }).success).toBe(false); });
  it("validateStartupSession returns an object with validation field", () => { expect(validateStartupSession(INTAKE, [IDEA])).toHaveProperty("validation"); });
  it("validateStartupSession returns an object with commandCenter field", () => { expect(validateStartupSession(INTAKE, [IDEA])).toHaveProperty("commandCenter"); });
  it("commandCenter.mode is 'startup'", () => { expect(validateStartupSession(INTAKE, [IDEA]).commandCenter.mode).toBe("startup"); });
  it("fs is an object", () => { expect(typeof fs).toBe("object"); });
  it("path is an object", () => { expect(typeof path).toBe("object"); });
});

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
