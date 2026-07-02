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
});
