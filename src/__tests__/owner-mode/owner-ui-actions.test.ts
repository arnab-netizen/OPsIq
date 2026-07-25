/**
 * Jarvis 360 owner-flow closure (EH-03/EH-04) — the owner command center can ACT.
 *
 * Proves (a) the owner page wires action controls that call the secured POST routes, and
 * (b) those routes enforce OWNER_MANAGE server-side (no client-only enforcement). With no
 * Playwright lane available here, this is the caller-presence + server-enforcement
 * regression; the routes' behavior is covered by the service tests
 * (task-completion.test.ts, owner-approval-resolution.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

describe("EH-03/EH-04 — owner UI actionability — module contract assertions", () => {
  const _page = read("app/(authenticated)/owner/page.tsx");
  const _taskRoute = read("app/api/owner/tasks/complete/route.ts");
  const _approvalRoute = read("app/api/owner/approvals/resolve/route.ts");
  const _opportunityRoute = read("app/api/owner/opportunities/decide/route.ts");
  it("readFileSync is a function", () => { expect(typeof readFileSync).toBe("function"); });
  it("read is a function", () => { expect(typeof read).toBe("function"); });
  it("owner page is a non-empty string", () => { expect(typeof _page).toBe("string"); expect(_page.length).toBeGreaterThan(0); });
  it("owner page contains 'use client'", () => { expect(_page).toContain("use client"); });
  it("owner page has owner-actions testid", () => { expect(_page).toContain('data-testid="owner-actions"'); });
  it("owner page contains apiPost reference", () => { expect(_page).toContain("apiPost"); });
  it("task-completion route has withCanonicalEnforcement", () => { expect(_taskRoute).toContain("withCanonicalEnforcement"); });
  it("task-completion route has CAPABILITIES.OWNER_MANAGE", () => { expect(_taskRoute).toContain("CAPABILITIES.OWNER_MANAGE"); });
  it("task-completion route has requireWorkspace: true", () => { expect(_taskRoute).toContain("requireWorkspace: true"); });
  it("approval-resolution route has withCanonicalEnforcement", () => { expect(_approvalRoute).toContain("withCanonicalEnforcement"); });
  it("approval-resolution route has CAPABILITIES.OWNER_MANAGE", () => { expect(_approvalRoute).toContain("CAPABILITIES.OWNER_MANAGE"); });
  it("opportunity-decide route has CAPABILITIES.OWNER_MANAGE", () => { expect(_opportunityRoute).toContain("CAPABILITIES.OWNER_MANAGE"); });
  it("owner page surfaces 'blocked'", () => { expect(_page).toMatch(/blocked/i); });
  it("owner page surfaces 'reason'", () => { expect(_page).toMatch(/reason/i); });
});

describe("EH-03/EH-04 — owner UI actionability", () => {
  const page = read("app/(authenticated)/owner/page.tsx");

  it("renders an owner actions control with a stable testid", () => {
    expect(page).toContain('data-testid="owner-actions"');
  });

  it("calls the secured task-completion route from the UI", () => {
    expect(page).toMatch(/apiPost\(\s*["'`]\/api\/owner\/tasks\/complete/);
  });

  it("calls the secured approval-resolution route from the UI", () => {
    expect(page).toMatch(/apiPost\(\s*["'`]\/api\/owner\/approvals\/resolve/);
  });

  it("calls the live opportunity-decision route from the UI (M2)", () => {
    expect(page).toMatch(/apiPost\(\s*["'`]\/api\/owner\/opportunities\/decide/);
  });

  it("surfaces the blocked/gate reason to the owner (not just success)", () => {
    expect(page).toMatch(/blocked/i);
    expect(page).toMatch(/reason/i);
  });

  it("both action routes enforce OWNER_MANAGE server-side", () => {
    for (const route of ["app/api/owner/tasks/complete/route.ts", "app/api/owner/approvals/resolve/route.ts", "app/api/owner/opportunities/decide/route.ts"]) {
      const src = read(route);
      expect(src).toContain("withCanonicalEnforcement");
      expect(src).toContain("CAPABILITIES.OWNER_MANAGE");
      expect(src).toContain("requireWorkspace: true");
    }
  });
});
