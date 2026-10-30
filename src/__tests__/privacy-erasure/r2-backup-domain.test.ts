/**
 * Hostile tests for the R2_BACKUPS domain verifier's pure classification logic. Covers every
 * hostile case listed in the R2 backup-availability/erasure-closure mission's Section 9, plus the
 * manifest-signature and name/timestamp-consistency checks from Section 7. No real R2/network
 * access -- everything here is in-memory, pure-function input.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  classifyR2Key,
  evaluateR2BackupDomain,
  isCanonicalGateAllowLine,
  isLegacyUnattestedManifest,
  manifestSigningInput,
  parseBaseNameTimestamp,
  verifyManifestSignature,
  type R2BackupManifest,
  type R2ObjectRef,
} from "@/services/privacy-erasure/r2-backup-domain";

const KEY = "test-manifest-signing-key-at-least-32-characters-long";
const BASE = "opsiq_backup_2026-10-30_12-00-00_abcdef01";

function signedManifest(overrides: Partial<R2BackupManifest> = {}): R2BackupManifest {
  const base: R2BackupManifest = {
    backup_format_version: "1",
    timestamp_utc: "2026-10-30T12:00:03Z",
    source_commit_sha: "deadbeef",
    postgres_client_version: "pg_dump (fake) 18.0",
    encrypted_object_name: `${BASE}.sql.gz.age`,
    encrypted_object_size_bytes: 1234,
    sha256: "a".repeat(64),
    qbo_backup_gate_result: "QBO_BACKUP_GATE=ALLOW (flag='unset', qbo_* rows=0)",
    qbo_backup_gate_manifest_schema_version: "1",
    manifest_signature_algorithm: "HMAC-SHA256",
    ...overrides,
  };
  // manifestSigningInput only reads its own six named fields, so base (still carrying
  // manifest_signature_algorithm) can be passed to it directly without stripping anything first.
  const signature = createHmac("sha256", KEY).update(manifestSigningInput(base)).digest("hex");
  // "manifest_signature" in overrides (not `??`): a caller passing { manifest_signature: undefined }
  // means "force it to undefined for this test case," which `??` would otherwise silently swallow
  // and fall through to the freshly computed real signature instead.
  const signatureOverride = "manifest_signature" in overrides ? overrides.manifest_signature : signature;
  return { ...base, manifest_signature: signatureOverride };
}

function validTriplet(): { objects: R2ObjectRef[]; manifests: Record<string, R2BackupManifest | null>; checksumContents: Record<string, string> } {
  const manifest = signedManifest();
  return {
    objects: [
      { key: `backups/${BASE}.sql.gz.age`, sizeBytes: 1234 },
      { key: `backups/${BASE}.sql.gz.age.sha256`, sizeBytes: 64 },
      { key: `backups/${BASE}.manifest.json`, sizeBytes: 500 },
    ],
    manifests: { [BASE]: manifest },
    checksumContents: { [BASE]: "a".repeat(64) },
  };
}

describe("classifyR2Key: suffix classification, including the ambiguous .sql.gz.age / .sql.gz.age.sha256 overlap", () => {
  it("classifies each suffix correctly, checksum before backup to avoid the overlap trap", () => {
    expect(classifyR2Key(`backups/${BASE}.sql.gz.age`)).toMatchObject({ kind: "backup", baseName: BASE });
    expect(classifyR2Key(`backups/${BASE}.sql.gz.age.sha256`)).toMatchObject({ kind: "checksum", baseName: BASE });
    expect(classifyR2Key(`backups/${BASE}.manifest.json`)).toMatchObject({ kind: "manifest", baseName: BASE });
  });
  it("treats anything outside backups/, a nested path, or an unrecognized suffix as unexpected", () => {
    expect(classifyR2Key("other-prefix/foo.sql.gz.age").kind).toBe("unexpected");
    expect(classifyR2Key("backups/sub/foo.sql.gz.age").kind).toBe("unexpected");
    expect(classifyR2Key("backups/foo.txt").kind).toBe("unexpected");
    expect(classifyR2Key("backups/").kind).toBe("unexpected");
  });
});

describe("verifyManifestSignature: never a bare string comparison, never throws on malformed input", () => {
  it("verifies a correctly-signed manifest", () => {
    expect(verifyManifestSignature(signedManifest(), KEY)).toBe(true);
  });
  it("rejects the wrong key", () => {
    expect(verifyManifestSignature(signedManifest(), "a-totally-different-32-plus-char-key-value")).toBe(false);
  });
  it("rejects a tampered field even if manifest_signature itself is untouched", () => {
    const m = signedManifest();
    expect(verifyManifestSignature({ ...m, encrypted_object_size_bytes: 999999 }, KEY)).toBe(false);
  });
  it("rejects malformed-hex / wrong-length / missing signatures without throwing", () => {
    expect(verifyManifestSignature(signedManifest({ manifest_signature: "not-hex" }), KEY)).toBe(false);
    expect(verifyManifestSignature(signedManifest({ manifest_signature: "aa" }), KEY)).toBe(false);
    expect(verifyManifestSignature(signedManifest({ manifest_signature: undefined }), KEY)).toBe(false);
    expect(() => verifyManifestSignature(signedManifest({ manifest_signature: "aa".repeat(40) }), KEY)).not.toThrow();
  });
});

describe("isCanonicalGateAllowLine: only the gate's own exact ALLOW shape counts as proof", () => {
  it("accepts the real canonical line", () => {
    expect(isCanonicalGateAllowLine("QBO_BACKUP_GATE=ALLOW (flag='unset', qbo_* rows=0)")).toBe(true);
    expect(isCanonicalGateAllowLine("QBO_BACKUP_GATE=ALLOW (flag='false', qbo_* rows=0)")).toBe(true);
  });
  it("rejects a BLOCK line, free text merely mentioning ALLOW, and non-strings", () => {
    expect(isCanonicalGateAllowLine("QBO_BACKUP_GATE=BLOCK reason=7 rows in qbo_* tables")).toBe(false);
    expect(isCanonicalGateAllowLine("the gate said ALLOW, trust me")).toBe(false);
    expect(isCanonicalGateAllowLine("QBO_BACKUP_GATE=ALLOW")).toBe(false); // missing the rest of the canonical shape
    expect(isCanonicalGateAllowLine(undefined)).toBe(false);
    expect(isCanonicalGateAllowLine(42)).toBe(false);
  });
});

describe("isLegacyUnattestedManifest / parseBaseNameTimestamp", () => {
  it("flags a manifest missing either new contract field as legacy-unattested", () => {
    expect(isLegacyUnattestedManifest(signedManifest({ qbo_backup_gate_result: undefined }))).toBe(true);
    expect(isLegacyUnattestedManifest(signedManifest({ manifest_signature: undefined }))).toBe(true);
    expect(isLegacyUnattestedManifest(signedManifest())).toBe(false);
  });
  it("parses the object name's embedded timestamp correctly, or returns null for an unparseable name", () => {
    expect(parseBaseNameTimestamp(BASE)?.toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(parseBaseNameTimestamp("not-a-backup-name")).toBeNull();
  });
});

function signedManifestWithWrongKey(): R2BackupManifest {
  const base: Omit<R2BackupManifest, "manifest_signature" | "manifest_signature_algorithm"> = {
    backup_format_version: "1",
    timestamp_utc: "2026-10-30T12:00:03Z",
    encrypted_object_name: `${BASE}.sql.gz.age`,
    encrypted_object_size_bytes: 1234,
    sha256: "a".repeat(64),
    qbo_backup_gate_result: "QBO_BACKUP_GATE=ALLOW (flag='unset', qbo_* rows=0)",
    qbo_backup_gate_manifest_schema_version: "1",
  };
  // Signed with a key the attacker fabricated themselves -- not the real MANIFEST_SIGNING_KEY,
  // since by definition they never had R2 write access AND the signing key simultaneously under
  // the threat model this is designed for.
  const signature = createHmac("sha256", "attacker-made-up-key-not-the-real-one-32plus").update(manifestSigningInput(base)).digest("hex");
  return { ...base, manifest_signature_algorithm: "HMAC-SHA256", manifest_signature: signature };
}

// ---------------------------------------------------------------------------------------------
// Section 9's twelve hostile cases, in order.
// ---------------------------------------------------------------------------------------------
describe("evaluateR2BackupDomain: the twelve required hostile cases", () => {
  it("1. no R2 objects at all -> NOT_APPLICABLE, never CLEAN by vacuous truth", () => {
    const r = evaluateR2BackupDomain({ objects: [], manifests: {}, checksumContents: {}, manifestSigningKey: KEY });
    expect(r.status).toBe("NOT_APPLICABLE");
    expect(r.triplets).toEqual([]);
  });

  it("2. a valid backup triplet -> CLEAN", () => {
    const t = validTriplet();
    const r = evaluateR2BackupDomain({ ...t, manifestSigningKey: KEY });
    expect(r.status).toBe("CLEAN");
    expect(r.triplets).toEqual([{ baseName: BASE, code: "CLEAN", reason: expect.any(String) }]);
  });

  it("3. backup missing its manifest -> PENDING (never CLEAN)", () => {
    const t = validTriplet();
    const r = evaluateR2BackupDomain({
      objects: t.objects.filter((o) => !o.key.endsWith(".manifest.json")),
      manifests: {},
      checksumContents: t.checksumContents,
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("PENDING");
    expect(r.triplets[0]).toMatchObject({ code: "INCOMPLETE", reason: expect.stringContaining("manifest") });
  });

  it("4. manifest missing gate proof -> FAIL", () => {
    const t = validTriplet();
    const noProof = signedManifest({ qbo_backup_gate_result: "QBO_BACKUP_GATE=BLOCK reason=something" });
    const r = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: noProof }, manifestSigningKey: KEY });
    expect(r.status).toBe("FAIL");
    expect(r.triplets[0]).toMatchObject({ code: "INVALID", reason: expect.stringContaining("gate") });
  });

  it("5. malformed manifest (unparseable JSON, represented as null) -> FAIL", () => {
    const t = validTriplet();
    const r = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: null }, manifestSigningKey: KEY });
    expect(r.status).toBe("FAIL");
    expect(r.triplets[0]).toMatchObject({ code: "INVALID", reason: expect.stringContaining("JSON") });
  });

  it("6. orphan checksum (checksum object with no backup or manifest) -> PENDING", () => {
    const r = evaluateR2BackupDomain({
      objects: [{ key: `backups/${BASE}.sql.gz.age.sha256`, sizeBytes: 64 }],
      manifests: {},
      checksumContents: { [BASE]: "a".repeat(64) },
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("PENDING");
    expect(r.triplets[0].code).toBe("INCOMPLETE");
  });

  it("7. orphan manifest (manifest object with no backup or checksum) -> PENDING", () => {
    const r = evaluateR2BackupDomain({
      objects: [{ key: `backups/${BASE}.manifest.json`, sizeBytes: 500 }],
      manifests: { [BASE]: signedManifest() },
      checksumContents: {},
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("PENDING");
    expect(r.triplets[0]).toMatchObject({ code: "INCOMPLETE", reason: expect.stringContaining("checksum") });
  });

  it("8. an unexpected object under the backup prefix -> FAIL, even alongside an otherwise-valid triplet", () => {
    const t = validTriplet();
    const r = evaluateR2BackupDomain({
      objects: [...t.objects, { key: "backups/unexpected-file.txt", sizeBytes: 10 }],
      manifests: t.manifests,
      checksumContents: t.checksumContents,
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("FAIL");
    expect(r.unexpectedKeys).toEqual(["backups/unexpected-file.txt"]);
  });

  it("9. duplicate/inconsistent metadata (manifest claims a different object name or size) -> FAIL", () => {
    const t = validTriplet();
    const wrongName = signedManifest({ encrypted_object_name: "some-other-name.sql.gz.age" });
    const r1 = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: wrongName }, manifestSigningKey: KEY });
    expect(r1.status).toBe("FAIL");
    expect(r1.triplets[0].reason).toContain("encrypted_object_name");

    const wrongSize = signedManifest({ encrypted_object_size_bytes: 999 });
    const r2 = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: wrongSize }, manifestSigningKey: KEY });
    expect(r2.status).toBe("FAIL");
    expect(r2.triplets[0].reason).toContain("size");
  });

  it("10. an old-format object created before R2 erasure-domain integration -> FAIL (LEGACY_UNATTESTED_R2_BACKUP_POLICY=BLOCK)", () => {
    const t = validTriplet();
    const legacy: R2BackupManifest = {
      backup_format_version: "1",
      timestamp_utc: "2026-10-30T12:00:03Z",
      encrypted_object_name: `${BASE}.sql.gz.age`,
      encrypted_object_size_bytes: 1234,
      sha256: "a".repeat(64),
      // no qbo_backup_gate_result, no manifest_signature -- predates Section 7's contract
    };
    const r = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: legacy }, manifestSigningKey: KEY });
    expect(r.status).toBe("FAIL");
    expect(r.triplets[0].code).toBe("LEGACY_UNATTESTED");
  });

  it("11. object name/manifest timestamp inconsistency -> FAIL (both too-early and implausibly-late)", () => {
    const t = validTriplet();
    const tooEarly = signedManifest({ timestamp_utc: "2026-10-30T11:59:00Z" }); // before the name's own timestamp
    const r1 = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: tooEarly }, manifestSigningKey: KEY });
    expect(r1.status).toBe("FAIL");
    expect(r1.triplets[0].reason).toContain("timestamp");

    const wayLate = signedManifest({ timestamp_utc: "2026-12-01T00:00:00Z" }); // weeks later
    const r2 = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: wayLate }, manifestSigningKey: KEY });
    expect(r2.status).toBe("FAIL");
  });

  it("12. attacker-created fake manifest (plausible-looking JSON, wrong signing key) -> FAIL, never CLEAN", () => {
    const t = validTriplet();
    const forged = signedManifestWithWrongKey();
    const r = evaluateR2BackupDomain({ ...t, manifests: { [BASE]: forged }, manifestSigningKey: KEY });
    expect(r.status).toBe("FAIL");
    expect(r.triplets[0]).toMatchObject({ code: "INVALID", reason: expect.stringContaining("signature") });
  });
});

describe("evaluateR2BackupDomain: multi-triplet aggregation", () => {
  it("multiple valid triplets -> CLEAN", () => {
    const t1 = validTriplet();
    const base2 = "opsiq_backup_2026-10-31_00-00-00_11223344";
    const m2 = signedManifest({ encrypted_object_name: `${base2}.sql.gz.age`, timestamp_utc: "2026-10-31T00:00:05Z" });
    const r = evaluateR2BackupDomain({
      objects: [...t1.objects, { key: `backups/${base2}.sql.gz.age`, sizeBytes: 1234 }, { key: `backups/${base2}.sql.gz.age.sha256`, sizeBytes: 64 }, { key: `backups/${base2}.manifest.json`, sizeBytes: 500 }],
      manifests: { [BASE]: t1.manifests[BASE], [base2]: m2 },
      checksumContents: { ...t1.checksumContents, [base2]: "a".repeat(64) },
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("CLEAN");
    expect(r.triplets).toHaveLength(2);
    expect(r.triplets.every((x) => x.code === "CLEAN")).toBe(true);
  });

  it("one invalid object among an otherwise-valid triplet still fails the whole domain (uncertain = block)", () => {
    const t1 = validTriplet();
    const r = evaluateR2BackupDomain({
      ...t1,
      objects: [...t1.objects, { key: "backups/junk", sizeBytes: 1 }],
      manifestSigningKey: KEY,
    });
    expect(r.status).toBe("FAIL");
  });
});
