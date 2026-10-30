/**
 * Pure classification logic for the R2_BACKUPS deletion domain (see deletion-domains.ts).
 *
 * Unlike every other external deletion domain, R2_BACKUPS is not a point-in-time purge
 * attestation: Option B's QBO backup gate (#642, scripts/backup-qbo-gate.sh) makes every
 * successfully created R2 backup structurally incapable of containing QuickBooks/Intuit User
 * Data, so there is nothing to purge-by-date. Instead this module answers a narrower question --
 * "is every object actually present under the backups/ prefix exactly what it claims to be?" --
 * without ever needing the AGE private identity, decrypting anything, or touching the production
 * database. It operates only on object listing/metadata, manifest JSON, and checksum sidecars.
 *
 * "Uncertain = block" applies here exactly as everywhere else: anything this module cannot fully
 * verify classifies as PENDING or FAIL, never CLEAN. A bare schema/structural check alone cannot
 * prove a manifest's qbo_backup_gate_result claim is genuine against an attacker who holds ONLY
 * the R2 object-write credential (they could author an entirely fabricated object+manifest pair
 * with a copy-pasted "QBO_BACKUP_GATE=ALLOW" string) -- so every manifest's HMAC-SHA256
 * manifest_signature is independently recomputed here using a signing key that is never exposed
 * to that credential (see backup-database-r2.sh's MANIFEST_SIGNING_KEY). A manifest whose
 * signature does not verify is treated identically to one that was never signed: FAIL, not CLEAN.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const R2_BACKUP_PREFIX = "backups/";

const SUFFIX_CHECKSUM = ".sql.gz.age.sha256";
const SUFFIX_MANIFEST = ".manifest.json";
const SUFFIX_BACKUP = ".sql.gz.age";

export interface R2ObjectRef {
  /** Full key as listed, e.g. "backups/opsiq_backup_2026-10-30_12-00-00_abcdef01.sql.gz.age". */
  key: string;
  sizeBytes: number;
}

export interface R2BackupManifest {
  backup_format_version?: unknown;
  timestamp_utc?: unknown;
  source_commit_sha?: unknown;
  postgres_client_version?: unknown;
  encrypted_object_name?: unknown;
  encrypted_object_size_bytes?: unknown;
  sha256?: unknown;
  qbo_backup_gate_result?: unknown;
  qbo_backup_gate_manifest_schema_version?: unknown;
  manifest_signature_algorithm?: unknown;
  manifest_signature?: unknown;
}

export type R2BackupObjectKind = "backup" | "checksum" | "manifest" | "unexpected";

export interface ClassifiedR2Key {
  key: string;
  baseName: string;
  kind: R2BackupObjectKind;
}

/** Classifies one listed key by its suffix. Anything outside backups/ or with an unrecognized
 * suffix (or a nested path) is "unexpected" -- the domain must never silently ignore it. */
export function classifyR2Key(key: string): ClassifiedR2Key {
  if (!key.startsWith(R2_BACKUP_PREFIX)) return { key, baseName: key, kind: "unexpected" };
  const name = key.slice(R2_BACKUP_PREFIX.length);
  if (name.length === 0 || name.includes("/")) return { key, baseName: key, kind: "unexpected" };
  // Check the longer, more specific suffix first: ".sql.gz.age" is itself a suffix of
  // ".sql.gz.age.sha256", so checking backup before checksum would misclassify every checksum.
  if (name.endsWith(SUFFIX_CHECKSUM)) return { key, baseName: name.slice(0, -SUFFIX_CHECKSUM.length), kind: "checksum" };
  if (name.endsWith(SUFFIX_MANIFEST)) return { key, baseName: name.slice(0, -SUFFIX_MANIFEST.length), kind: "manifest" };
  if (name.endsWith(SUFFIX_BACKUP)) return { key, baseName: name.slice(0, -SUFFIX_BACKUP.length), kind: "backup" };
  return { key, baseName: name, kind: "unexpected" };
}

/** The exact signing-input field order used by backup-database-r2.sh. Must stay byte-for-byte
 * identical to the bash script's `SIGNING_INPUT` construction or every real signature will fail
 * to verify. */
export function manifestSigningInput(m: R2BackupManifest): string {
  return [m.encrypted_object_name, m.timestamp_utc, m.encrypted_object_size_bytes, m.sha256, m.qbo_backup_gate_result, m.qbo_backup_gate_manifest_schema_version]
    .map((v) => String(v ?? ""))
    .join("|");
}

/** Constant-time comparison (never `===`/string equality on digests -- same convention already
 * used by this repo's webhook/HMAC verification code). Returns false (never throws) on any
 * malformed-hex input, since a malformed signature is simply not a valid one. */
export function verifyManifestSignature(m: R2BackupManifest, signingKey: string): boolean {
  const claimed = typeof m.manifest_signature === "string" ? m.manifest_signature : "";
  if (!/^[0-9a-f]{64}$/.test(claimed)) return false;
  const expected = createHmac("sha256", signingKey).update(manifestSigningInput(m)).digest("hex");
  const a = Buffer.from(claimed, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True only for the gate's own canonical, unmodified ALLOW line (see scripts/backup-qbo-gate.sh
 * line `echo "QBO_BACKUP_GATE=ALLOW (flag='...', qbo_* rows=0)"`). Anything else -- including a
 * BLOCK line, an empty value, or free text that merely mentions "ALLOW" -- fails this check. */
export function isCanonicalGateAllowLine(value: unknown): boolean {
  return typeof value === "string" && /^QBO_BACKUP_GATE=ALLOW \(flag='[^)]*', qbo_\* rows=0\)$/.test(value);
}

/** A manifest predating this mission's gate-binding/signature contract (Section 7) is missing one
 * or both of these fields. V1 has no real R2 objects yet, so it fails closed on any such object
 * rather than inventing a migration/grandfathering path for backups that do not exist
 * (LEGACY_UNATTESTED_R2_BACKUP_POLICY=BLOCK). */
export function isLegacyUnattestedManifest(m: R2BackupManifest): boolean {
  return typeof m.qbo_backup_gate_result !== "string" || typeof m.manifest_signature !== "string";
}

const NAME_TIMESTAMP = /^opsiq_backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})_/;
/** The TIMESTAMP component is captured near the very start of backup-database-r2.sh, before the
 * QBO gate even runs; the manifest's timestamp_utc is captured later, right before pg_dump
 * starts -- so they are never expected to be byte-identical, only consistent: the manifest time
 * must not be before the name's embedded time, and not implausibly far after it. */
export function parseBaseNameTimestamp(baseName: string): Date | null {
  const m = baseName.match(NAME_TIMESTAMP);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2].replace(/-/g, ":")}Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}
/** Generous bound: a slow pg_dump/gate probe should never plausibly take this long. Loose on
 * purpose -- this is a sanity bound against a wildly fabricated/inconsistent object, not a tight
 * timing assertion that would make a legitimately slow backup fail closed. */
export const MAX_GATE_TO_DUMP_START_DELAY_MS = 24 * 60 * 60 * 1000;

export type TripletVerdictCode = "CLEAN" | "INCOMPLETE" | "INVALID" | "LEGACY_UNATTESTED";

export interface TripletVerdict {
  baseName: string;
  code: TripletVerdictCode;
  reason: string;
}

export type R2BackupDomainStatus = "CLEAN" | "NOT_APPLICABLE" | "PENDING" | "FAIL";

export interface R2BackupDomainReport {
  status: R2BackupDomainStatus;
  triplets: TripletVerdict[];
  /** Keys that could not be grouped into a recognized backup/checksum/manifest triplet at all. */
  unexpectedKeys: string[];
}

/** Evaluates every object actually listed under backups/ against the full backup+checksum+
 * manifest(+signature) contract. Never trusts a manifest's self-reported claims without
 * independently recomputing its signature and cross-checking its fields against the other two
 * objects in its own triplet. */
export function evaluateR2BackupDomain(input: {
  objects: readonly R2ObjectRef[];
  /** baseName -> parsed manifest JSON, or null if the manifest object's content did not parse as JSON. */
  manifests: Readonly<Record<string, R2BackupManifest | null>>;
  /** baseName -> the checksum object's content, trimmed. */
  checksumContents: Readonly<Record<string, string>>;
  manifestSigningKey: string;
}): R2BackupDomainReport {
  const byBase = new Map<string, { backup?: R2ObjectRef; checksum?: R2ObjectRef; manifest?: R2ObjectRef }>();
  const unexpectedKeys: string[] = [];
  for (const obj of input.objects) {
    const c = classifyR2Key(obj.key);
    if (c.kind === "unexpected") {
      unexpectedKeys.push(obj.key);
      continue;
    }
    const entry = byBase.get(c.baseName) ?? {};
    entry[c.kind] = obj;
    byBase.set(c.baseName, entry);
  }

  const triplets: TripletVerdict[] = [];
  for (const [baseName, entry] of byBase) {
    if (!entry.manifest) {
      triplets.push({ baseName, code: "INCOMPLETE", reason: "manifest object missing" });
      continue;
    }
    if (!entry.checksum) {
      triplets.push({ baseName, code: "INCOMPLETE", reason: "checksum object missing" });
      continue;
    }
    if (!entry.backup) {
      triplets.push({ baseName, code: "INCOMPLETE", reason: "encrypted backup object missing" });
      continue;
    }
    const manifest = input.manifests[baseName];
    if (manifest === undefined) {
      triplets.push({ baseName, code: "INCOMPLETE", reason: "manifest object listed but its content was not supplied for verification" });
      continue;
    }
    if (manifest === null) {
      triplets.push({ baseName, code: "INVALID", reason: "manifest content is not valid JSON" });
      continue;
    }
    if (isLegacyUnattestedManifest(manifest)) {
      triplets.push({ baseName, code: "LEGACY_UNATTESTED", reason: "manifest predates the gate-binding/signature contract (missing qbo_backup_gate_result or manifest_signature)" });
      continue;
    }
    if (!isCanonicalGateAllowLine(manifest.qbo_backup_gate_result)) {
      triplets.push({ baseName, code: "INVALID", reason: "qbo_backup_gate_result is not the gate's canonical ALLOW line" });
      continue;
    }
    if (!verifyManifestSignature(manifest, input.manifestSigningKey)) {
      triplets.push({ baseName, code: "INVALID", reason: "manifest_signature does not verify against the signing key -- tampered or forged" });
      continue;
    }
    const checksumContent = input.checksumContents[baseName];
    if (checksumContent === undefined || checksumContent !== manifest.sha256) {
      triplets.push({ baseName, code: "INVALID", reason: "checksum object content does not match the manifest's sha256 field" });
      continue;
    }
    if (manifest.encrypted_object_size_bytes !== entry.backup.sizeBytes) {
      triplets.push({ baseName, code: "INVALID", reason: "encrypted backup object's actual size does not match the manifest's claimed size" });
      continue;
    }
    if (manifest.encrypted_object_name !== `${baseName}${SUFFIX_BACKUP}`) {
      triplets.push({ baseName, code: "INVALID", reason: "manifest's encrypted_object_name does not match this triplet's own object name" });
      continue;
    }
    const nameTs = parseBaseNameTimestamp(baseName);
    const manifestTs = typeof manifest.timestamp_utc === "string" ? new Date(manifest.timestamp_utc) : null;
    if (!nameTs || !manifestTs || !Number.isFinite(manifestTs.getTime())) {
      triplets.push({ baseName, code: "INVALID", reason: "could not parse the object name's or manifest's timestamp for consistency checking" });
      continue;
    }
    const deltaMs = manifestTs.getTime() - nameTs.getTime();
    if (deltaMs < 0 || deltaMs > MAX_GATE_TO_DUMP_START_DELAY_MS) {
      triplets.push({ baseName, code: "INVALID", reason: `manifest timestamp_utc is inconsistent with the object name's embedded timestamp (delta ${deltaMs}ms)` });
      continue;
    }
    triplets.push({ baseName, code: "CLEAN", reason: "backup, checksum and manifest are present, mutually consistent, and the manifest's gate-result claim is signed and verified" });
  }

  let status: R2BackupDomainStatus;
  if (unexpectedKeys.length > 0 || triplets.some((t) => t.code === "INVALID" || t.code === "LEGACY_UNATTESTED")) {
    status = "FAIL";
  } else if (triplets.some((t) => t.code === "INCOMPLETE")) {
    status = "PENDING";
  } else if (triplets.length === 0) {
    status = "NOT_APPLICABLE";
  } else {
    status = "CLEAN";
  }
  return { status, triplets, unexpectedKeys };
}
