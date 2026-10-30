/**
 * Post-backup erasure ledger: the minimum safe external record of every erasure event, so that
 * restoring an R2 backup taken BEFORE a later erasure can still know that erasure happened
 * (Section 7/8/9/10/11 of the R2 backup activation-blocker closure; `POST_BACKUP_ERASURE_LEDGER_REQUIRED`).
 *
 * WHY EXTERNAL: if backup B predates erasure E, B also predates E's own tombstone, wherever that
 * tombstone lives inside the database B captured. Restoring B brings back the pre-erasure copy of
 * that very tombstone table, so the restored database cannot, by itself, know E happened. This
 * ledger must therefore live outside any backup's content, outside Production Postgres, and
 * outside Neon history/branches (none of those survive being restored FROM).
 *
 * WHAT IT NEVER STORES: no realm id, company name, token, financial value, report payload, or
 * email. Only: a stable event id, a monotonic sequence number, the erasure's own already-governed
 * request id (linkage without payload -- the request id alone carries no customer data), its
 * type, its minimal scope identifiers (the same ErasureScope shape qbo-erasure.service.ts already
 * uses -- workspaceId/businessId UUIDs, not new identifiers), and its completion timestamp.
 *
 * TAMPER EVIDENCE: reuses TWO existing conventions rather than inventing new cryptographic
 * infrastructure (per this mission's own "prefer reuse" instruction):
 *   1. A hash chain, in the same shape as src/services/audit-event-hash-chain-validator.ts
 *      (each record's hash covers the previous record's hash plus its own content) -- this
 *      detects reordering, insertion, and deletion of records within an otherwise-plausible chain.
 *   2. An HMAC-SHA256 signature over each record, using ERASURE_LEDGER_SIGNING_KEY -- a secret
 *      that is NEVER backup-write's MANIFEST_SIGNING_KEY and never present in backup-write or
 *      backup-recovery at all. A bare hash chain alone cannot stop an attacker who holds R2 write
 *      access to this prefix from fabricating an entirely new, internally-consistent chain; the
 *      signature is what BACKUP_WRITER_CAN_MUTATE_ERASURE_LEDGER=NO actually rests on.
 */
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export type ErasureType = "QBO" | "GENERAL";

export interface ErasureLedgerScope {
  workspaceId: string;
  businessId: string;
}

/** The signed, chained content of one ledger entry. `recordHash`/`signature` are computed over
 * everything else here plus `previousHash` -- see computeRecordHash/signLedgerRecord. */
export interface ErasureLedgerRecord {
  eventId: string;
  sequence: number;
  erasureRequestId: string;
  erasureType: ErasureType;
  scope: ErasureLedgerScope;
  completedAt: string; // ISO-8601
  previousHash: string | null; // null only for sequence 0
  recordHash: string;
  signatureAlgorithm: "HMAC-SHA256";
  signature: string;
}

/** Same hashed-content shape as AuditEventHashChainValidator.computeHash: previousHash plus the
 * record's own content, JSON-stringified deterministically (fixed key order below, not
 * object-insertion-order-dependent) and SHA-256'd. */
export function computeRecordHash(r: Omit<ErasureLedgerRecord, "recordHash" | "signatureAlgorithm" | "signature">): string {
  const canonical = JSON.stringify({
    previousHash: r.previousHash,
    eventId: r.eventId,
    sequence: r.sequence,
    erasureRequestId: r.erasureRequestId,
    erasureType: r.erasureType,
    scope: { workspaceId: r.scope.workspaceId, businessId: r.scope.businessId },
    completedAt: r.completedAt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Signs recordHash with the ledger's own, separate signing key -- never backup-write's key. */
export function signRecordHash(recordHash: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(recordHash).digest("hex");
}

/** Constant-time signature check, same convention as r2-backup-domain.ts's verifyManifestSignature.
 * Recomputes the content hash itself rather than trusting the record's own stored `recordHash`
 * field -- a record whose content was tampered with but whose recordHash/signature pair was left
 * untouched must still fail here, not only in validateLedgerChain's separate hash check. This
 * makes the function safe to rely on in isolation, not only as part of the full chain validator. */
export function verifyRecordSignature(r: ErasureLedgerRecord, signingKey: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(r.signature)) return false;
  const actualContentHash = computeRecordHash(r);
  if (actualContentHash !== r.recordHash) return false;
  const expected = signRecordHash(actualContentHash, signingKey);
  const a = Buffer.from(r.signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Builds the next record given the chain's current tail (or null for the first-ever record) and
 * the new erasure's details. Pure: the caller is responsible for actually appending it to
 * durable storage (R2) -- this function only computes a correctly-chained, correctly-signed
 * record, it does not perform any I/O. */
export function buildNextLedgerRecord(input: {
  tail: ErasureLedgerRecord | null;
  erasureRequestId: string;
  erasureType: ErasureType;
  scope: ErasureLedgerScope;
  completedAt: string;
  signingKey: string;
  eventId?: string; // injectable only for deterministic tests; defaults to a fresh UUID
}): ErasureLedgerRecord {
  const sequence = input.tail ? input.tail.sequence + 1 : 0;
  const previousHash = input.tail ? input.tail.recordHash : null;
  const base = {
    eventId: input.eventId ?? randomUUID(),
    sequence,
    erasureRequestId: input.erasureRequestId,
    erasureType: input.erasureType,
    scope: input.scope,
    completedAt: input.completedAt,
    previousHash,
  };
  const recordHash = computeRecordHash(base);
  const signature = signRecordHash(recordHash, input.signingKey);
  return { ...base, recordHash, signatureAlgorithm: "HMAC-SHA256", signature };
}

export type LedgerChainIssueCode =
  | "EMPTY_PREVIOUS_HASH_NOT_FIRST"
  | "NONEMPTY_PREVIOUS_HASH_ON_FIRST"
  | "BROKEN_LINK"
  | "HASH_MISMATCH"
  | "SIGNATURE_INVALID"
  | "SEQUENCE_NOT_MONOTONIC"
  | "SEQUENCE_GAP"
  | "DUPLICATE_SEQUENCE"
  | "DUPLICATE_EVENT_ID";

export interface LedgerChainIssue {
  index: number;
  code: LedgerChainIssueCode;
  detail: string;
}

export interface LedgerChainValidation {
  valid: boolean;
  issues: LedgerChainIssue[];
}

/** Validates deterministic ordering, hash-chain integrity, AND signature validity for every
 * record, in the same spirit as AuditEventHashChainValidator.validateChain but extended with the
 * HMAC check this ledger's threat model requires (plain SHA-256 alone cannot detect a
 * self-consistent forged chain from someone who merely has R2 write access, since SHA-256 with no
 * secret is a public function anyone can compute correctly for fabricated content). Never throws;
 * returns every issue found rather than stopping at the first, since a hostile caller needs the
 * full picture to decide RESTORE_PROMOTION=BLOCKED with a clear reason. */
export function validateLedgerChain(records: readonly ErasureLedgerRecord[], signingKey: string): LedgerChainValidation {
  const issues: LedgerChainIssue[] = [];
  const seenEventIds = new Set<string>();
  const seenSequences = new Set<number>();
  const sorted = [...records].sort((a, b) => a.sequence - b.sequence);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (seenEventIds.has(r.eventId)) issues.push({ index: i, code: "DUPLICATE_EVENT_ID", detail: `eventId ${r.eventId} appears more than once` });
    seenEventIds.add(r.eventId);
    if (seenSequences.has(r.sequence)) issues.push({ index: i, code: "DUPLICATE_SEQUENCE", detail: `sequence ${r.sequence} appears more than once` });
    seenSequences.add(r.sequence);

    if (i === 0) {
      if (r.sequence !== 0) issues.push({ index: i, code: "SEQUENCE_NOT_MONOTONIC", detail: `first record must have sequence 0, got ${r.sequence}` });
      if (r.previousHash !== null) issues.push({ index: i, code: "NONEMPTY_PREVIOUS_HASH_ON_FIRST", detail: "the first record must have previousHash=null" });
    } else {
      const prev = sorted[i - 1];
      if (r.sequence !== prev.sequence + 1) {
        issues.push({ index: i, code: r.sequence <= prev.sequence ? "SEQUENCE_NOT_MONOTONIC" : "SEQUENCE_GAP", detail: `expected sequence ${prev.sequence + 1}, got ${r.sequence}` });
      }
      if (r.previousHash === null) issues.push({ index: i, code: "EMPTY_PREVIOUS_HASH_NOT_FIRST", detail: "only the first record may have previousHash=null" });
      else if (r.previousHash !== prev.recordHash) issues.push({ index: i, code: "BROKEN_LINK", detail: `previousHash does not match the prior record's recordHash` });
    }

    const expectedHash = computeRecordHash(r);
    if (r.recordHash !== expectedHash) issues.push({ index: i, code: "HASH_MISMATCH", detail: `recordHash does not match recomputed content hash -- record was altered` });
    if (!verifyRecordSignature(r, signingKey)) issues.push({ index: i, code: "SIGNATURE_INVALID", detail: `signature does not verify -- forged or tampered, or signed with a different key` });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Closes a gap this closure's own review found: a chain can be perfectly VALID (no tampering)
 * while still being INCOMPLETE -- an operator who forgets to run append-erasure-ledger.ts after
 * a real erasure leaves the existing chain untouched and genuinely valid, so validateLedgerChain
 * alone would never catch the omission, and GLOBAL_SECURE_DELETE_LEDGER_GATED could then be
 * satisfied for an erasure that was never actually recorded. Callers that just completed a
 * specific erasure (identified by its own erasureRequestId, already known from the execute
 * command's own output -- not the ledger's separately-generated eventId) should pass it here
 * alongside the validated chain before treating the ledger as sufficient evidence for THAT
 * erasure specifically.
 */
export function chainRecordsErasure(records: readonly ErasureLedgerRecord[], erasureRequestId: string): boolean {
  return records.some((r) => r.erasureRequestId === erasureRequestId);
}

export type RestorePromotionStatus = "PROMOTABLE" | "BLOCKED";

export interface RestoreReconciliationResult {
  status: RestorePromotionStatus;
  reason: string;
  pendingErasures: ErasureLedgerRecord[];
}

/**
 * RESTORE_NOT_SERVICEABLE_UNTIL_ERASURE_RECONCILED, as a decision function: given a restored
 * backup's own timestamp and the (already-validated) ledger, decides whether promotion/
 * serviceability may proceed. BLOCKED on any uncertainty -- a missing/unavailable/invalid ledger,
 * or any ledger entry whose erasure happened after the backup's timestamp and has not been
 * separately marked as reconciled by the caller. This function does not itself reapply or verify
 * any erasure; it only decides whether the caller may proceed, and lists exactly which erasures
 * still need handling.
 */
export function reconcileRestoredBackup(input: {
  backupTimestamp: string; // ISO-8601, the restored backup's own manifest timestamp_utc
  ledgerAvailable: boolean;
  ledgerValidation: LedgerChainValidation | null; // null only if ledgerAvailable is false
  records: readonly ErasureLedgerRecord[]; // ignored if ledgerAvailable is false
  reconciledEventIds?: ReadonlySet<string>; // erasures the caller has already independently re-verified/re-applied
  /** Erasure event ids whose tombstone the RESTORED DATABASE's own state already shows as
   * applied (e.g. a row in privacy_erasure_requests/an equivalent marker). Used only for the
   * cross-consistency check below; omit if this information was not gathered. */
  restoredDbTombstoneEventIds?: ReadonlySet<string>;
}): RestoreReconciliationResult {
  if (!input.ledgerAvailable) {
    return { status: "BLOCKED", reason: "erasure ledger is unavailable -- cannot prove no erasure happened after this backup", pendingErasures: [] };
  }
  if (!input.ledgerValidation || !input.ledgerValidation.valid) {
    return { status: "BLOCKED", reason: "erasure ledger failed integrity validation (corrupted, forged, reordered, or otherwise invalid) -- uncertain = block", pendingErasures: [] };
  }
  const backupTime = new Date(input.backupTimestamp).getTime();
  if (!Number.isFinite(backupTime)) {
    return { status: "BLOCKED", reason: "backup timestamp could not be parsed -- cannot determine which erasures postdate it", pendingErasures: [] };
  }
  const reconciled = input.reconciledEventIds ?? new Set<string>();
  const pendingErasures = input.records.filter((r) => {
    const t = new Date(r.completedAt).getTime();
    return Number.isFinite(t) && t > backupTime && !reconciled.has(r.eventId);
  });

  // Cross-consistency check: the restored DB's own tombstone state must agree with what the
  // ledger says should (or should not) be there. A mismatch means the backup's claimed timestamp
  // is itself untrustworthy -- treated as uncertain, never silently accepted.
  if (input.restoredDbTombstoneEventIds) {
    const pendingIds = new Set(pendingErasures.map((r) => r.eventId));
    const knownEventIds = new Set(input.records.map((r) => r.eventId));
    for (const r of input.records) {
      const dbHasTombstone = input.restoredDbTombstoneEventIds.has(r.eventId);
      const ledgerSaysAfterBackup = pendingIds.has(r.eventId);
      if (ledgerSaysAfterBackup && dbHasTombstone) {
        return {
          status: "BLOCKED",
          reason: `restored DB already contains the tombstone for erasure ${r.eventId}, but the ledger/backup timestamp claims that erasure happened after this backup -- the backup's claimed timestamp is inconsistent with its own content`,
          pendingErasures,
        };
      }
      if (!ledgerSaysAfterBackup && !dbHasTombstone && new Date(r.completedAt).getTime() <= backupTime) {
        return {
          status: "BLOCKED",
          reason: `restored DB predates the tombstone for erasure ${r.eventId} even though the ledger/backup timestamp claims that erasure happened before this backup was taken -- the backup's claimed timestamp is inconsistent with its own content`,
          pendingErasures,
        };
      }
    }
    // The restored DB may ALSO hold a tombstone for an event the ledger never recorded at all --
    // either the ledger is missing a record (a truncation/omission, exactly the failure mode the
    // erasure-ledger/ Bucket Lock in scripts/r2-bucket-lock-config.json defends against) or the DB
    // holds a fabricated/unexplained tombstone. Either way this is uncertain, never silently
    // accepted (a fresh-context review found this case was previously unexamined).
    for (const eventId of input.restoredDbTombstoneEventIds) {
      if (!knownEventIds.has(eventId)) {
        return {
          status: "BLOCKED",
          reason: `restored DB contains a tombstone for erasure ${eventId}, which does not appear anywhere in the erasure ledger -- the ledger may be missing a record (possible truncation) or the DB holds an unexplained tombstone`,
          pendingErasures,
        };
      }
    }
  }

  if (pendingErasures.length > 0) {
    return { status: "BLOCKED", reason: `${pendingErasures.length} erasure event(s) occurred after this backup and have not been reconciled`, pendingErasures };
  }
  return { status: "PROMOTABLE", reason: "no unreconciled erasures postdate this backup", pendingErasures: [] };
}
