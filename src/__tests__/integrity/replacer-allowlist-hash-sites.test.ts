/**
 * Hash/fingerprint inputs must cover nested content.
 *
 * Root cause: `JSON.stringify(x, Object.keys(x).sort())` passes the top-level key array as a replacer, which
 * JSON.stringify applies as a property ALLOWLIST at every depth — so any nested object serializes as {} (and an
 * object inside an array as {}) and two inputs that differ only below the top level produce the same hash.
 *
 * The three hash sites now use the repo's canonical serializer (stableStringify: recursively sorted keys,
 * undefined omitted, ISO dates). Compatibility: none of these values is ever persisted or compared across
 * processes (ExecutionJobSafety keys live in an in-memory Map; AuditOutputGenerator has no production importer;
 * chaos lock hashes are computed and verified inside one run). In addition, for the flat, plain-JSON inputs they
 * hash today the new bytes are IDENTICAL to the old ones — proven below against the legacy formula — so no
 * previously produced value changes; only inputs that used to collide now differ. Byte identity is NOT general:
 * integer-like keys are now emitted in ascending numeric order ahead of other keys (JS object key order), not
 * string-sorted, and stableStringify ignores toJSON except for Date, so values such as Decimal, URL or Buffer are
 * serialized from their own enumerable properties rather than their toJSON output.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { ExecutionJobSafety } from "@/services/execution-core/job-safety";
import { AuditOutputGenerator } from "@/services/decision-core/audit-output-generator";
import { hashExpectation } from "@/behavioral-validation/chaos-replay/chaos-replay";
import { publicCaseToChaosScenario, type ChaosScenario } from "@/behavioral-validation/chaos-replay/chaos-schema";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";

const legacySerialize = (x: Record<string, unknown>) => JSON.stringify(x, Object.keys(x).sort());
const legacyFnv = (json: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const generate = (gen: AuditOutputGenerator, inputs: Record<string, unknown>) =>
  gen.generateAuditOutput("eng-1", "ws-1", 3, 0.8, 2, 0.9, 1000, 200, 30, 3, ["g1"], [], inputs);

describe("ExecutionJobSafety job_unique_key", () => {
  it("jobs whose inputs differ only in a nested object get different keys (no false idempotent match)", () => {
    const safety = new ExecutionJobSafety();
    const a = safety.createJob("action-1", { target: { customerId: "c-1" } }, "idem-a");
    const b = safety.createJob("action-1", { target: { customerId: "c-2" } }, "idem-b");
    expect(a.job_unique_key).not.toBe(b.job_unique_key);
  });

  it("is independent of key insertion order at every depth", () => {
    const safety = new ExecutionJobSafety();
    const a = safety.createJob("action-1", { z: 1, target: { b: 2, a: 1 } }, "idem-a");
    const b = safety.createJob("action-1", { target: { a: 1, b: 2 }, z: 1 }, "idem-b");
    expect(a.job_unique_key).toBe(b.job_unique_key);
  });

  it("is byte-compatible with the legacy key for flat inputs", () => {
    const inputs = { zeta: "z", amount: 10, flag: true, tags: ["x", "y"], none: null };
    const legacy = createHash("sha256").update(`action-1:${legacySerialize(inputs)}`).digest("hex").substring(0, 16);
    expect(new ExecutionJobSafety().createJob("action-1", inputs, "idem").job_unique_key).toBe(legacy);
  });
});

describe("AuditOutputGenerator inputs_snapshot_hash / decision_id", () => {
  it("inputs that differ only in a nested object get different hashes and decision ids", () => {
    const gen = new AuditOutputGenerator();
    const a = generate(gen, { paths: { top: "pricing" } });
    const b = generate(gen, { paths: { top: "staffing" } });
    expect(a.inputs_snapshot_hash).not.toBe(b.inputs_snapshot_hash);
    expect(a.decision_id).not.toBe(b.decision_id);
  });

  it("is byte-compatible with the legacy hash for flat inputs", () => {
    const inputs = { paths_count: 3, diagnostic_confidence: 0.8, constraints_count: 2 };
    const legacy = createHash("sha256").update(legacySerialize(inputs)).digest("hex");
    expect(generate(new AuditOutputGenerator(), inputs).inputs_snapshot_hash).toBe(legacy);
  });
});

describe("chaos hashExpectation lock hash", () => {
  const scenario = publicCaseToChaosScenario(COUNTED_PUBLIC_CASES[0]);

  it("is byte-compatible with the legacy lock hash for every counted corpus scenario", () => {
    for (const pc of COUNTED_PUBLIC_CASES) {
      const s = publicCaseToChaosScenario(pc);
      expect(hashExpectation(s)).toBe(legacyFnv(legacySerialize(s as unknown as Record<string, unknown>)));
    }
  });

  it("detects a tamper below the top level", () => {
    const withNested = { ...scenario, evidence: { verified: true } } as unknown as ChaosScenario;
    const tampered = { ...scenario, evidence: { verified: false } } as unknown as ChaosScenario;
    expect(hashExpectation(withNested)).not.toBe(hashExpectation(tampered));
  });
});
