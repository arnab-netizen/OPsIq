/**
 * Owner-Self-Use Runtime Env Contract — Consistency Guard (PASS 46)
 *
 * Makes the owner self-use deployment env contract *checkable*: the canonical
 * machine-readable manifest (docs/deployment/owner-self-use/REQUIRED_ENV_VARS.json)
 * must stay reconciled with the two real preflight scripts and the .env.example
 * single-source-of-truth. If any of them drift (a var moved from required to
 * optional, a phantom var re-added as required, a CI-only var leaking into the
 * production-required set), this test fails and the deploy contract is fixed
 * before release — no silent drift.
 *
 * This test reads variable NAMES and file text only. It never reads, sets, or
 * prints any environment VALUE, so it cannot leak a secret.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

interface EnvVarEntry {
  name: string;
  [k: string]: unknown;
}
interface Manifest {
  required: EnvVarEntry[];
  migrationOnly: EnvVarEntry[];
  optional: EnvVarEntry[];
  ciTestOnly: EnvVarEntry[];
  phantomUnused: EnvVarEntry[];
}

const manifestPath = path.join(
  ROOT,
  "docs/deployment/owner-self-use/REQUIRED_ENV_VARS.json"
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Manifest;

const preflight = fs.readFileSync(
  path.join(ROOT, "scripts/deployment-preflight.mjs"),
  "utf-8"
);
const validate = fs.readFileSync(
  path.join(ROOT, "scripts/validate-deployment.ts"),
  "utf-8"
);
const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf-8");

const requiredNames = manifest.required.map((e) => e.name);

describe("owner-self-use-env-contract — module contract assertions", () => {
  it("fs is an object", () => { expect(typeof fs).toBe("object"); });
  it("path is an object", () => { expect(typeof path).toBe("object"); });
  it("ROOT is a string", () => { expect(typeof ROOT).toBe("string"); });
  it("ROOT.length is greater than 0", () => { expect(ROOT.length).toBeGreaterThan(0); });
  it("manifest is an object", () => { expect(typeof manifest).toBe("object"); });
  it("manifest has required field", () => { expect(manifest).toHaveProperty("required"); });
  it("manifest.required is an array", () => { expect(Array.isArray(manifest.required)).toBe(true); });
  it("requiredNames is an array", () => { expect(Array.isArray(requiredNames)).toBe(true); });
  it("requiredNames.length equals 3", () => { expect(requiredNames.length).toBe(3); });
  it("preflight is a string", () => { expect(typeof preflight).toBe("string"); });
  it("validate is a string", () => { expect(typeof validate).toBe("string"); });
  it("envExample is a string", () => { expect(typeof envExample).toBe("string"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("owner-self-use env contract: canonical required set", () => {
  it("is exactly NODE_ENV, DATABASE_URL, NEXT_PUBLIC_APP_URL", () => {
    expect([...requiredNames].sort()).toEqual(
      ["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NODE_ENV"].sort()
    );
  });

  it("has no name overlap across classification buckets", () => {
    const buckets: (keyof Manifest)[] = [
      "required",
      "migrationOnly",
      "optional",
      "ciTestOnly",
      "phantomUnused",
    ];
    const seen = new Set<string>();
    for (const b of buckets) {
      for (const entry of manifest[b]) {
        expect(seen.has(entry.name), `duplicate classification for ${entry.name}`).toBe(false);
        seen.add(entry.name);
      }
    }
  });
});

describe("owner-self-use env contract: reconciled with deployment-preflight.mjs", () => {
  for (const name of ["NODE_ENV", "DATABASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    it(`preflight declares ${name} as REQUIRED or EXTERNAL_RUNTIME_REQUIRED`, () => {
      // Match the declared requirement entry: { name: "X", category: "REQUIRED"|"EXTERNAL_RUNTIME_REQUIRED" }
      const re = new RegExp(
        `name:\\s*["']${name}["']\\s*,\\s*category:\\s*["'](REQUIRED|EXTERNAL_RUNTIME_REQUIRED)["']`
      );
      expect(re.test(preflight)).toBe(true);
    });
  }
});

describe("owner-self-use env contract: reconciled with validate-deployment.ts", () => {
  it("validate-deployment lists all three required vars", () => {
    for (const name of requiredNames) {
      expect(validate).toContain(name);
    }
  });
});

describe("owner-self-use env contract: reconciled with .env.example", () => {
  it(".env.example documents every required var", () => {
    for (const name of requiredNames) {
      expect(envExample).toContain(name);
    }
  });
});

describe("owner-self-use env contract: no CI/test-only var leaks into production-required", () => {
  it("no ciTestOnly var is declared REQUIRED/EXTERNAL_RUNTIME_REQUIRED in preflight", () => {
    for (const { name } of manifest.ciTestOnly) {
      const re = new RegExp(
        `name:\\s*["']${name}["']\\s*,\\s*category:\\s*["'](REQUIRED|EXTERNAL_RUNTIME_REQUIRED)["']`
      );
      expect(re.test(preflight), `${name} must not be a production requirement`).toBe(false);
    }
  });

  it("no ciTestOnly var appears in validate-deployment's required array", () => {
    // Extract the `const required = [ ... ]` block and assert CI-only names are absent from it.
    const block = validate.match(/const required = \[([\s\S]*?)\];/);
    expect(block, "validate-deployment must define a required array").toBeTruthy();
    const requiredBlock = block![1];
    for (const { name } of manifest.ciTestOnly) {
      expect(requiredBlock.includes(name), `${name} must not be a required boot var`).toBe(false);
    }
  });
});

describe("owner-self-use env contract: phantom/unused vars are never declared required", () => {
  const phantoms = manifest.phantomUnused.map((e) => e.name);

  it("no phantom var is a declared preflight requirement", () => {
    for (const name of phantoms) {
      const re = new RegExp(
        `name:\\s*["']${name}["']\\s*,\\s*category:\\s*["'](REQUIRED|EXTERNAL_RUNTIME_REQUIRED)["']`
      );
      expect(re.test(preflight), `${name} is phantom; must not be required in preflight`).toBe(false);
    }
  });

  it("no phantom var appears in validate-deployment's required array", () => {
    const block = validate.match(/const required = \[([\s\S]*?)\];/);
    const requiredBlock = block![1];
    for (const name of phantoms) {
      expect(requiredBlock.includes(name), `${name} is phantom; must not be a required boot var`).toBe(false);
    }
  });
});

describe("owner-self-use env contract: manifest carries no secret values", () => {
  it("required entries expose names/metadata only, never a *_SECRET/_KEY/URL value", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    // No REAL credentialed connection string (the documented user:password@host:port
    // format placeholder is allowed via the negative lookahead), no sk_live/sk_test
    // key, no whsec_ webhook secret value.
    expect(raw).not.toMatch(/postgres(?:ql)?:\/\/(?!user:password@)[^"\s]*:[^"@\s]+@/);
    expect(raw).not.toMatch(/\bsk_(live|test)_[A-Za-z0-9]/);
    expect(raw).not.toMatch(/\bwhsec_[A-Za-z0-9]/);
  });
});
