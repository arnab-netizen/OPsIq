import { describe, it, expect } from "vitest";
import {
  EXTERNAL_DELETION_DOMAINS,
  attestationsFromOptions,
  evaluateGlobalSecureDelete as evaluateRaw,
  blockingNeonCopies,
  parseNeonInventory,
  type NeonInventory,
  neonWindowFromOptions,
  r2BackupsStatusFromOptions,
  erasureLedgerStatusFromOptions,
} from "@/services/privacy-erasure/deletion-domains";

const executedAt = new Date("2026-11-01T10:00:00Z");
const now = new Date("2026-12-10T00:00:00Z");
// Default: a clean post-erasure inventory (only the default branch). Tests of the inventory rule override it.
const cleanInventory: NeonInventory = {
  capturedAt: "2026-11-01T12:00:00Z",
  entries: [{ kind: "BRANCH", id: "br-main", name: "production", isDefault: true, createdAt: "2026-01-01T00:00:00Z" }],
};
// R2_BACKUPS is a structural status, not a timestamp attestation -- supplied separately from `all`.
// Pre-existing tests (predating R2_BACKUPS / the erasure-ledger gate) default both to
// satisfied so they keep testing what they originally tested; the dedicated describe blocks
// below override them per-case.
const evaluateGlobalSecureDelete = (i: Parameters<typeof evaluateRaw>[0]) => evaluateRaw({ neonInventory: cleanInventory, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID", ...i });
const all = {
  GITHUB_BACKUP_ARTIFACTS: "2026-11-01T11:00:00Z",
  NEON_HISTORY_WINDOW: "2026-12-02T00:00:00Z",
  NEON_BRANCHES: "2026-11-01T12:00:00Z",
  OPERATOR_EXPORTS: "2026-11-02T09:00:00Z",
} as const;

describe("global secure-delete boundary", () => {
  it("database erasure alone is INCOMPLETE, never total success", () => {
    // evaluateRaw directly (not the CLEAN-defaulted wrapper): with truly nothing supplied for any
    // domain -- including R2_BACKUPS -- every domain, in registry order, must be pending.
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, attestations: {}, neonInventory: cleanInventory, now });
    expect(r.databaseErasure).toBe("PASS");
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(EXTERNAL_DELETION_DOMAINS.map((d) => d.code));
  });

  it("is COMPLETE only when the database passed and every external domain is attested", () => {
    const r = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: all, now });
    expect(r.globalSecureDelete).toBe("COMPLETE");
    expect(r.pendingDomains).toEqual([]);
  });

  it("one missing domain keeps it INCOMPLETE and names the domain", () => {
    const rest: Record<string, string> = { ...all };
    delete rest.NEON_BRANCHES;
    const r = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: rest, now });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["NEON_BRANCHES"]);
  });

  it("a failed database verification can never be COMPLETE even with every attestation", () => {
    const r = evaluateGlobalSecureDelete({ databaseVerification: "FAIL", executedAt, attestations: all, now });
    expect(r.databaseErasure).toBe("FAIL");
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
  });

  it("rejects an attestation that predates the erasure, is not ISO, or is in the future", () => {
    const r = evaluateGlobalSecureDelete({
      databaseVerification: "PASS",
      executedAt,
      now,
      attestations: {
        ...all,
        GITHUB_BACKUP_ARTIFACTS: "2026-10-31T23:59:59Z",
        NEON_BRANCHES: "yesterday",
        OPERATOR_EXPORTS: "2027-01-01T00:00:00Z",
      },
    });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.rejectedAttestations.map((x) => x.code).sort()).toEqual(
      ["GITHUB_BACKUP_ARTIFACTS", "NEON_BRANCHES", "OPERATOR_EXPORTS"],
    );
    expect(r.pendingDomains.sort()).toEqual(["GITHUB_BACKUP_ARTIFACTS", "NEON_BRANCHES", "OPERATOR_EXPORTS"]);
  });

  it("the Neon history attestation is rejected until erasure time plus the window has elapsed", () => {
    const early = { ...all, NEON_HISTORY_WINDOW: "2026-11-01T15:00:00Z" };
    // configured 6h window (Free plan): 10:00 + 6h = 16:00, so 15:00 is too early
    const r1 = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: early, neonHistoryWindowMs: 6 * 3600_000, now });
    expect(r1.pendingDomains).toEqual(["NEON_HISTORY_WINDOW"]);
    const ok = { ...all, NEON_HISTORY_WINDOW: "2026-11-01T16:00:00Z" };
    const r2 = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: ok, neonHistoryWindowMs: 6 * 3600_000, now });
    expect(r2.globalSecureDelete).toBe("COMPLETE");
    // unknown window defaults to the 30 day fail-safe: 2026-11-08 is not enough
    const r3 = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: { ...all, NEON_HISTORY_WINDOW: "2026-11-08T10:00:00Z" }, now: new Date("2026-12-31T00:00:00Z") });
    expect(r3.pendingDomains).toEqual(["NEON_HISTORY_WINDOW"]);
  });

  it("parses and bounds the configured window option", () => {
    expect(neonWindowFromOptions({})).toBeUndefined();
    expect(neonWindowFromOptions({ "neon-history-window-hours": "6" })).toBe(6 * 3600_000);
    expect(() => neonWindowFromOptions({ "neon-history-window-hours": "-1" })).toThrow();
    expect(() => neonWindowFromOptions({ "neon-history-window-hours": "9999" })).toThrow();
  });

  it("maps each timestamp-attestation CLI option to exactly one domain (R2_BACKUPS excluded: it's a status enum, not a timestamp)", () => {
    const opts = Object.fromEntries(EXTERNAL_DELETION_DOMAINS.map((d) => [d.option, "2026-11-02T00:00:00Z"]));
    expect(Object.keys(attestationsFromOptions(opts)).sort()).toEqual(
      EXTERNAL_DELETION_DOMAINS.filter((d) => d.code !== "R2_BACKUPS").map((d) => d.code).sort(),
    );
    expect(attestationsFromOptions({})).toEqual({});
  });

  it("r2BackupsStatusFromOptions parses CLEAN/NOT_APPLICABLE/PENDING/FAIL, fails closed on garbage, and is undefined when omitted", () => {
    expect(r2BackupsStatusFromOptions({})).toBeUndefined();
    for (const v of ["CLEAN", "NOT_APPLICABLE", "PENDING", "FAIL"]) {
      expect(r2BackupsStatusFromOptions({ "r2-backups-status": v })).toBe(v);
    }
    expect(() => r2BackupsStatusFromOptions({ "r2-backups-status": "clean" })).toThrow(); // case-sensitive, no silent coercion
    expect(() => r2BackupsStatusFromOptions({ "r2-backups-status": "YES" })).toThrow();
  });

  it("erasureLedgerStatusFromOptions parses VALID/INVALID/UNAVAILABLE, fails closed on garbage, and is undefined when omitted", () => {
    expect(erasureLedgerStatusFromOptions({})).toBeUndefined();
    for (const v of ["VALID", "INVALID", "UNAVAILABLE"]) {
      expect(erasureLedgerStatusFromOptions({ "erasure-ledger-status": v })).toBe(v);
    }
    expect(() => erasureLedgerStatusFromOptions({ "erasure-ledger-status": "valid" })).toThrow();
    expect(() => erasureLedgerStatusFromOptions({ "erasure-ledger-status": "COMPLETE" })).toThrow();
  });
});

describe("GLOBAL_SECURE_DELETE_LEDGER_GATED: the erasure ledger's own integrity gates the R2_BACKUPS domain", () => {
  const otherwiseClean = { databaseVerification: "PASS" as const, executedAt, now, attestations: all, neonInventory: cleanInventory, r2BackupsStatus: "CLEAN" as const };

  it("UNAVAILABLE (status omitted) always forces GLOBAL_SECURE_DELETE=INCOMPLETE, even with a CLEAN r2BackupsStatus and every other domain satisfied", () => {
    const r = evaluateRaw({ ...otherwiseClean }); // erasureLedgerStatus omitted entirely
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["R2_BACKUPS"]);
  });

  it.each(["INVALID", "UNAVAILABLE"] as const)("%s blocks GLOBAL_SECURE_DELETE even with a CLEAN r2BackupsStatus and every other domain satisfied", (status) => {
    const r = evaluateRaw({ ...otherwiseClean, erasureLedgerStatus: status });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["R2_BACKUPS"]);
    expect(r.rejectedAttestations.some((x) => x.code === "R2_BACKUPS")).toBe(true);
  });

  it("VALID, combined with a CLEAN r2BackupsStatus, satisfies R2_BACKUPS entirely", () => {
    const r = evaluateRaw({ ...otherwiseClean, erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("COMPLETE");
    expect(r.pendingDomains).toEqual([]);
  });

  it("a CLEAN r2BackupsStatus does NOT substitute for an invalid ledger, and a VALID ledger does NOT substitute for a non-CLEAN r2BackupsStatus -- both gates are independently required", () => {
    const rLedgerBad = evaluateRaw({ ...otherwiseClean, erasureLedgerStatus: "INVALID" });
    expect(rLedgerBad.globalSecureDelete).toBe("INCOMPLETE");

    const rR2Bad = evaluateRaw({ ...otherwiseClean, r2BackupsStatus: "FAIL", erasureLedgerStatus: "VALID" });
    expect(rR2Bad.globalSecureDelete).toBe("INCOMPLETE");
  });
});

describe("Neon branch/snapshot inventory blocks GLOBAL_SECURE_DELETE", () => {
  const firstImport = new Date("2026-10-01T00:00:00Z");
  it("is never COMPLETE without an inventory, even with every attestation", () => {
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, attestations: all, now, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["NEON_BRANCHES"]);
  });
  it("is never COMPLETE with an inventory captured before the erasure", () => {
    const stale: NeonInventory = { ...cleanInventory, capturedAt: "2026-11-01T09:00:00Z" };
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, attestations: all, now, neonInventory: stale, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
  });
  it("a surviving restore branch from the Intuit-data window blocks PASS despite a NEON_BRANCHES attestation", () => {
    const inv: NeonInventory = {
      capturedAt: "2026-11-01T12:00:00Z",
      entries: [
        ...cleanInventory.entries,
        { kind: "BRANCH", id: "br-restore", name: "restore-proof", createdAt: "2026-10-20T00:00:00Z" },
        { kind: "SNAPSHOT", id: "snap-1", createdAt: "2026-10-25T00:00:00Z" },
      ],
    };
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, attestations: all, now, neonInventory: inv, dataFirstImportedAt: firstImport, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.blockingCopies.map((c) => c.id).sort()).toEqual(["br-restore", "snap-1"]);
    expect(r.pendingDomains).toContain("NEON_BRANCHES");
    expect(r.rejectedAttestations.some((x) => x.code === "NEON_BRANCHES" && x.reason.includes("br-restore"))).toBe(true);
  });
  it("a branch created at a timestamp inside the window blocks even if created after the erasure", () => {
    const inv: NeonInventory = {
      capturedAt: "2026-11-02T12:00:00Z",
      entries: [{ kind: "BRANCH", id: "br-pit", createdAt: "2026-11-02T00:00:00Z", parentTimestamp: "2026-10-15T00:00:00Z" }],
    };
    expect(blockingNeonCopies(inv, firstImport, executedAt).map((c) => c.id)).toEqual(["br-pit"]);
  });
  it("copies from before the first import or after the erasure do not block; default branch never blocks", () => {
    const inv: NeonInventory = {
      capturedAt: "2026-11-02T12:00:00Z",
      entries: [
        { kind: "BRANCH", id: "old", createdAt: "2026-09-01T00:00:00Z" },
        { kind: "BRANCH", id: "new", createdAt: "2026-11-01T11:00:00Z" },
        { kind: "BRANCH", id: "main", isDefault: true, createdAt: "2026-10-10T00:00:00Z" },
      ],
    };
    expect(blockingNeonCopies(inv, firstImport, executedAt)).toEqual([]);
  });
  it("an unparseable timestamp fails closed", () => {
    const inv: NeonInventory = { capturedAt: "2026-11-02T12:00:00Z", entries: [{ kind: "BRANCH", id: "x", createdAt: "garbage" }] };
    expect(blockingNeonCopies(inv, undefined, executedAt).map((c) => c.id)).toEqual(["x"]);
  });
  it("passes once the copies are deleted and the inventory re-captured", () => {
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, attestations: all, now, neonInventory: cleanInventory, dataFirstImportedAt: firstImport, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("COMPLETE");
    expect(r.blockingCopies).toEqual([]);
  });
  it("parseNeonInventory rejects malformed input", () => {
    expect(() => parseNeonInventory("{}")).toThrow();
    expect(() => parseNeonInventory(JSON.stringify({ capturedAt: "nope", entries: [] }))).toThrow();
    expect(() => parseNeonInventory(JSON.stringify({ capturedAt: "2026-11-01T00:00:00Z", entries: [{ kind: "X", id: "a", createdAt: "2026-01-01" }] }))).toThrow();
    expect(parseNeonInventory(JSON.stringify(cleanInventory)).entries).toHaveLength(1);
  });
});

describe("R2_BACKUPS domain: structural CLEAN/NOT_APPLICABLE/PENDING/FAIL, never a timestamp", () => {
  const otherwiseClean = { databaseVerification: "PASS" as const, executedAt, now, attestations: all, neonInventory: cleanInventory, erasureLedgerStatus: "VALID" as const };

  it("UNKNOWN_R2_BACKUP (status omitted) always forces GLOBAL_SECURE_DELETE=INCOMPLETE, even with every other domain satisfied", () => {
    const r = evaluateRaw({ ...otherwiseClean }); // r2BackupsStatus omitted entirely
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["R2_BACKUPS"]);
  });

  it.each(["PENDING", "FAIL"] as const)("%s blocks GLOBAL_SECURE_DELETE even with every other domain satisfied", (status) => {
    const r = evaluateRaw({ ...otherwiseClean, r2BackupsStatus: status });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["R2_BACKUPS"]);
    expect(r.rejectedAttestations.some((x) => x.code === "R2_BACKUPS")).toBe(true);
  });

  it.each(["CLEAN", "NOT_APPLICABLE"] as const)("%s satisfies the domain and does not block GLOBAL_SECURE_DELETE", (status) => {
    const r = evaluateRaw({ ...otherwiseClean, r2BackupsStatus: status });
    expect(r.globalSecureDelete).toBe("COMPLETE");
    expect(r.pendingDomains).toEqual([]);
  });

  it("R2_BACKUPS is independent of GITHUB_BACKUP_ARTIFACTS: neither renames nor substitutes for the other", () => {
    const withoutGithubAttestation = { ...all } as Record<string, string>;
    delete withoutGithubAttestation.GITHUB_BACKUP_ARTIFACTS;
    const r = evaluateRaw({ databaseVerification: "PASS", executedAt, now, attestations: withoutGithubAttestation, neonInventory: cleanInventory, r2BackupsStatus: "CLEAN", erasureLedgerStatus: "VALID" });
    expect(r.globalSecureDelete).toBe("INCOMPLETE");
    expect(r.pendingDomains).toEqual(["GITHUB_BACKUP_ARTIFACTS"]); // R2_BACKUPS=CLEAN does not cover for a missing GITHUB_BACKUP_ARTIFACTS attestation
    expect(EXTERNAL_DELETION_DOMAINS.some((d) => d.code === "GITHUB_BACKUP_ARTIFACTS")).toBe(true); // still present, not renamed
  });

  it("R2_BACKUPS appears in the canonical registry exactly once, distinct from GITHUB_BACKUP_ARTIFACTS", () => {
    const r2Entries = EXTERNAL_DELETION_DOMAINS.filter((d) => d.code === "R2_BACKUPS");
    expect(r2Entries).toHaveLength(1);
    expect(EXTERNAL_DELETION_DOMAINS.filter((d) => d.code === "GITHUB_BACKUP_ARTIFACTS")).toHaveLength(1);
  });
});
