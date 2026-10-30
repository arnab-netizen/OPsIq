/**
 * Hostile tests for the post-backup erasure ledger (Sections 7-11 of the final R2
 * activation-blocker closure). Covers every failure mode listed in Section 11, in order, plus
 * the hash-chain/signature mechanics themselves. No network, no real R2 -- pure-function input
 * throughout, mirroring the audit-event-hash-chain-validator's own test style.
 */
import { describe, it, expect } from "vitest";
import {
  buildNextLedgerRecord,
  computeRecordHash,
  reconcileRestoredBackup,
  signRecordHash,
  validateLedgerChain,
  verifyRecordSignature,
  type ErasureLedgerRecord,
} from "@/services/privacy-erasure/erasure-ledger";

const KEY = "test-erasure-ledger-signing-key-at-least-32-chars";
const WRONG_KEY = "a-completely-different-erasure-ledger-key-32plus";
const SCOPE = { workspaceId: "11111111-1111-1111-1111-111111111111", businessId: "22222222-2222-2222-2222-222222222222" };

function record(i: number, tail: ErasureLedgerRecord | null, completedAt: string, eventId = `event-${i}`): ErasureLedgerRecord {
  return buildNextLedgerRecord({ tail, erasureRequestId: `req-${i}`, erasureType: "QBO", scope: SCOPE, completedAt, signingKey: KEY, eventId });
}

function chain(timestamps: string[]): ErasureLedgerRecord[] {
  const out: ErasureLedgerRecord[] = [];
  let tail: ErasureLedgerRecord | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    const r = record(i, tail, timestamps[i]);
    out.push(r);
    tail = r;
  }
  return out;
}

describe("record construction and hash/signature mechanics", () => {
  it("the first record has sequence 0 and previousHash null; the next chains correctly", () => {
    const r0 = record(0, null, "2026-01-01T00:00:00Z");
    expect(r0.sequence).toBe(0);
    expect(r0.previousHash).toBeNull();
    const r1 = record(1, r0, "2026-01-02T00:00:00Z");
    expect(r1.sequence).toBe(1);
    expect(r1.previousHash).toBe(r0.recordHash);
  });

  it("recordHash is a pure function of content (never includes the signature itself) -- checked both against a re-derivation and against a hand-computed golden value", () => {
    const r = record(0, null, "2026-01-01T00:00:00Z");
    expect(computeRecordHash(r)).toBe(r.recordHash);

    // Non-circular check: this expected value was computed independently (node -e, sha256 over
    // the exact canonical JSON shape computeRecordHash documents), not derived by calling
    // computeRecordHash/buildNextLedgerRecord itself -- a fresh-context review correctly flagged
    // that the test above alone is circular (both sides call the same, possibly-buggy function).
    const golden = buildNextLedgerRecord({
      tail: null,
      erasureRequestId: "fixed-request-id",
      erasureType: "QBO",
      scope: { workspaceId: "11111111-1111-1111-1111-111111111111", businessId: "22222222-2222-2222-2222-222222222222" },
      completedAt: "2026-01-01T00:00:00Z",
      signingKey: KEY,
      eventId: "fixed-event-id-for-golden-test",
    });
    expect(golden.recordHash).toBe("f49f74f8a39820305d528584b8d9694698ea61d12da45221d7ce53316c2050f2");
  });

  it("verifyRecordSignature accepts the real signature and rejects the wrong key, a tampered field, or malformed hex", () => {
    const r = record(0, null, "2026-01-01T00:00:00Z");
    expect(verifyRecordSignature(r, KEY)).toBe(true);
    expect(verifyRecordSignature(r, WRONG_KEY)).toBe(false);
    expect(verifyRecordSignature({ ...r, erasureRequestId: "tampered" }, KEY)).toBe(false);
    expect(verifyRecordSignature({ ...r, signature: "not-hex" }, KEY)).toBe(false);
    expect(() => verifyRecordSignature({ ...r, signature: "aa".repeat(40) }, KEY)).not.toThrow();
  });

  it("the ledger never stores a realm id, company name, token, financial value, report payload, or email -- only the documented minimal fields", () => {
    const r = record(0, null, "2026-01-01T00:00:00Z");
    const keys = Object.keys(r);
    expect(keys.sort()).toEqual(["completedAt", "erasureRequestId", "erasureType", "eventId", "previousHash", "recordHash", "scope", "sequence", "signature", "signatureAlgorithm"].sort());
    expect(JSON.stringify(r)).not.toMatch(/realmId|companyName|email|token|report|financial/i);
  });
});

describe("validateLedgerChain: the required Section 11 failure modes", () => {
  it("an empty chain is trivially valid (no erasures ever recorded)", () => {
    expect(validateLedgerChain([], KEY)).toEqual({ valid: true, issues: [] });
  });

  it("a correctly-built chain of several records validates cleanly", () => {
    const c = chain(["2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z", "2026-01-10T00:00:00Z"]);
    expect(validateLedgerChain(c, KEY)).toEqual({ valid: true, issues: [] });
  });

  it("corrupted ledger: a tampered field breaks the content hash", () => {
    const c = chain(["2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z"]);
    const corrupted = [c[0], { ...c[1], erasureRequestId: "corrupted-request-id" }];
    const r = validateLedgerChain(corrupted, KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "HASH_MISMATCH")).toBe(true);
  });

  it("forged ledger record: a plausible-looking record signed with the WRONG key fails signature validation even if internally self-consistent", () => {
    // An attacker without ERASURE_LEDGER_SIGNING_KEY builds their own internally-consistent
    // single-record "chain" (this is the whole point of signing: a bare hash chain alone cannot
    // be told apart from an attacker-fabricated one without a secret the attacker lacks).
    const forged = buildNextLedgerRecord({ tail: null, erasureRequestId: "fake-req", erasureType: "QBO", scope: SCOPE, completedAt: "2026-01-01T00:00:00Z", signingKey: WRONG_KEY });
    const r = validateLedgerChain([forged], KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "SIGNATURE_INVALID")).toBe(true);
  });

  it("duplicate ledger record: the same eventId or sequence appearing twice is detected", () => {
    const c = chain(["2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z"]);
    const dup = [...c, { ...c[1] }]; // literal duplicate of the second record
    const r = validateLedgerChain(dup, KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "DUPLICATE_EVENT_ID")).toBe(true);
    expect(r.issues.some((i) => i.code === "DUPLICATE_SEQUENCE")).toBe(true);
  });

  it("reordered ledger: the chain's own links no longer match sequence order (tampered splice)", () => {
    const c = chain(["2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z", "2026-01-10T00:00:00Z"]);
    // Splice record 2 to (wrongly) point at record 0's hash instead of record 1's.
    const tampered = [c[0], c[1], { ...c[2], previousHash: c[0].recordHash }];
    const r = validateLedgerChain(tampered, KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "BROKEN_LINK" || i.code === "HASH_MISMATCH")).toBe(true);
  });

  it("missing event in sequence: a gap in the sequence numbers is detected", () => {
    const c = chain(["2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z", "2026-01-10T00:00:00Z"]);
    const withGap = [c[0], c[2]]; // record "1" (sequence 1, the middle one) is simply missing
    const r = validateLedgerChain(withGap, KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "SEQUENCE_GAP")).toBe(true);
  });

  it("the very first record must have sequence 0 and previousHash null, and no other record may have a null previousHash", () => {
    const bad0 = { ...record(0, null, "2026-01-01T00:00:00Z"), sequence: 5 };
    expect(validateLedgerChain([bad0], KEY).valid).toBe(false);
    const r0 = record(0, null, "2026-01-01T00:00:00Z");
    const r1 = { ...record(1, r0, "2026-01-02T00:00:00Z"), previousHash: null };
    const r = validateLedgerChain([r0, r1], KEY);
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "EMPTY_PREVIOUS_HASH_NOT_FIRST")).toBe(true);
  });
});

describe("reconcileRestoredBackup: the required Section 11 restore-reconciliation failure modes", () => {
  const validEmptyChain = validateLedgerChain([], KEY);

  it("backup predates zero erasures -> PROMOTABLE", () => {
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validEmptyChain, records: [] });
    expect(r.status).toBe("PROMOTABLE");
  });

  it("backup predates one erasure -> BLOCKED, names it", () => {
    const c = chain(["2026-02-01T00:00:00Z"]);
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c, KEY), records: c });
    expect(r.status).toBe("BLOCKED");
    expect(r.pendingErasures).toHaveLength(1);
  });

  it("backup predates multiple erasures -> BLOCKED, names all of them", () => {
    const c = chain(["2026-02-01T00:00:00Z", "2026-02-05T00:00:00Z", "2026-02-10T00:00:00Z"]);
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c, KEY), records: c });
    expect(r.status).toBe("BLOCKED");
    expect(r.pendingErasures).toHaveLength(3);
  });

  it("backup created after the erasure -> PROMOTABLE (the erasure predates the backup, nothing pending)", () => {
    const c = chain(["2026-01-01T00:00:00Z"]);
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-02-01T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c, KEY), records: c });
    expect(r.status).toBe("PROMOTABLE");
  });

  it("missing/unavailable ledger -> BLOCKED, never fails open", () => {
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: false, ledgerValidation: null, records: [] });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toMatch(/unavailable/i);
  });

  it("corrupted ledger -> BLOCKED even if no erasure would otherwise be pending", () => {
    const c = chain(["2026-01-01T00:00:00Z"]);
    const corrupted = [{ ...c[0], erasureRequestId: "tampered" }];
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-02-01T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(corrupted, KEY), records: corrupted });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toMatch(/integrity validation/i);
  });

  it("forged ledger record -> BLOCKED (ERASURE_LEDGER_FORGERY_DETECTED)", () => {
    const forged = [buildNextLedgerRecord({ tail: null, erasureRequestId: "fake", erasureType: "QBO", scope: SCOPE, completedAt: "2026-01-01T00:00:00Z", signingKey: WRONG_KEY })];
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-02-01T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(forged, KEY), records: forged });
    expect(r.status).toBe("BLOCKED");
  });

  it("a previously-reconciled erasure is correctly excluded from pendingErasures", () => {
    const c = chain(["2026-02-01T00:00:00Z"]);
    const r = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c, KEY), records: c, reconciledEventIds: new Set([c[0].eventId]) });
    expect(r.status).toBe("PROMOTABLE");
  });

  it("restored DB already contains a tombstone the ledger/backup-timestamp says shouldn't exist yet -> BLOCKED", () => {
    const c = chain(["2026-02-01T00:00:00Z"]); // erasure after the backup, per the ledger
    const r = reconcileRestoredBackup({
      backupTimestamp: "2026-01-15T00:00:00Z",
      ledgerAvailable: true,
      ledgerValidation: validateLedgerChain(c, KEY),
      records: c,
      restoredDbTombstoneEventIds: new Set([c[0].eventId]), // but the restored DB already has it!
    });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toMatch(/already contains the tombstone/i);
  });

  it("restored DB predates a tombstone the ledger/backup-timestamp says should already exist -> BLOCKED", () => {
    const c = chain(["2026-01-01T00:00:00Z"]); // erasure before the backup, per the ledger
    const r = reconcileRestoredBackup({
      backupTimestamp: "2026-02-01T00:00:00Z",
      ledgerAvailable: true,
      ledgerValidation: validateLedgerChain(c, KEY),
      records: c,
      restoredDbTombstoneEventIds: new Set(), // but the restored DB does NOT have it
    });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toMatch(/predates the tombstone/i);
  });

  it("restored DB has a tombstone for an erasure the ledger never recorded at all -> BLOCKED (either a missing/truncated ledger record, or a fabricated tombstone -- both uncertain)", () => {
    const c = chain(["2026-01-01T00:00:00Z"]); // the ledger only knows about ONE erasure
    const r = reconcileRestoredBackup({
      backupTimestamp: "2026-02-01T00:00:00Z",
      ledgerAvailable: true,
      ledgerValidation: validateLedgerChain(c, KEY),
      records: c,
      restoredDbTombstoneEventIds: new Set([c[0].eventId, "an-event-id-the-ledger-has-never-heard-of"]),
    });
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toMatch(/does not appear anywhere in the erasure ledger/i);
  });

  it("reconciliation 'fails halfway' is safe: the decision function reads no mutable module-level state, so a second, independent call (simulating a crash-and-retry with no memory of the first attempt) reaches the same decision as the first, and neither call can be fooled by the other's having run", () => {
    const c = chain(["2026-02-01T00:00:00Z", "2026-02-05T00:00:00Z"]);
    const input = { backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c, KEY), records: c };
    const first = reconcileRestoredBackup(input);
    expect(first.status).toBe("BLOCKED"); // sanity: this input is genuinely supposed to block
    // A completely independent second call, built from scratch (not reusing `first` or `input`
    // by reference in any way that could let a prior call's internal state leak through) --
    // the only way this could still equal `first` is if the function is genuinely stateless.
    const c2 = chain(["2026-02-01T00:00:00Z", "2026-02-05T00:00:00Z"]);
    const retry = reconcileRestoredBackup({ backupTimestamp: "2026-01-15T00:00:00Z", ledgerAvailable: true, ledgerValidation: validateLedgerChain(c2, KEY), records: c2 });
    expect(retry.status).toBe(first.status);
    expect(retry.pendingErasures.map((p) => p.sequence)).toEqual(first.pendingErasures.map((p) => p.sequence));
  });
});

describe("signRecordHash / low-level HMAC helper", () => {
  it("produces a 64-hex-char digest and is deterministic for the same input", () => {
    const h = signRecordHash("abc123", KEY);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(signRecordHash("abc123", KEY)).toBe(h);
    expect(signRecordHash("abc123", WRONG_KEY)).not.toBe(h);
  });
});
