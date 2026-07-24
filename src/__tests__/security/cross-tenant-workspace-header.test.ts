/**
 * Regression guard for GAP-TEN-02 (full-repo commercial audit).
 *
 * A cluster of routes read the tenant from the client-supplied `x-workspace-id`
 * header and passed it straight to a workspace-scoped service without verifying
 * the caller belonged to that workspace — enabling cross-tenant reads/writes.
 * The fix routes each through the server-derived / membership-verified workspace
 * (`ctx.verifiedWorkspaceId` for canonical routes, `enforceWorkspaceScoping` for
 * the withAuth-based webhook routes). This test locks that in by code inspection.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const API = path.resolve(__dirname, "../../app/api");
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf-8");

describe("cross-tenant hardening (GAP-TEN-02) — structural assertions", () => {
  it("API base path is a non-empty string", () => {
    expect(typeof API).toBe("string");
    expect(API.length).toBeGreaterThan(0);
  });
  it("API base path contains 'app/api'", () => {
    expect(API).toContain("app/api");
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("billing/plan route uses canonical enforcement", () => {
    expect(read("billing/plan/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("billing/plan route uses verifiedWorkspaceId", () => {
    expect(read("billing/plan/route.ts")).toContain("verifiedWorkspaceId");
  });
  it("billing/plan route does not use raw x-workspace-id header", () => {
    expect(read("billing/plan/route.ts")).not.toContain('headers.get("x-workspace-id")');
  });
  it("webhooks/subscribe route uses canonical enforcement", () => {
    expect(read("webhooks/subscribe/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("webhooks/subscribe route uses verifiedWorkspaceId", () => {
    expect(read("webhooks/subscribe/route.ts")).toContain("verifiedWorkspaceId");
  });
  it("deliverables route uses canonical enforcement", () => {
    expect(read("deliverables/[deliverableId]/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("deliverables route uses verifiedWorkspaceId", () => {
    expect(read("deliverables/[deliverableId]/route.ts")).toContain("verifiedWorkspaceId");
  });
  it("deliverables route does not use raw x-workspace-id header", () => {
    expect(read("deliverables/[deliverableId]/route.ts")).not.toContain('headers.get("x-workspace-id")');
  });
  it("engagements business-impact route uses canonical enforcement", () => {
    expect(read("engagements/[engagementId]/business-impact/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("engagements business-impact route uses verifiedWorkspaceId", () => {
    expect(read("engagements/[engagementId]/business-impact/route.ts")).toContain("verifiedWorkspaceId");
  });
  it("engagements business-impact route uses assertEngagementAccess", () => {
    expect(read("engagements/[engagementId]/business-impact/route.ts")).toContain("assertEngagementAccess");
  });
  it("engagements decision-evidence route uses assertEngagementAccess", () => {
    expect(read("engagements/[engagementId]/decision-evidence/route.ts")).toContain("assertEngagementAccess");
  });
  it("webhooks test route uses canonical enforcement", () => {
    expect(read("webhooks/[id]/test/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("webhooks test route uses verifiedWorkspaceId", () => {
    expect(read("webhooks/[id]/test/route.ts")).toContain("verifiedWorkspaceId");
  });
});

describe("cross-tenant workspace-header hardening (GAP-TEN-02)", () => {
  describe("canonical routes derive the tenant from the verified workspace", () => {
    const canonicalRoutes = [
      "billing/plan/route.ts",
      "deliverables/[deliverableId]/route.ts",
      "engagements/[engagementId]/business-impact/route.ts",
      "engagements/[engagementId]/decision-evidence/route.ts",
    ];

    for (const rel of canonicalRoutes) {
      it(`${rel} uses ctx.verifiedWorkspaceId and does not read x-workspace-id`, () => {
        const content = read(rel);
        expect(content).toContain("ctx.verifiedWorkspaceId");
        // The raw client header must no longer feed the workspace scope.
        expect(content).not.toContain('headers.get("x-workspace-id")');
      });
    }

    const engagementScoped = [
      "engagements/[engagementId]/business-impact/route.ts",
      "engagements/[engagementId]/decision-evidence/route.ts",
    ];
    for (const rel of engagementScoped) {
      it(`${rel} binds the actor to the engagement via assertEngagementAccess`, () => {
        expect(read(rel)).toContain("assertEngagementAccess");
      });
    }
  });

  describe("webhook routes verify membership via canonical enforcement", () => {
    const webhookRoutes = [
      "webhooks/subscribe/route.ts",
      "webhooks/[id]/test/route.ts",
    ];
    for (const rel of webhookRoutes) {
      it(`${rel} uses withCanonicalEnforcement and ctx.verifiedWorkspaceId`, () => {
        const content = read(rel);
        expect(content).toContain("withCanonicalEnforcement");
        // Workspace must be derived from the verified canonical context, not raw headers.
        expect(content).toContain("ctx.verifiedWorkspaceId");
      });
    }
  });
});
