/**
 * .claude/settings.json hook portability contract.
 *
 * Defect this pins: both hooks began with `cd /home/user/OPsIq`, a path that
 * does not exist in Codespaces (the repo is at /workspaces/OPsIq). Because the
 * commands were joined with `&&`, the failed cd short-circuited and the guard
 * was silently skipped — a failed safety check that looked like a passing one.
 *
 * These tests assert the repaired contract and, where safe, execute the hook
 * commands in controlled fixtures rather than relying on string matching alone.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface HookEntry {
  matcher: string;
  hooks: { type: string; command: string }[];
}
interface Settings {
  permissions?: unknown;
  hooks: { PostToolUse: HookEntry[]; PreToolUse: HookEntry[] };
}

const REPO_ROOT = process.cwd();
const settings: Settings = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, ".claude/settings.json"), "utf-8")
);

const postHook = settings.hooks.PostToolUse[0].hooks[0].command;
const preHook = settings.hooks.PreToolUse[0].hooks[0].command;
const allHookCommands = [
  ...settings.hooks.PostToolUse.flatMap((e) => e.hooks.map((h) => h.command)),
  ...settings.hooks.PreToolUse.flatMap((e) => e.hooks.map((h) => h.command)),
];

/** Run a hook command under /bin/sh with a controlled env and cwd. */
function runHook(
  command: string,
  opts: { cwd: string; toolInput: string; projectDir?: string }
): { status: number; output: string } {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CLAUDE_TOOL_INPUT: opts.toolInput,
  };
  if (opts.projectDir !== undefined) env.CLAUDE_PROJECT_DIR = opts.projectDir;

  try {
    const out = execFileSync("/bin/sh", ["-c", command], {
      cwd: opts.cwd,
      env,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { status: 0, output: out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

let nonRepoDir: string;
let spacedDir: string;

beforeAll(() => {
  nonRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "opsiq-hook-nonrepo-"));
  spacedDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "opsiq-hook-")), "dir with spaces");
  fs.mkdirSync(spacedDir, { recursive: true });
});

afterAll(() => {
  for (const d of [nonRepoDir, path.dirname(spacedDir)]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("1-2. no hard-coded checkout root", () => {
  it("1. no hook contains the broken /home/user/OPsIq path", () => {
    for (const cmd of allHookCommands) {
      expect(cmd).not.toContain("/home/user/OPsIq");
    }
  });

  it("2. no hook substitutes another hard-coded root such as /workspaces/OPsIq", () => {
    for (const cmd of allHookCommands) {
      expect(cmd).not.toContain("/workspaces/OPsIq");
      // Nothing may cd to an absolute path literal at all.
      expect(cmd).not.toMatch(/cd\s+\/[A-Za-z]/);
    }
  });
});

describe("3-4. portable root resolution that fails loudly", () => {
  it("3. both hooks resolve the root from CLAUDE_PROJECT_DIR with a git fallback", () => {
    for (const cmd of [postHook, preHook]) {
      expect(cmd).toContain('${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel');
    }
  });

  it("4. PostToolUse blocks loudly when the root cannot be resolved", () => {
    const r = runHook(postHook, {
      cwd: nonRepoDir,
      toolInput: '{"file_path":"prisma/schema.prisma"}',
    });
    expect(r.status).toBe(1);
    expect(r.output).toContain("BLOCKED");
    expect(r.output).toContain("guard did NOT run");
  });

  it("4b. PreToolUse blocks loudly when the root cannot be resolved", () => {
    const r = runHook(preHook, {
      cwd: nonRepoDir,
      toolInput: '{"command":"git commit -m x"}',
    });
    expect(r.status).toBe(1);
    expect(r.output).toContain("BLOCKED");
    expect(r.output).toContain("guard did NOT run");
  });

  it("4c. CLAUDE_PROJECT_DIR resolves the root even outside a git working tree", () => {
    const r = runHook(postHook, {
      cwd: nonRepoDir,
      projectDir: REPO_ROOT,
      toolInput: '{"file_path":"src/unrelated.ts"}',
    });
    expect(r.status).toBe(0);
    expect(r.output).toContain("skipped");
  });
});

describe("5-6. the guards are actually reached", () => {
  it("5. PostToolUse reaches Prisma validation when the schema changed", () => {
    const r = runHook(postHook, {
      cwd: REPO_ROOT,
      toolInput: '{"file_path":"prisma/schema.prisma"}',
    });
    expect(r.output).toContain("[hook:prisma-validate] running");
    expect(r.output).toContain("[hook:prisma-validate] PASSED");
    expect(r.status).toBe(0);
  }, 180_000);

  it("5b. PostToolUse skips explicitly when the schema did not change", () => {
    const r = runHook(postHook, {
      cwd: REPO_ROOT,
      toolInput: '{"file_path":"src/app/page.tsx"}',
    });
    expect(r.status).toBe(0);
    expect(r.output).toContain("skipped");
    expect(r.output).not.toContain("PASSED");
  });

  it("6. PreToolUse reaches the recurrence-defect scanner on a git commit", () => {
    const r = runHook(preHook, {
      cwd: REPO_ROOT,
      toolInput: '{"command":"git commit -m test"}',
    });
    expect(r.output).toContain("[hook:recurrence-scan] running");
    expect(r.output).toContain("[hook:recurrence-scan] PASSED");
    expect(r.status).toBe(0);
  }, 180_000);

  it("6b. PreToolUse stays silent for non-commit Bash calls", () => {
    const r = runHook(preHook, { cwd: REPO_ROOT, toolInput: '{"command":"ls -la"}' });
    expect(r.status).toBe(0);
    expect(r.output.trim()).toBe("");
  });
});

describe("7. a failed root resolution can never read as success", () => {
  it("blocked output reports failure and never reports the guard as passed", () => {
    for (const [cmd, input] of [
      [postHook, '{"file_path":"prisma/schema.prisma"}'],
      [preHook, '{"command":"git commit -m x"}'],
    ] as const) {
      const r = runHook(cmd, { cwd: nonRepoDir, toolInput: input });
      expect(r.status).not.toBe(0);
      expect(r.output).not.toContain("PASSED");
      expect(r.output).not.toContain("skipped");
    }
  });

  it("the guard's exit code is checked rather than a pipeline's last stage", () => {
    // The original piped prisma/scanner output straight into tail/grep, so the
    // guard's own exit status was discarded. Both hooks now capture RC first.
    for (const cmd of [postHook, preHook]) {
      expect(cmd).toContain("RC=$?");
      expect(cmd).toContain('if [ "$RC" -eq 0 ]');
    }
  });
});

describe("8. safe quoting", () => {
  it("the root is always quoted when used", () => {
    for (const cmd of [postHook, preHook]) {
      expect(cmd).toContain('cd "$ROOT"');
      expect(cmd).toContain('[ ! -d "$ROOT" ]');
      expect(cmd).not.toMatch(/cd \$ROOT(?!")/);
    }
  });

  it("a project directory containing spaces is handled", () => {
    const r = runHook(postHook, {
      cwd: os.tmpdir(),
      projectDir: spacedDir,
      toolInput: '{"file_path":"src/unrelated.ts"}',
    });
    expect(r.status).toBe(0);
    expect(r.output).toContain("skipped");
  });
});

describe("9-10. surrounding configuration is unchanged", () => {
  it("9. matcher semantics are preserved", () => {
    expect(settings.hooks.PostToolUse[0].matcher).toBe("Edit|Write");
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash");
  });

  it("10. exactly one hook entry per event and both are command hooks", () => {
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].hooks).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].hooks[0].type).toBe("command");
    expect(settings.hooks.PreToolUse[0].hooks[0].type).toBe("command");
  });

  it("10b. the permissions block is still present and non-empty", () => {
    const perms = settings.permissions as { allow?: unknown[] } | undefined;
    expect(Array.isArray(perms?.allow)).toBe(true);
    expect((perms?.allow as unknown[]).length).toBeGreaterThan(0);
  });

  it("10c. hooks do not dump the environment or secrets", () => {
    for (const cmd of allHookCommands) {
      expect(cmd).not.toMatch(/\benv\b\s*(\||$)/);
      expect(cmd).not.toContain("printenv");
      expect(cmd).not.toMatch(/DATABASE_URL|SECRET|TOKEN|PASSWORD/);
    }
  });
});
