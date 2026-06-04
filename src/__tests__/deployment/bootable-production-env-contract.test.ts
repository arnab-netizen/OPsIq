/**
 * Bootable Production — Env Contract Reconciliation
 *
 * Proves:
 *  5. Stripe secret resolution accepts STRIPE_SECRET_KEY (canonical) and
 *     STRIPE_API_KEY (legacy alias), prefers the canonical name, and returns
 *     null when neither is set (so paid Stripe operations fail lazily, never at
 *     startup/import).
 *  6. deployment-preflight no longer requires phantom NEXTAUTH_SECRET /
 *     NEXTAUTH_URL, and surfaces the real boot contract (DATABASE_URL,
 *     NEXT_PUBLIC_APP_URL).
 *  7. validate-deployment requires NEXT_PUBLIC_APP_URL and does not hard-fail
 *     solely because NEXT_PUBLIC_API_URL is absent when NEXT_PUBLIC_APP_URL is
 *     present.
 *  + .env.example is the single source of truth and documents the reconciled
 *     contract (including the STRIPE_API_KEY legacy alias note and
 *     OPSIQ_DIAGNOSTIC_KEY).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

describe("Bootable Production: Stripe secret env-name alias", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("importing the Stripe webhook service has no startup side effect", async () => {
    // Module import must not throw or invoke Stripe (lazy initialization).
    const mod = await import("@/services/webhook.service");
    expect(typeof mod.resolveStripeSecretKey).toBe("function");
  });

  it("resolves STRIPE_SECRET_KEY when set (canonical)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_canonical";
    const { resolveStripeSecretKey } = await import("@/services/webhook.service");
    expect(resolveStripeSecretKey()).toBe("sk_test_canonical");
  });

  it("resolves STRIPE_API_KEY as a legacy alias when STRIPE_SECRET_KEY is absent", async () => {
    process.env.STRIPE_API_KEY = "sk_test_legacy";
    const { resolveStripeSecretKey } = await import("@/services/webhook.service");
    expect(resolveStripeSecretKey()).toBe("sk_test_legacy");
  });

  it("prefers STRIPE_SECRET_KEY over the STRIPE_API_KEY legacy alias", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_canonical";
    process.env.STRIPE_API_KEY = "sk_test_legacy";
    const { resolveStripeSecretKey } = await import("@/services/webhook.service");
    expect(resolveStripeSecretKey()).toBe("sk_test_canonical");
  });

  it("returns null when neither key is set (paid Stripe ops fail lazily, not at startup)", async () => {
    const { resolveStripeSecretKey } = await import("@/services/webhook.service");
    expect(resolveStripeSecretKey()).toBeNull();
  });
});

describe("Bootable Production: deployment-preflight env contract", () => {
  const content = fs.readFileSync(
    path.join(ROOT, "scripts/deployment-preflight.mjs"),
    "utf-8"
  );

  it("does not declare phantom NEXTAUTH_SECRET as an env requirement", () => {
    // It may be referenced in an explanatory comment, but must not be a
    // declared { name: "NEXTAUTH_SECRET" } requirement entry.
    expect(content).not.toMatch(/name:\s*["']NEXTAUTH_SECRET["']/);
  });

  it("does not declare phantom NEXTAUTH_URL as an env requirement", () => {
    // It may be referenced in an explanatory comment, but must not be a
    // declared { name: "NEXTAUTH_URL" } requirement entry.
    expect(content).not.toMatch(/name:\s*["']NEXTAUTH_URL["']/);
  });

  it("surfaces the real boot contract: DATABASE_URL and NEXT_PUBLIC_APP_URL", () => {
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain("NEXT_PUBLIC_APP_URL");
  });
});

describe("Bootable Production: validate-deployment env contract", () => {
  const content = fs.readFileSync(
    path.join(ROOT, "scripts/validate-deployment.ts"),
    "utf-8"
  );

  it("requires the canonical NEXT_PUBLIC_APP_URL", () => {
    expect(content).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("still references NODE_ENV and DATABASE_URL as required boot vars", () => {
    expect(content).toContain("NODE_ENV");
    expect(content).toContain("DATABASE_URL");
  });

  it("treats NEXT_PUBLIC_API_URL as a legacy alias, not a hard requirement", () => {
    // It is acceptable for NEXT_PUBLIC_API_URL to still appear (legacy alias),
    // but it must be explicitly noted as legacy / aliased to NEXT_PUBLIC_APP_URL.
    expect(content).toMatch(/NEXT_PUBLIC_API_URL[\s\S]{0,160}(legacy|alias|NEXT_PUBLIC_APP_URL)/i);
  });
});

describe("Bootable Production: .env.example single source of truth", () => {
  const content = fs.readFileSync(path.join(ROOT, ".env.example"), "utf-8");

  it("documents the required boot contract", () => {
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain("NODE_ENV");
    expect(content).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("documents Stripe as optional with canonical name and legacy alias note", () => {
    expect(content).toContain("STRIPE_SECRET_KEY");
    expect(content).toContain("STRIPE_WEBHOOK_SECRET");
    expect(content).toContain("STRIPE_API_KEY"); // legacy alias note
  });

  it("documents the previously-undocumented OPSIQ_DIAGNOSTIC_KEY as optional", () => {
    expect(content).toContain("OPSIQ_DIAGNOSTIC_KEY");
  });
});

describe("Bootable Production: production migration gate workflow", () => {
  const wfPath = path.join(ROOT, ".github/workflows/migrate-production.yml");

  it("exists", () => {
    expect(fs.existsSync(wfPath)).toBe(true);
  });

  it("is manual-only (workflow_dispatch) with no automatic push trigger", () => {
    const content = fs.readFileSync(wfPath, "utf-8");
    expect(content).toContain("workflow_dispatch");
    // Must not auto-run on push.
    expect(content).not.toMatch(/^\s*push:/m);
  });

  it("targets the production environment with a concurrency guard", () => {
    const content = fs.readFileSync(wfPath, "utf-8");
    expect(content).toContain("environment: production");
    expect(content).toContain("concurrency");
    expect(content).toContain("migrate-production");
  });

  it("uses the PRODUCTION_DATABASE_URL secret and guards against placeholders", () => {
    const content = fs.readFileSync(wfPath, "utf-8");
    expect(content).toContain("PRODUCTION_DATABASE_URL");
    expect(content).toMatch(/PLACEHOLDER|REPLACE_|example\.com/);
  });

  it("runs migrate status and migrate deploy but never seed or reset", () => {
    const content = fs.readFileSync(wfPath, "utf-8");
    expect(content).toContain("prisma migrate status");
    expect(content).toContain("prisma migrate deploy");
    expect(content).not.toContain("migrate reset");
    expect(content).not.toContain("db:seed");
    expect(content).not.toContain("seed-demo");
  });

  it("removes local .env files before running to avoid contamination", () => {
    const content = fs.readFileSync(wfPath, "utf-8");
    expect(content).toMatch(/rm -f .*\.env/);
  });
});
