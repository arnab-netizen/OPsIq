/**
 * Stage 7 capture → trusted-verifier dispatch contract.
 *
 * Incident this locks down: stage7-trusted-verifier.yml was converted from
 * workflow_dispatch to repository_dispatch (to satisfy ci-governance-check rule 12,
 * which forbids the Actions: write grant that workflow_dispatch requires). Only the
 * verifier was changed. stage7-capture.yml kept POSTing the workflow_dispatch
 * envelope to /actions/workflows/stage7-trusted-verifier.yml/dispatches — an
 * endpoint the verifier does not answer, from a job holding only `actions: read`.
 *
 * The consequence was silent and late: a capture run would execute the observation,
 * sign the artifact, push the evidence branch and open the evidence PR, then fail on
 * the final step. The evidence PR would sit forever without a
 * stage7-evidence-trusted-verification status, so no artifact could ever reach
 * ACCEPTED and no invariant could ever be backed. The trusted verifier has never run.
 *
 * Rule 12 could not see this: it inspects only the verifier. These tests govern the
 * PAIR — trigger, endpoint, event type and payload envelope are one contract across
 * two files, and every field the verifier consumes must be a field the caller sends.
 */
import { readFileSync } from "fs";
import { join } from "path";

const CAPTURE_PATH = join(process.cwd(), ".github/workflows/stage7-capture.yml");
const VERIFIER_PATH = join(process.cwd(), ".github/workflows/stage7-trusted-verifier.yml");

const capture = readFileSync(CAPTURE_PATH, "utf-8");
const verifier = readFileSync(VERIFIER_PATH, "utf-8");

/** The `on:` block only — comments elsewhere must not be mistaken for triggers. */
function triggerBlock(src: string): string {
  const start = src.search(/^on:$/m);
  if (start < 0) throw new Error("no on: block");
  const rest = src.slice(start + 3);
  const end = rest.search(/^[a-zA-Z]/m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The `permissions:` block of the capture workflow. */
function permissionsBlock(src: string): string {
  const m = /^permissions:\n((?:\s{2}\S.*\n)+)/m.exec(src);
  return m ? m[1] : "";
}

describe("stage7 capture → trusted-verifier dispatch contract", () => {
  describe("verifier side", () => {
    it("1. declares repository_dispatch", () => {
      expect(triggerBlock(verifier)).toMatch(/^\s+repository_dispatch:/m);
    });

    it("2. declares event type stage7-verify-artifacts", () => {
      expect(triggerBlock(verifier)).toMatch(/types:\s*\[\s*stage7-verify-artifacts\s*\]/);
    });

    it("3. does not declare workflow_dispatch (would need Actions: write)", () => {
      expect(triggerBlock(verifier)).not.toMatch(/^\s+workflow_dispatch:/m);
    });

    it("6. reads its inputs from github.event.client_payload", () => {
      expect(verifier).toMatch(/github\.event\.client_payload\./);
      // A repository_dispatch payload never populates github.event.inputs.
      expect(verifier).not.toMatch(/github\.event\.inputs\./);
    });
  });

  describe("caller side", () => {
    it("3. POSTs the repository dispatch endpoint", () => {
      expect(capture).toMatch(/api\.github\.com\/repos\/\$\{?REPO\}?\/dispatches/);
    });

    it("7. never POSTs the workflow_dispatch endpoint for the verifier", () => {
      expect(capture).not.toMatch(/actions\/workflows\/stage7-trusted-verifier\.yml\/dispatches/);
    });

    it("4. sends event_type stage7-verify-artifacts", () => {
      // Extract the value actually bound to event_type, not merely any occurrence
      // of the string anywhere in the file — a log line mentioning the event type
      // must not be able to satisfy this.
      const bound = /--arg\s+event_type\s+"([^"]+)"/.exec(capture)?.[1];
      expect(bound).toBe("stage7-verify-artifacts");

      // And it must equal the type the verifier actually declares.
      const declared = /types:\s*\[\s*([A-Za-z0-9_-]+)\s*\]/.exec(triggerBlock(verifier))?.[1];
      expect(bound).toBe(declared);
    });

    it("5. wraps the fields in a client_payload envelope, not workflow_dispatch inputs", () => {
      expect(capture).toMatch(/client_payload/);
      const dispatchStep = capture.slice(capture.indexOf("- name: Dispatch trusted verifier"));
      expect(dispatchStep).not.toMatch(/\{ref:\s*\$ref,\s*inputs:/);
    });

    it("8. does not grant actions: write, and does grant contents: write", () => {
      const perms = permissionsBlock(capture);
      expect(perms).not.toMatch(/actions:\s*write/);
      expect(perms).toMatch(/contents:\s*write/);
    });

    it("keeps the dispatch fail-closed on any non-204 response", () => {
      const dispatchStep = capture.slice(capture.indexOf("- name: Dispatch trusted verifier"));
      expect(dispatchStep).toMatch(/!=\s*"204"/);
      expect(dispatchStep).toMatch(/exit 1/);
    });
  });

  describe("pairing", () => {
    it("every client_payload field the verifier reads is a field the caller sends", () => {
      const consumed = [
        ...new Set(
          [...verifier.matchAll(/github\.event\.client_payload\.([A-Za-z0-9_]+)/g)].map((m) => m[1]),
        ),
      ];
      expect(consumed.length).toBeGreaterThan(0);

      const payloadBlock = /client_payload:\s*\{([^}]*)\}/.exec(capture)?.[1] ?? "";
      expect(payloadBlock).not.toBe("");

      const missing = consumed.filter((f) => !new RegExp(`\\b${f}\\b`).test(payloadBlock));
      expect(missing).toEqual([]);
    });

    it("the verifier's trigger and the caller's endpoint are the same mechanism", () => {
      const verifierUsesRepoDispatch = /^\s+repository_dispatch:/m.test(triggerBlock(verifier));
      const callerUsesRepoDispatch = /api\.github\.com\/repos\/\$\{?REPO\}?\/dispatches/.test(capture);
      expect(callerUsesRepoDispatch).toBe(verifierUsesRepoDispatch);
    });

    it("9. no comment in either file still describes the superseded workflow_dispatch call", () => {
      // The one permitted mention is the rationale comparing the two mechanisms.
      const stale = verifier
        .split("\n")
        .filter((l) => l.trimStart().startsWith("#") && /workflow_dispatch/.test(l))
        .filter((l) => !/narrower than workflow_dispatch/.test(l));
      expect(stale).toEqual([]);

      const captureStale = capture
        .split("\n")
        .filter((l) => l.trimStart().startsWith("#") && /workflow_dispatch/.test(l))
        .filter((l) => !/needs Actions: write|workflow_dispatch envelope|with workflow_dispatch/.test(l));
      expect(captureStale).toEqual([]);
    });
  });
});
