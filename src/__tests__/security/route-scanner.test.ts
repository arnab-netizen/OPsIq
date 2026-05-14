/**
 * Route Security Scanner
 *
 * Ensures all API routes enforce authentication or are explicitly exempted.
 * Prevents accidental deployment of unprotected routes.
 */

import fs from "fs";
import path from "path";
import { PUBLIC_ROUTE_EXEMPTIONS, EXEMPTION_REASONS } from "@/domain/constants/public-route-exemptions";

describe("Route Security Scanner", () => {
  let allRouteFiles: Array<{ path: string; file: string; content: string }> = [];

  beforeAll(() => {
    const apiDir = path.join(process.cwd(), "src/app/api");

    function walkDir(dir: string, basePath: string = ""): void {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = basePath ? `${basePath}/${file}` : file;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath, relPath);
        } else if (file === "route.ts") {
          const content = fs.readFileSync(fullPath, "utf-8");
          const routePath = relPath.replace("/route.ts", "").replace(/\[([^\]]+)\]/g, "[$1]");
          allRouteFiles.push({
            path: `/api/${routePath}`,
            file: fullPath,
            content,
          });
        }
      }
    }

    walkDir(apiDir);
  });

  test("no unprotected routes outside exemption registry", () => {
    const exemptedRoutes = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();
    const unprotected: string[] = [];

    for (const route of allRouteFiles) {
      const routePath = route.path;
      const content = route.content;

      // Check if route is exempted
      if (exemptedRoutes.includes(routePath as any)) {
        continue;
      }

      // Check for auth enforcement patterns
      const hasWithAuth = content.includes("await withAuth(") || content.includes("await withAuth()");
      const hasGetSession = content.includes("getSession(");
      const hasRequireAuth = content.includes("requireAuth(");
      const hasResolveServerRole = content.includes("resolveServerRole(");
      const hasRequireAuthForCapability = content.includes("requireAuthForCapability(");
      const hasCanonicalEnforcement = content.includes("withCanonicalEnforcement(");

      // Check for workspace context (only valid if auth is present)
      const hasWorkspaceContext = content.includes("requireWorkspaceContext()");

      // Stripe webhook check - has signature verification
      const isStripeWebhook = routePath.includes("/webhooks/stripe");
      const hasSignatureVerification = content.includes("verifyWebhookSignature");

      // Disabled routes don't count
      const isDisabled = content.includes('throw new Error("Endpoint disabled")');

      if (isDisabled) {
        continue; // Disabled endpoints are safe
      }

      if (isStripeWebhook && hasSignatureVerification) {
        continue; // Stripe webhook has signature verification
      }

      // Check if route requires workspace context WITHOUT auth
      const requiresWorkspaceWithoutAuth =
        hasWorkspaceContext && !hasWithAuth && !hasGetSession && !hasRequireAuth && !hasResolveServerRole && !hasCanonicalEnforcement;

      if (requiresWorkspaceWithoutAuth) {
        unprotected.push(`${routePath} (uses requireWorkspaceContext without auth)`);
      } else if (!hasWithAuth && !hasGetSession && !hasRequireAuth && !hasResolveServerRole && !hasRequireAuthForCapability && !hasCanonicalEnforcement && !isStripeWebhook) {
        unprotected.push(`${routePath} (no auth enforcement)`);
      }
    }

    expect(unprotected).toEqual(
      [],
      `Found unprotected routes:\n${unprotected.map((r) => `  - ${r}`).join("\n")}\n\nAll routes must have withAuth(), getSession(), requireAuth(), or be in PUBLIC_ROUTE_EXEMPTIONS`
    );
  });

  test("all exempted routes have documented reasons", () => {
    const exemptedRoutes = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();
    const undocumented: string[] = [];

    for (const route of exemptedRoutes) {
      const reason = EXEMPTION_REASONS[route as keyof typeof EXEMPTION_REASONS];
      if (!reason) {
        undocumented.push(route);
      }
    }

    expect(undocumented).toEqual(
      [],
      `Exempted routes without documented reasons:\n${undocumented.map((r) => `  - ${r}`).join("\n")}`
    );
  });

  test("exemption registry is complete and accurate", () => {
    const allExempted = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();

    // Check for duplicates
    const uniqueExempted = new Set(allExempted);
    expect(allExempted.length).toBe(
      uniqueExempted.size,
      "Exemption registry has duplicate entries"
    );

    // All exempted routes should actually exist (or be reasonable patterns)
    const healthRoutes = PUBLIC_ROUTE_EXEMPTIONS.HEALTH;
    const publicRoutes = PUBLIC_ROUTE_EXEMPTIONS.PUBLIC;
    const webhookRoutes = PUBLIC_ROUTE_EXEMPTIONS.WEBHOOK_SIGNED;

    expect(healthRoutes.length).toBeGreaterThan(0);
    expect(publicRoutes.length).toBeGreaterThan(0);
    expect(webhookRoutes.length).toBeGreaterThan(0);
  });

  test("workspace-context-only routes are rejected unless exempted", () => {
    const workspaceOnlyViolations: string[] = [];

    for (const route of allRouteFiles) {
      const routePath = route.path;
      const content = route.content;

      // Check if exempted
      const exemptedRoutes = Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat();
      if (exemptedRoutes.includes(routePath as any)) {
        continue;
      }

      // Pattern: requireWorkspaceContext() without withAuth()
      const hasRequireWorkspace = content.includes("requireWorkspaceContext()");
      const hasWithAuth = content.includes("await withAuth(");
      const hasRequireAuthForCapability = content.includes("requireAuthForCapability(");
      const hasCanonicalEnforcement = content.includes("withCanonicalEnforcement(");

      // Allow if disabled
      if (content.includes('throw new Error("Endpoint disabled")')) {
        continue;
      }

      if (hasRequireWorkspace && !hasWithAuth && !hasRequireAuthForCapability && !hasCanonicalEnforcement) {
        workspaceOnlyViolations.push(routePath);
      }
    }

    expect(workspaceOnlyViolations).toEqual(
      [],
      `Routes using workspace context without auth:\n${workspaceOnlyViolations.map((r) => `  - ${r}`).join("\n")}\n\nAll workspace-scoped routes MUST call await withAuth() first`
    );
  });
});
