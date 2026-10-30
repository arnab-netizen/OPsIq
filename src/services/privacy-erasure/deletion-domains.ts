/**
 * Global secure-delete boundary for QuickBooks / Intuit User Data.
 *
 * Intuit's Developer Terms define "Securely Delete" as permanent sanitisation so
 * that the data is unrecoverable from any and all media. Erasing the live
 * database rows is therefore necessary but NOT sufficient: every other place a
 * recoverable copy can exist is a deletion domain that must be handled before the
 * erasure may be reported as complete.
 *
 * This module is pure (no I/O). The erasure tool proves the DATABASE domain itself
 * (structural verification). The remaining domains are outside the database, so
 * the operator attests each one with the time the purge was confirmed; an
 * attestation earlier than the database erasure is rejected because it cannot
 * cover a copy that did not yet reflect the erasure.
 *
 *   DATABASE_ERASURE=PASS with GLOBAL_SECURE_DELETE=INCOMPLETE is NOT total
 *   erasure success and must never be reported as such.
 */

export const EXTERNAL_DELETION_DOMAINS = [
  {
    code: "GITHUB_BACKUP_ARTIFACTS",
    option: "attest-github-backup-artifacts",
    what: "every scheduled-backup pg_dump artifact created before the erasure (see scripts/privacy/purge-backup-artifacts.ts). Historical: the GitHub-artifact backup path this covers is disabled_manually; this domain remains meaningful for any artifact created while it was active and is not renamed or removed when R2_BACKUPS is added below.",
  },
  {
    code: "NEON_HISTORY_WINDOW",
    option: "attest-neon-history-window",
    what: "the Neon point-in-time history window has fully elapsed since the erasure (or history was disabled before erasing), so no restore point still holds the data",
  },
  {
    code: "NEON_BRANCHES",
    option: "attest-neon-branches",
    what: "no Neon branch created from a point before the erasure still exists (delete or recreate them)",
  },
  {
    code: "OPERATOR_EXPORTS",
    option: "attest-operator-exports",
    what: "no operator-made dump, export or restore copy that contained the data still exists",
  },
  {
    code: "R2_BACKUPS",
    // NOT a point-in-time purge attestation like the domains above: Option B's QBO backup gate
    // (scripts/backup-qbo-gate.sh, #642) makes every successfully created R2 backup structurally
    // incapable of containing QBO/Intuit User Data in the first place, so there is nothing to
    // purge-by-date for this domain. Status is a CLEAN/NOT_APPLICABLE/PENDING/FAIL verdict from
    // the R2 backup-domain verifier (scripts/privacy/verify-r2-backup-domain.ts), supplied via
    // --r2-backups-status, not via this option (see r2BackupsStatusFromOptions below). The
    // `option` field here is a documentation/registry placeholder only -- attestationsFromOptions
    // deliberately excludes this domain from its generic timestamp handling.
    option: "r2-backups-status",
    what: "the R2 backup-domain verifier confirms every object under the private encrypted-backup bucket's backups/ prefix is CLEAN of QuickBooks/Intuit User Data (structural proof via the QBO backup gate, not a purge-by-date) or NOT_APPLICABLE; an unverifiable or unclassifiable object blocks this domain (see scripts/privacy/verify-r2-backup-domain.ts)",
  },
] as const;

/** Longest documented Neon history window (Scale plan, 30 days). */
export const NEON_MAX_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ExternalDeletionDomainCode = (typeof EXTERNAL_DELETION_DOMAINS)[number]["code"];

/** CLEAN/NOT_APPLICABLE satisfy the R2_BACKUPS domain; PENDING/FAIL (or omitted) block it. */
const R2_BACKUP_STATUSES = ["CLEAN", "NOT_APPLICABLE", "PENDING", "FAIL"] as const;
export type R2BackupDomainStatus = (typeof R2_BACKUP_STATUSES)[number];

/** VALID satisfies the ledger half of the R2_BACKUPS gate; INVALID/UNAVAILABLE (or omitted) block
 * it -- see erasureLedgerStatus below (GLOBAL_SECURE_DELETE_LEDGER_GATED). */
const ERASURE_LEDGER_STATUSES = ["VALID", "INVALID", "UNAVAILABLE"] as const;
export type ErasureLedgerDomainStatus = (typeof ERASURE_LEDGER_STATUSES)[number];

export type GlobalSecureDeleteStatus = "COMPLETE" | "INCOMPLETE";

export interface GlobalSecureDeleteReport {
  /** Result of the structural database verification only. */
  databaseErasure: "PASS" | "FAIL";
  /** COMPLETE only when the database erasure passed AND every external domain is validly attested. */
  globalSecureDelete: GlobalSecureDeleteStatus;
  /** External domains with no attestation yet (or none valid). */
  pendingDomains: ExternalDeletionDomainCode[];
  /** Attestations supplied but rejected, with the reason. */
  rejectedAttestations: { code: ExternalDeletionDomainCode; reason: string }[];
  /** Known branches/snapshots that may still hold the target's Intuit data. Any entry blocks PASS. */
  blockingCopies: BlockingNeonCopy[];
}

/** attestations: domain code -> ISO-8601 time at which the operator confirmed the purge. */
export function evaluateGlobalSecureDelete(input: {
  databaseVerification: "PASS" | "FAIL";
  executedAt: Date;
  attestations: Partial<Record<ExternalDeletionDomainCode, string>>;
  /**
   * The project's configured Neon history window. Fail-safe default is the longest
   * documented window (30 days): history cannot be row-purged, so it only leaves
   * once the whole window has elapsed since the erasure.
   */
  neonHistoryWindowMs?: number;
  now?: Date;
  /**
   * Live Neon branch/snapshot inventory captured AFTER the erasure. Without it the NEON_BRANCHES domain
   * can never be attested: a copy we have not listed is a copy we cannot claim is gone.
   */
  neonInventory?: NeonInventory;
  /** When Intuit data first entered the database (earliest import). Omitted = assume always present. */
  dataFirstImportedAt?: Date;
  /**
   * Structural CLEAN/NOT_APPLICABLE/PENDING/FAIL verdict from the R2 backup-domain verifier.
   * Omitted is treated the same as PENDING (uncertain = block): UNKNOWN_R2_BACKUP always forces
   * GLOBAL_SECURE_DELETE=INCOMPLETE. This is never a timestamp -- see R2_BACKUPS in
   * EXTERNAL_DELETION_DOMAINS for why a purge-by-date model does not apply to this domain.
   */
  r2BackupsStatus?: R2BackupDomainStatus;
  /**
   * GLOBAL_SECURE_DELETE_LEDGER_GATED: the post-backup erasure ledger's own integrity status
   * (scripts/privacy/verify-erasure-ledger.ts). An unavailable or invalid ledger means no one can
   * prove this erasure was durably recorded outside the database/backups for future restore
   * reconciliation -- that blocks the R2_BACKUPS domain exactly like an unverifiable R2 object
   * does (reusing the existing domain per this mission's own instruction, not inventing a new
   * one). Omitted is treated the same as UNAVAILABLE (uncertain = block).
   */
  erasureLedgerStatus?: ErasureLedgerDomainStatus;
}): GlobalSecureDeleteReport {
  const now = input.now ?? new Date();
  const neonWindowMs = input.neonHistoryWindowMs ?? NEON_MAX_HISTORY_WINDOW_MS;
  const pending: ExternalDeletionDomainCode[] = [];
  const rejected: GlobalSecureDeleteReport["rejectedAttestations"] = [];
  for (const d of EXTERNAL_DELETION_DOMAINS) {
    if (d.code === "R2_BACKUPS") continue; // structural status, handled below -- never a timestamp attestation
    const raw = input.attestations[d.code];
    if (raw === undefined || raw === "") { pending.push(d.code); continue; }
    const t = new Date(raw);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || Number.isNaN(t.getTime())) {
      rejected.push({ code: d.code, reason: "attestation must be an ISO-8601 timestamp" });
      pending.push(d.code);
    } else if (t.getTime() < input.executedAt.getTime()) {
      rejected.push({ code: d.code, reason: "attestation predates the database erasure" });
      pending.push(d.code);
    } else if (d.code === "NEON_HISTORY_WINDOW" && t.getTime() < input.executedAt.getTime() + neonWindowMs) {
      rejected.push({ code: d.code, reason: "attestation is earlier than erasure time plus the Neon history window" });
      pending.push(d.code);
    } else if (t.getTime() > now.getTime() + 60_000) {
      rejected.push({ code: d.code, reason: "attestation is in the future" });
      pending.push(d.code);
    }
  }
  const forcePending = (code: ExternalDeletionDomainCode, reason: string) => {
    if (!pending.includes(code)) pending.push(code);
    if (!rejected.some((r) => r.code === code && r.reason === reason)) rejected.push({ code, reason });
  };
  const blockingCopies = blockingNeonCopies(input.neonInventory, input.dataFirstImportedAt, input.executedAt);
  if (!input.neonInventory) {
    forcePending("NEON_BRANCHES", "no Neon branch/snapshot inventory supplied (--neon-inventory); cannot claim copies are gone");
  } else if (new Date(input.neonInventory.capturedAt).getTime() < input.executedAt.getTime()) {
    forcePending("NEON_BRANCHES", "branch/snapshot inventory was captured before the database erasure");
  } else if (blockingCopies.length > 0) {
    forcePending(
      "NEON_BRANCHES",
      "known copies still exist: " + blockingCopies.map((c) => c.kind + ":" + c.id).join(", ") + " (delete them, then re-capture the inventory)",
    );
  }
  // R2_BACKUPS: structural CLEAN/NOT_APPLICABLE/PENDING/FAIL verdict, not an attested date.
  // UNKNOWN_R2_BACKUP (status omitted) always blocks -- same "uncertain = block" doctrine as
  // every other domain here, just without a timestamp to compare against.
  if (input.r2BackupsStatus === undefined) {
    forcePending("R2_BACKUPS", "no R2 backup-domain verification supplied (--r2-backups-status); cannot claim R2 backups are clean");
  } else if (input.r2BackupsStatus === "PENDING") {
    forcePending("R2_BACKUPS", "R2 backup-domain verifier reported PENDING (uncertain = block)");
  } else if (input.r2BackupsStatus === "FAIL") {
    forcePending("R2_BACKUPS", "R2 backup-domain verifier reported FAIL");
  }
  // CLEAN / NOT_APPLICABLE: domain satisfied so far -- still subject to the ledger gate below.
  //
  // GLOBAL_SECURE_DELETE_LEDGER_GATED: the R2_BACKUPS domain additionally requires the post-backup
  // erasure ledger to be VALID. An erasure that passed the database transaction and has clean R2
  // backups is still not durably reconciliation-safe if nothing outside the database records that
  // it happened -- a future restore of an OLDER backup would have no way to know. This check is
  // independent of, and in addition to, the r2BackupsStatus check above.
  if (input.erasureLedgerStatus === undefined || input.erasureLedgerStatus === "UNAVAILABLE") {
    forcePending("R2_BACKUPS", "erasure ledger status not supplied or unavailable (--erasure-ledger-status); cannot prove this erasure was durably recorded for future restore reconciliation");
  } else if (input.erasureLedgerStatus === "INVALID") {
    forcePending("R2_BACKUPS", "erasure ledger failed integrity validation (ERASURE_LEDGER_FORGERY_DETECTED or chain corruption) -- uncertain = block");
  }
  // VALID: ledger gate satisfied.
  return {
    blockingCopies,
    databaseErasure: input.databaseVerification,
    globalSecureDelete: input.databaseVerification === "PASS" && pending.length === 0 && blockingCopies.length === 0 ? "COMPLETE" : "INCOMPLETE",
    pendingDomains: pending,
    rejectedAttestations: rejected,
  };
}

/** Parses the per-domain CLI options (opts keyed by option name, without the leading dashes). */
export function attestationsFromOptions(opts: Record<string, string>): Partial<Record<ExternalDeletionDomainCode, string>> {
  const out: Partial<Record<ExternalDeletionDomainCode, string>> = {};
  for (const d of EXTERNAL_DELETION_DOMAINS) {
    if (d.code === "R2_BACKUPS") continue; // status enum, not a timestamp -- see r2BackupsStatusFromOptions
    if (opts[d.option]) out[d.code] = opts[d.option];
  }
  return out;
}

/** `--r2-backups-status <CLEAN|NOT_APPLICABLE|PENDING|FAIL>`: the R2_BACKUPS structural verdict.
 * Omitted returns undefined, which evaluateGlobalSecureDelete treats as PENDING (uncertain = block).
 * A present-but-invalid value fails closed (throws) rather than being silently ignored. */
export function r2BackupsStatusFromOptions(opts: Record<string, string>): R2BackupDomainStatus | undefined {
  const raw = opts["r2-backups-status"];
  if (raw === undefined || raw === "") return undefined;
  if (!(R2_BACKUP_STATUSES as readonly string[]).includes(raw)) {
    throw new Error(`--r2-backups-status must be one of ${R2_BACKUP_STATUSES.join("|")}, got '${raw}'`);
  }
  return raw as R2BackupDomainStatus;
}

/** `--erasure-ledger-status <VALID|INVALID|UNAVAILABLE>`: the post-backup erasure ledger's own
 * integrity verdict (scripts/privacy/verify-erasure-ledger.ts). Same fail-closed shape as
 * r2BackupsStatusFromOptions: omitted returns undefined (treated as UNAVAILABLE); a
 * present-but-invalid value throws rather than being silently ignored. */
export function erasureLedgerStatusFromOptions(opts: Record<string, string>): ErasureLedgerDomainStatus | undefined {
  const raw = opts["erasure-ledger-status"];
  if (raw === undefined || raw === "") return undefined;
  if (!(ERASURE_LEDGER_STATUSES as readonly string[]).includes(raw)) {
    throw new Error(`--erasure-ledger-status must be one of ${ERASURE_LEDGER_STATUSES.join("|")}, got '${raw}'`);
  }
  return raw as ErasureLedgerDomainStatus;
}

/** `--neon-history-window-hours <n>`: the project's configured window; omitted means the 30 day fail-safe. */
export function neonWindowFromOptions(opts: Record<string, string>): number | undefined {
  const raw = opts["neon-history-window-hours"];
  if (raw === undefined || raw === "") return undefined;
  const h = Number(raw);
  if (!Number.isFinite(h) || h < 0 || h > 24 * 30) throw new Error("--neon-history-window-hours must be between 0 and 720");
  return h * 60 * 60 * 1000;
}

export interface NeonInventoryEntry {
  kind: "BRANCH" | "SNAPSHOT";
  id: string;
  name?: string;
  /** Default/primary branch: it is the live database that the erasure itself cleaned. */
  isDefault?: boolean;
  createdAt: string;
  /** Branch created "at a timestamp": the data it holds is as of this time, not createdAt. */
  parentTimestamp?: string;
}
export interface NeonInventory {
  capturedAt: string;
  entries: NeonInventoryEntry[];
}
export interface BlockingNeonCopy {
  kind: "BRANCH" | "SNAPSHOT";
  id: string;
  name?: string;
  dataAsOf: string;
}

/**
 * Every non-default branch/snapshot whose data-as-of time falls inside [dataFirstImportedAt, executedAt)
 * may hold the target's Intuit data and is its own deletion domain. Each one blocks GLOBAL_SECURE_DELETE.
 */
export function blockingNeonCopies(inv: NeonInventory | undefined, firstImportedAt: Date | undefined, executedAt: Date): BlockingNeonCopy[] {
  if (!inv) return [];
  const out: BlockingNeonCopy[] = [];
  for (const e of inv.entries) {
    if (e.isDefault) continue;
    const asOf = new Date(e.parentTimestamp ?? e.createdAt);
    if (!Number.isFinite(asOf.getTime())) { out.push({ kind: e.kind, id: e.id, name: e.name, dataAsOf: "UNPARSEABLE" }); continue; }
    if (asOf.getTime() >= executedAt.getTime()) continue;
    if (firstImportedAt && asOf.getTime() < firstImportedAt.getTime()) continue;
    out.push({ kind: e.kind, id: e.id, name: e.name, dataAsOf: asOf.toISOString() });
  }
  return out;
}

/** `--neon-inventory <file>` JSON: { capturedAt, entries: [...] } (shape of NeonInventory). */
export function parseNeonInventory(raw: string): NeonInventory {
  const j = JSON.parse(raw) as NeonInventory;
  if (!j || typeof j.capturedAt !== "string" || !Array.isArray(j.entries)) throw new Error("--neon-inventory: expected { capturedAt, entries[] }");
  if (!Number.isFinite(new Date(j.capturedAt).getTime())) throw new Error("--neon-inventory: capturedAt is not a timestamp");
  for (const e of j.entries) if (!e || (e.kind !== "BRANCH" && e.kind !== "SNAPSHOT") || typeof e.id !== "string" || typeof e.createdAt !== "string") throw new Error("--neon-inventory: malformed entry");
  return j;
}
