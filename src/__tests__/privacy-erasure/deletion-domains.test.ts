import { describe, it, expect } from "vitest";
import {
  EXTERNAL_DELETION_DOMAINS,
  attestationsFromOptions,
  evaluateGlobalSecureDelete,
  neonWindowFromOptions,
} from "@/services/privacy-erasure/deletion-domains";

const executedAt = new Date("2026-11-01T10:00:00Z");
const now = new Date("2026-12-10T00:00:00Z");
const all = {
  GITHUB_BACKUP_ARTIFACTS: "2026-11-01T11:00:00Z",
  NEON_HISTORY_WINDOW: "2026-12-02T00:00:00Z",
  NEON_BRANCHES: "2026-11-01T12:00:00Z",
  OPERATOR_EXPORTS: "2026-11-02T09:00:00Z",
} as const;

describe("global secure-delete boundary", () => {
  it("database erasure alone is INCOMPLETE, never total success", () => {
    const r = evaluateGlobalSecureDelete({ databaseVerification: "PASS", executedAt, attestations: {}, now });
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

  it("maps each CLI option to exactly one domain", () => {
    const opts = Object.fromEntries(EXTERNAL_DELETION_DOMAINS.map((d) => [d.option, "2026-11-02T00:00:00Z"]));
    expect(Object.keys(attestationsFromOptions(opts)).sort()).toEqual(
      EXTERNAL_DELETION_DOMAINS.map((d) => d.code).sort(),
    );
    expect(attestationsFromOptions({})).toEqual({});
  });
});
