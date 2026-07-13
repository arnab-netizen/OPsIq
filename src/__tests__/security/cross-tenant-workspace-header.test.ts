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
