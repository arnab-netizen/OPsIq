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
    what: "every scheduled-backup pg_dump artifact created before the erasure (see scripts/privacy/purge-backup-artifacts.ts)",
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
] as const;

/** Longest documented Neon history window (Scale plan, 30 days). */
export const NEON_MAX_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ExternalDeletionDomainCode = (typeof EXTERNAL_DELETION_DOMAINS)[number]["code"];

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
}): GlobalSecureDeleteReport {
  const now = input.now ?? new Date();
  const neonWindowMs = input.neonHistoryWindowMs ?? NEON_MAX_HISTORY_WINDOW_MS;
  const pending: ExternalDeletionDomainCode[] = [];
  const rejected: GlobalSecureDeleteReport["rejectedAttestations"] = [];
  for (const d of EXTERNAL_DELETION_DOMAINS) {
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
  return {
    databaseErasure: input.databaseVerification,
    globalSecureDelete: input.databaseVerification === "PASS" && pending.length === 0 ? "COMPLETE" : "INCOMPLETE",
    pendingDomains: pending,
    rejectedAttestations: rejected,
  };
}

/** Parses the per-domain CLI options (opts keyed by option name, without the leading dashes). */
export function attestationsFromOptions(opts: Record<string, string>): Partial<Record<ExternalDeletionDomainCode, string>> {
  const out: Partial<Record<ExternalDeletionDomainCode, string>> = {};
  for (const d of EXTERNAL_DELETION_DOMAINS) if (opts[d.option]) out[d.code] = opts[d.option];
  return out;
}

/** `--neon-history-window-hours <n>`: the project's configured window; omitted means the 30 day fail-safe. */
export function neonWindowFromOptions(opts: Record<string, string>): number | undefined {
  const raw = opts["neon-history-window-hours"];
  if (raw === undefined || raw === "") return undefined;
  const h = Number(raw);
  if (!Number.isFinite(h) || h < 0 || h > 24 * 30) throw new Error("--neon-history-window-hours must be between 0 and 720");
  return h * 60 * 60 * 1000;
}
