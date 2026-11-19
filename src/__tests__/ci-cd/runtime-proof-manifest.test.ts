/** Mandatory runtime-proof gate: unit tests of the checker, plus the static vacuity ratchet over the real manifest (non-DB lane). */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { vacuityCounts, staticVacuityProblems, evaluateRuntimeProof, listProofFiles, MANIFEST_PATH } from "../../../scripts/ci/check-runtime-proof.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { classifyChangeSet } from "../../../scripts/ci-risk-classifier.mjs";

const ROOT = resolve(__dirname, "../../..");
const FILE = "src/__tests__/runtime-proof/x.test.ts";
const manifest = (o: object = {}) => ({ files: { [FILE]: { expectedTests: 2, vacuousBaseline: 0, status: "verified", ...o } } });
const report = (tests: string[], extra: object = {}) => ({ testResults: [{ name: `/repo/${FILE}`, status: "passed", assertionResults: tests.map((status, i) => ({ title: `t${i}`, status })), ...extra }] });

describe("vacuity counting", () => {
  it("counts expect(true), skipped and todo tests but not skipIf gating", () => {
    expect(vacuityCounts("expect(true).toBe(true); expect( true ); it.skip('a'); describe.skip('b'); it.todo('c'); describe.skipIf(!X)('d', () => {});")).toEqual({ expectTrue: 2, skip: 2, todo: 1 });
    expect(vacuityCounts("expect(isTrue).toBe(true); expect(x).toBe(true);")).toEqual({ expectTrue: 0, skip: 0, todo: 0 });
  });
});

describe("static vacuity ratchet", () => {
  const run = (text: string, spec: object = {}) => staticVacuityProblems({ manifest: manifest(spec), readFile: () => text });
  it("passes clean verified files; fails when vacuity grows, and when it shrinks without lowering the baseline", () => {
    expect(run("expect(a).toBe(1)")).toEqual([]);
    expect(run("expect(true).toBe(true)", { status: "tracked-vacuous", vacuousBaseline: 1 })).toEqual([]);
    expect(run("expect(true); expect(true);", { status: "tracked-vacuous", vacuousBaseline: 1 })[0]).toMatch(/exceed the recorded baseline/);
    expect(run("expect(a).toBe(1)", { status: "tracked-vacuous", vacuousBaseline: 3 })[0]).toMatch(/lower vacuousBaseline/);
    expect(run("expect(true)", { status: "verified", vacuousBaseline: 1 }).join()).toMatch(/marked verified/);
    expect(run("it.skip('x')", { status: "tracked-vacuous", vacuousBaseline: 0 })[0]).toMatch(/exceed/);
    expect(run("", { vacuousBaseline: undefined })[0]).toMatch(/vacuousBaseline missing/);
    expect(run("", { status: "weird" }).join()).toMatch(/status must be/);
    expect(staticVacuityProblems({ manifest: manifest(), readFile: () => { throw new Error("nope"); } })[0]).toMatch(/not readable/);
  });
});

describe("report evaluation (fails on any unexpected skip, count drift, missing or unlisted proof)", () => {
  const ev = (r: unknown, m = manifest(), disk = [FILE]) => evaluateRuntimeProof({ manifest: m, report: r, diskFiles: disk });
  it("passes an exact, fully passing run and records expected vs actual", () => {
    expect(ev(report(["passed", "passed"]))).toMatchObject({ problems: [], rows: [{ file: FILE, expected: 2, actual: 2 }] });
  });
  it("fails on skipped, pending, todo and failed tests, on count drift in either direction, and on a file that did not run", () => {
    for (const st of ["skipped", "pending", "todo", "failed"]) expect(ev(report(["passed", st])).problems.join(), st).toMatch(/not passed/);
    expect(ev(report(["passed"])).problems.join()).toMatch(/ran 1 tests, manifest expects 2/);
    expect(ev(report(["passed", "passed", "passed"])).problems.join()).toMatch(/ran 3 tests/);
    expect(ev({ testResults: [] }).problems.join()).toMatch(/not collected/);
    expect(ev(report([], { status: "failed", message: "import error" })).problems.join()).toMatch(/failed to run/);
    expect(ev(null as never).problems[0]).toMatch(/missing or malformed/);
    expect(ev({ notAReport: true }).problems[0]).toMatch(/missing or malformed/);
  });
  it("fails when a runtime-proof file exists on disk but is not in the manifest", () => {
    expect(ev(report(["passed", "passed"]), manifest(), [FILE, "src/__tests__/runtime-proof/new.test.ts"]).problems.join()).toMatch(/new\.test\.ts: exists under .* not in the manifest/);
  });
});

describe("classifier: runtime-proof changes and protected capabilities require the DB-risk path; cheap changes stay cheap", () => {
  const db = (paths: string[]) => classifyChangeSet(paths).dbRequired;
  it("proof files, manifest, checker and the protected product capabilities set db_required", () => {
    for (const p of [
      "src/__tests__/runtime-proof/rp6-true-concurrency-stress.test.ts", "src/__tests__/phase-3-live-runtime-integration.test.ts", ".claude/runtime-proof-manifest.json", "scripts/ci/check-runtime-proof.mjs",
      "src/services/event-emitter.ts", "src/services/event-replay-engine.ts", "src/services/snapshot-engine.ts", "src/infra/idempotency.ts",
      "src/lib/prisma-workspace-enforcement.ts", "src/lib/db.ts", "src/lib/enforced-route.ts", "src/domain/constants/capabilities.ts",
      "src/services/entitlement.service.ts", "src/middleware/tier-enforcement.ts", "src/app/api/webhooks/stripe/route.ts", "src/app/api/entitlement/quota/route.ts",
      "src/app/api/health/route.ts", "src/app/api/readiness/route.ts", "src/infra/rate-limit.ts",
      "src/lib/execution-reentry-detector.ts", "src/infra/telemetry-sanitizer.ts", "src/services/webhook.service.ts", "src/services/billing/paddle-webhook.service.ts", "src/runtime/resilience/circuit-breaker.ts",
    ]) expect(db([p]), p).toBe(true);
  });
  it("docs and unrelated cosmetic application changes do not", () => {
    expect(db(["docs/opsiq/status/MASTER_REMEDIATION_LEDGER.md"])).toBe(false);
    expect(db(["README.md"])).toBe(false);
    expect(db(["src/components/landing/PublicBetaCta.tsx"])).toBe(false);
    expect(db(["src/app/(public)/pricing/page.tsx"])).toBe(false);
  });
});

describe("the real manifest (when present): every runtime-proof file is listed and the vacuity ratchet holds", () => {
  const mp = join(ROOT, MANIFEST_PATH);
  it.skipIf(!existsSync(mp))("static ratchet passes and no proof file is unlisted", () => {
    const m = JSON.parse(readFileSync(mp, "utf8"));
    expect(staticVacuityProblems({ manifest: m, readFile: (f: string) => readFileSync(join(ROOT, f), "utf8") })).toEqual([]);
    const unlisted = (listProofFiles(ROOT) as string[]).filter((f) => !(f in m.files));
    expect(unlisted).toEqual([]);
  });
});
