/**
 * Jarvis 360 gap-closure (G06) — regression: every registered material owner path still
 * invokes its safety/decision gate. If a future change removes a gate call from a material
 * path (a silent bypass), this fails. Reads source statically (no DB, deterministic).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MATERIAL_GATE_PATHS } from "@/services/owner-mode/material-gate-registry";

const repoRoot = resolve(__dirname, "../../..");

describe("material gate registry", () => {
  it("registers at least the known material owner paths", () => {
    const ids = MATERIAL_GATE_PATHS.map((p) => p.id);
    expect(ids).toContain("recommendation.approve");
    expect(ids).toContain("task.complete");
    expect(ids).toContain("approval.enforce");
    expect(ids).toContain("recommendation.generate.arbitrate");
  });

  it.each(MATERIAL_GATE_PATHS.map((p) => [p.id, p]))(
    "path %s still invokes its enforcing symbol",
    (_id, path) => {
      const src = readFileSync(resolve(repoRoot, (path as { file: string }).file), "utf8");
      expect(src).toContain((path as { enforcingSymbol: string }).enforcingSymbol);
    }
  );
});
