/**
 * RELEASE_HOLD guard for automatic Git production deployment.
 *
 * `git.deploymentEnabled.main = false` stops Vercel's Git integration from creating a deployment for any
 * commit pushed to main (the evaluated vercel.json is the incoming commit's own, so the commit that
 * introduces the rule is not deployed either; verified on non-production branches on 2026-11-25).
 * Preview deployments for other branches are unaffected because unspecified branches default to enabled.
 *
 * To lift the hold deliberately, remove the `git` block in a reviewed change; that commit's own
 * vercel.json then enables deployment again. This test exists so the rule cannot be weakened by accident
 * (for example by a wildcard `true` rule, which Vercel resolves in favour of deploying).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));

describe("vercel.json release-hold freeze", () => {
  it("disables automatic Git deployment of main", () => {
    expect(config.git?.deploymentEnabled?.main).toBe(false);
  });

  it("has no rule that could re-enable main through a wildcard or pattern", () => {
    const rules = config.git?.deploymentEnabled ?? {};
    expect(typeof rules).toBe("object");
    for (const [pattern, enabled] of Object.entries(rules)) {
      if (enabled === true) {
        expect(pattern === "main" || /[*?[\]{}!]/.test(pattern)).toBe(false);
      }
    }
  });

  it("keeps the ignored-build step and the scheduler cron unchanged", () => {
    expect(config.ignoreCommand).toBe("node scripts/vercel-ignore-build.mjs");
    expect(config.crons).toEqual([{ path: "/api/internal/cron/scheduler", schedule: "0 3 * * *" }]);
  });
});
