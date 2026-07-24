/**
 * P0-A runtime-readiness — capacity + workload ingestion route enforcement wiring (no server).
 * Proves the two NEW critical-domain write routes are canonically enforced: POST requires OWNER_MANAGE, GET requires
 * OWNER_VIEW, workspace is required, businessId is a validated path param, and each calls the correct persistence
 * service. Mirrors the repo's established static route-enforcement proof (owner-home/routes.test.ts).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const capacitySrc = fs.readFileSync(
  path.resolve(__dirname, "../../../../app/api/owner/operations/businesses/[businessId]/capacity-snapshots/route.ts"),
  "utf8"
);
const workloadSrc = fs.readFileSync(
  path.resolve(__dirname, "../../../../app/api/owner/operations/businesses/[businessId]/workload-snapshots/route.ts"),
  "utf8"
);

describe("P0-A capacity ingestion route enforcement", () => {
  it("is canonically enforced + workspace-required", () => {
    expect(capacitySrc).toContain("withCanonicalEnforcement");
    expect(capacitySrc).toContain("requireWorkspace: true");
  });
  it("POST requires OWNER_MANAGE, GET requires OWNER_VIEW", () => {
    expect(capacitySrc).toMatch(/export const POST[\s\S]*requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(capacitySrc).toMatch(/export const GET[\s\S]*requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("validates the businessId path param and calls the capacity service", () => {
    expect(capacitySrc).toContain("parseOrThrow(uuidSchema, params.businessId)");
    expect(capacitySrc).toContain("@/services/owner-operations/capacity-snapshot.service");
    expect(capacitySrc).toContain("saveCapacitySnapshot");
  });
  it("uses canonicalJson for responses", () => {
    expect(capacitySrc).toContain("canonicalJson");
    expect(capacitySrc).toContain("@/lib/canonical-json-response");
  });
  it("GET calls listCapacitySnapshots", () => {
    expect(capacitySrc).toContain("listCapacitySnapshots");
  });
  it("POST uses parseRequestBody for input validation", () => {
    expect(capacitySrc).toContain("parseRequestBody");
  });
  it("POST passes workspaceId to saveCapacitySnapshot", () => {
    expect(capacitySrc).toContain("workspaceId: ctx.verifiedWorkspaceId");
  });
  it("POST passes businessId to saveCapacitySnapshot", () => {
    expect(capacitySrc).toContain("businessId: params.businessId");
  });
  it("POST returns status 201", () => {
    expect(capacitySrc).toContain("status: 201");
  });
  it("GET returns snapshots wrapped in object with status 200", () => {
    expect(capacitySrc).toContain("{ snapshots }");
    expect(capacitySrc).toContain("status: 200");
  });
  it("schema validates resources array with at least one item", () => {
    expect(capacitySrc).toContain("resources");
    expect(capacitySrc).toContain("min(1");
  });
  it("schema validates currentRevenue as non-negative number", () => {
    expect(capacitySrc).toContain("currentRevenue");
    expect(capacitySrc).toContain("z.number().min(0)");
  });
  it("imports CAPABILITIES from domain constants", () => {
    expect(capacitySrc).toContain("@/domain/constants/capabilities");
    expect(capacitySrc).toContain("CAPABILITIES");
  });
  it("is force-dynamic", () => {
    expect(capacitySrc).toContain('dynamic = "force-dynamic"');
  });
});

describe("P0-A workload ingestion route enforcement", () => {
  it("is canonically enforced + workspace-required", () => {
    expect(workloadSrc).toContain("withCanonicalEnforcement");
    expect(workloadSrc).toContain("requireWorkspace: true");
  });
  it("POST requires OWNER_MANAGE, GET requires OWNER_VIEW", () => {
    expect(workloadSrc).toMatch(/export const POST[\s\S]*requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(workloadSrc).toMatch(/export const GET[\s\S]*requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("validates the businessId path param and calls the workload service", () => {
    expect(workloadSrc).toContain("parseOrThrow(uuidSchema, params.businessId)");
    expect(workloadSrc).toContain("@/services/owner-operations/owner-workload-snapshot.service");
    expect(workloadSrc).toContain("saveOwnerWorkloadSnapshot");
  });
  it("uses canonicalJson for responses", () => {
    expect(workloadSrc).toContain("canonicalJson");
    expect(workloadSrc).toContain("@/lib/canonical-json-response");
  });
  it("GET calls listOwnerWorkloadSnapshots", () => {
    expect(workloadSrc).toContain("listOwnerWorkloadSnapshots");
  });
  it("POST uses parseRequestBody for input validation", () => {
    expect(workloadSrc).toContain("parseRequestBody");
  });
  it("POST passes workspaceId to saveOwnerWorkloadSnapshot", () => {
    expect(workloadSrc).toContain("workspaceId: ctx.verifiedWorkspaceId");
  });
  it("POST passes businessId to saveOwnerWorkloadSnapshot", () => {
    expect(workloadSrc).toContain("businessId: params.businessId");
  });
  it("POST returns status 201", () => {
    expect(workloadSrc).toContain("status: 201");
  });
  it("GET returns snapshots wrapped in object with status 200", () => {
    expect(workloadSrc).toContain("{ snapshots }");
    expect(workloadSrc).toContain("status: 200");
  });
  it("schema validates ownerMinutesPerDay as non-negative number", () => {
    expect(workloadSrc).toContain("ownerMinutesPerDay");
    expect(workloadSrc).toContain("z.number().min(0)");
  });
  it("schema validates sustainableMinutesPerDay as positive number", () => {
    expect(workloadSrc).toContain("sustainableMinutesPerDay");
    expect(workloadSrc).toContain("z.number().gt(0)");
  });
  it("imports CAPABILITIES from domain constants", () => {
    expect(workloadSrc).toContain("@/domain/constants/capabilities");
    expect(workloadSrc).toContain("CAPABILITIES");
  });
  it("is force-dynamic", () => {
    expect(workloadSrc).toContain('dynamic = "force-dynamic"');
  });
});
