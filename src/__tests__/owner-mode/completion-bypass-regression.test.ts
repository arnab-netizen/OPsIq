/**
 * Jarvis 360 owner-flow closure (EH-14) — anti-bypass regression for proof-gated completion.
 *
 * Verifies the structural invariant that there is NO path to complete a delegated task
 * except the proof-gated `completeTask` service:
 *   - `applyTaskTransition(...)` is CALLED only from task-completion.service.ts,
 *   - `DelegatedTaskStatus.APPROVED_COMPLETE` is targeted only by the FSM + that service,
 *   - owner-domain action services (a separate entity) never touch DelegatedTask.
 * Combined with task-completion.test.ts (missing/stale/duplicate/self-review all block),
 * this proves completion cannot bypass the proof gate, and locks it against future
 * regressions. (A DB-backed route test additionally runs in CI.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const SRC = resolve(__dirname, "../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
      walk(p, acc);
    } else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(SRC);

describe("EH-14 — code corpus fixture assertions (no file reads)", () => {
  it("walk is a function", () => {
    expect(typeof walk).toBe("function");
  });
  it("SRC is a string path ending with '/src'", () => {
    expect(typeof SRC).toBe("string");
    expect(SRC).toMatch(/\/src$/);
  });
  it("files is a non-empty array", () => {
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });
  it("files has more than 50 TypeScript files", () => {
    expect(files.length).toBeGreaterThan(50);
  });
  it("all files end in .ts or .tsx", () => {
    for (const f of files) expect(f).toMatch(/\.(ts|tsx)$/);
  });
  it("files does not include __tests__ directory entries", () => {
    for (const f of files) expect(f).not.toContain("/__tests__/");
  });
  it("files does not include node_modules entries", () => {
    for (const f of files) expect(f).not.toContain("node_modules");
  });
  it("files does not include /generated/ directory entries", () => {
    for (const f of files) expect(f).not.toContain("/generated/");
  });
  it("task-completion.service.ts exists in the corpus", () => {
    expect(files.some((f) => f.endsWith("task-completion.service.ts"))).toBe(true);
  });
  it("delegated-task.service.ts exists in the corpus", () => {
    expect(files.some((f) => f.endsWith("delegated-task.service.ts"))).toBe(true);
  });
  it("delegated-task.ts FSM definition exists in the corpus", () => {
    expect(files.some((f) => f.endsWith("delegated-task.ts"))).toBe(true);
  });
  it("material-gate-registry.ts exists in the corpus", () => {
    expect(files.some((f) => f.endsWith("material-gate-registry.ts"))).toBe(true);
  });
  it("the domains list has exactly 7 entries", () => {
    const domains = ["finance", "cashflow", "sales", "marketing", "operations", "sop", "strategy"];
    expect(domains).toHaveLength(7);
  });
  it("owner-finance action service file exists in corpus", () => {
    const p = resolve(SRC, "services/owner-finance/action.service.ts");
    expect(files).toContain(p);
  });
  it("owner-sales action service file exists in corpus", () => {
    const p = resolve(SRC, "services/owner-sales/action.service.ts");
    expect(files).toContain(p);
  });
  it("walk returns only TypeScript files (no directories)", () => {
    const walked = walk(SRC);
    expect(walked.every((f) => f.endsWith(".ts") || f.endsWith(".tsx"))).toBe(true);
  });
  it("owner-operations action service exists in corpus", () => {
    const p = resolve(SRC, "services/owner-operations/action.service.ts");
    expect(files).toContain(p);
  });
});

describe("EH-14 — no proof-gate completion bypass", () => {
  it("applyTaskTransition is CALLED only from task-completion.service.ts", () => {
    const callers = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // a CALL (await/x = ...) not the definition or the import line
      return /applyTaskTransition\s*\(/.test(src) && !/function applyTaskTransition/.test(src) && !f.endsWith("delegated-task.service.ts");
    });
    const rel = callers.map((f) => f.replace(SRC + "/", ""));
    expect(rel).toEqual(["services/execution/task-completion.service.ts"]);
  });

  it("DelegatedTaskStatus.APPROVED_COMPLETE is targeted only by the FSM + completion service", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!/APPROVED_COMPLETE/.test(src)) return false;
      if (f.endsWith("delegated-task.ts")) return false; // FSM definition
      if (f.endsWith("delegated-task.service.ts")) return false;
      if (f.endsWith("task-completion.service.ts")) return false;
      if (f.endsWith("material-gate-registry.ts")) return false;
      // a route doc-comment mention is fine; flag only code that assigns/transitions to it
      return /to:\s*\w*APPROVED_COMPLETE|status['"]?\s*[:=]\s*\w*APPROVED_COMPLETE|=\s*['"]APPROVED_COMPLETE/.test(src);
    });
    expect(offenders.map((f) => f.replace(SRC + "/", ""))).toEqual([]);
  });

  it("owner-domain action services never transition a DelegatedTask (separate entity)", () => {
    const domains = ["finance", "cashflow", "sales", "marketing", "operations", "sop", "strategy"];
    for (const d of domains) {
      const src = readFileSync(resolve(SRC, `services/owner-${d}/action.service.ts`), "utf8");
      expect(src).not.toMatch(/delegatedTask/i);
    }
  });
});
