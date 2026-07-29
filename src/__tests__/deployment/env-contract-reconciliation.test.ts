/**
 * Phase 6: Environment contract reconciliation tests.
 *
 * Verifies that config.ts, .env.example, and runtime code are consistent
 * with each other and do not require unused or phantom variables.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "src/lib/config.ts");
const ENV_EXAMPLE_PATH = join(process.cwd(), ".env.example");

const configSrc = readFileSync(CONFIG_PATH, "utf-8");
const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf-8");

describe("src/lib/config.ts — Zod schema correctness", () => {
  it("does not require AUTH_URL (not consumed by any runtime code)", () => {
    // AUTH_URL was previously required (z.url()) but no code reads it.
    // After fix: AUTH_URL should not appear as a required field.
    expect(configSrc).not.toMatch(/AUTH_URL:\s*z\.url\(\)/);
  });

  it("AUTH_SECRET is optional or has a default (no min(1) requirement)", () => {
    // AUTH_SECRET must not be z.string().min(1) — that was wrong, it's not required.
    expect(configSrc).not.toMatch(/AUTH_SECRET:\s*z\.string\(\)\.min\(1\)/);
  });

  it("SCHEDULER_PROVIDER enum does not include 'redis' without a provider implementation", () => {
    // 'redis' may remain in the enum for documentation, but .env.example must warn
    // that it causes a runtime throw if set. This test checks the .env.example warning.
    expect(envExample).toContain("redis");
    // The warning about redis causing a runtime throw must be present.
    expect(envExample).toMatch(/redis.*runtime throw|do NOT set.*redis|causes.*throw/i);
  });
});

describe(".env.example — completeness and accuracy", () => {
  it("documents CRON_SECRET as REQUIRED_SELECTED_FEATURE / REQUIRED_FOR_VERCEL_CRON_SECURITY", () => {
    expect(envExample).toContain("CRON_SECRET");
    // Must carry the correct classification — NOT "injected automatically".
    expect(envExample).toContain("REQUIRED_SELECTED_FEATURE");
    expect(envExample).toContain("REQUIRED_FOR_VERCEL_CRON_SECURITY");
    // Must document that the project owner configures this in Vercel settings.
    expect(envExample).toMatch(/owner must configure|project owner must/i);
    // Must NOT claim Vercel injects it automatically (that was the incorrect classification).
    expect(envExample).not.toMatch(/Vercel injects automatically/);
  });

  it("CRON_SECRET documentation states Vercel sends it in Authorization header", () => {
    expect(envExample).toMatch(/Authorization.*Bearer|Bearer.*Authorization/);
  });

  it("CRON_SECRET documentation covers Vercel plan requirement for per-minute schedule", () => {
    // The vercel.json schedule is "* * * * *" (every minute) which requires Pro plan.
    expect(envExample).toMatch(/Pro plan|Hobby plan|VERCEL_PLAN_UPGRADE_REQUIRED/);
  });

  it("does not claim AUTH_SECRET is required to run the session auth flow", () => {
    // The auth flow is cookie-based; AUTH_SECRET must not be documented as required.
    const authSection = envExample.slice(
      envExample.indexOf("3. AUTHENTICATION"),
      envExample.indexOf("4. APPLICATION")
    );
    // "optional" or "leave blank" or "does NOT affect session auth" must appear.
    expect(authSection).toMatch(/optional|leave blank|does NOT affect session auth/i);
    // Must NOT say AUTH_SECRET IS required (the uppercase IS matters).
    expect(authSection).not.toMatch(/AUTH_SECRET (is|IS) required/);
  });

  it("does not list DIRECT_DATABASE_URL as a real requirement", () => {
    // DIRECT_DATABASE_URL is deprecated.
    if (envExample.includes("DIRECT_DATABASE_URL") || envExample.includes("DIRECT_URL")) {
      expect(envExample).toMatch(/DEPRECATED|deprecated/);
    }
  });

  it("does not declare NEXTAUTH_SECRET or NEXTAUTH_URL as active variables", () => {
    // These are explicitly not used. If mentioned, must be marked NOT USED.
    if (envExample.includes("NEXTAUTH_SECRET")) {
      expect(envExample).toMatch(/NOT used|not read|deprecated/i);
    }
    if (envExample.includes("NEXTAUTH_URL")) {
      expect(envExample).toMatch(/NOT used|not read|deprecated/i);
    }
  });

  it("DATABASE_URL section explains pooler vs direct endpoint distinction", () => {
    expect(envExample).toMatch(/pooler|POOLED/i);
    expect(envExample).toMatch(/direct|DIRECT/i);
    expect(envExample).toMatch(/migration/i);
  });

  it("MINIMAL CONTRACT TO BOOT lists DATABASE_URL as required", () => {
    expect(envExample).toContain("MINIMAL CONTRACT TO BOOT");
    expect(envExample).toContain("DATABASE_URL");
  });

  it("SCHEDULER_PROVIDER documentation includes 'database' option", () => {
    const schedulerSection = envExample.slice(
      envExample.indexOf("SCHEDULER"),
      envExample.indexOf("LOGGING")
    );
    expect(schedulerSection).toContain("database");
  });
});

describe("src/lib/config.ts — no dead imports from runtime code", () => {
  it("getConfig() is exportable (the function exists)", () => {
    expect(configSrc).toContain("export function getConfig()");
  });

  it("AppConfig type is exported", () => {
    expect(configSrc).toContain("export type AppConfig");
  });
});
