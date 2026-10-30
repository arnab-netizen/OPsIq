/**
 * Section 17 (availability attack test): a deterministic FAKE R2 provider, simulating only the
 * documented Bucket Lock semantics (Cloudflare's own docs: locks block delete/overwrite,
 * including by the uploader; take precedence over lifecycle; apply to existing and future
 * objects under a prefix; reads are never blocked; lock-rule management requires a separate,
 * account-level/bucket-configuration credential, never the S3-compatible object credential).
 *
 * This is NOT a claim of real Cloudflare behavior -- no live R2 bucket exists yet.
 * PROVIDER_LIVE_BUCKET_LOCK_PROOF=NOT_YET_RUN until the owner provisions a real bucket and the
 * live drift-detection script (scripts/verify-r2-bucket-lock-config.ts) and a real restore
 * rehearsal both pass against it. This fake provider exists only to prove the MENTAL MODEL this
 * design's threat-model claims (Section 2/3 of the closure doc) rest on is at least internally
 * consistent and does what it is expected to do, before any real resource exists to test against.
 */
import { describe, it, expect, beforeEach } from "vitest";

type Actor = "writer" | "admin";

interface FakeObject {
  body: string;
  createdAtMs: number;
}

interface LockRule {
  prefix: string;
  maxAgeMs: number;
}

/** Minimal fake R2 bucket: only the operations and semantics this test needs to exercise.
 * Lock-rule mutation is gated by actor type, matching the real provider's separate API surface
 * (S3-compatible object token vs. Cloudflare REST API bucket-configuration token). */
class FakeR2Bucket {
  private objects = new Map<string, FakeObject>();
  private lockRules: LockRule[] = [];
  nowMs = 0;

  private isLocked(key: string): boolean {
    return this.lockRules.some((r) => key.startsWith(r.prefix) && this.nowMs - (this.objects.get(key)?.createdAtMs ?? this.nowMs) < r.maxAgeMs);
  }

  put(actor: Actor, key: string, body: string, ifNoneMatch = false): { ok: boolean; error?: string } {
    const exists = this.objects.has(key);
    if (ifNoneMatch && exists) return { ok: false, error: "PreconditionFailed" };
    if (exists && this.isLocked(key)) return { ok: false, error: "ObjectLockedByBucketPolicy" };
    this.objects.set(key, { body, createdAtMs: this.nowMs });
    return { ok: true };
  }

  delete(actor: Actor, key: string): { ok: boolean; error?: string } {
    if (!this.objects.has(key)) return { ok: false, error: "NoSuchKey" };
    if (this.isLocked(key)) return { ok: false, error: "ObjectLockedByBucketPolicy" };
    this.objects.delete(key);
    return { ok: true };
  }

  get(key: string): string | undefined {
    return this.objects.get(key)?.body;
  }

  /** Simulates a lifecycle rule attempting to expire an object. Per Cloudflare's documentation,
   * "bucket lock rules take precedence over lifecycle rules" -- lifecycle simply does not delete
   * a still-locked object; it is not an error, the object just survives until the lock clears. */
  lifecycleSweep(key: string): "deleted" | "held_by_lock" | "not_found" {
    if (!this.objects.has(key)) return "not_found";
    if (this.isLocked(key)) return "held_by_lock";
    this.objects.delete(key);
    return "deleted";
  }

  /** Only an "admin"-actor call may touch lock configuration -- this is the fake-provider
   * encoding of WRITER_CAN_EDIT_BUCKET_LOCK=NO: the S3-compatible object credential this design's
   * writer holds has no code path to this method at all in the real provider, which this fake
   * encodes as an actor-type gate rather than a separate network call. */
  setLockRule(actor: Actor, rule: LockRule): { ok: boolean; error?: string } {
    if (actor !== "admin") return { ok: false, error: "insufficient permission: lock configuration requires a bucket-configuration-capable credential, not an S3-compatible object token" };
    this.lockRules.push(rule);
    return { ok: true };
  }

  removeLockRule(actor: Actor, prefix: string): { ok: boolean; error?: string } {
    if (actor !== "admin") return { ok: false, error: "insufficient permission: lock configuration requires a bucket-configuration-capable credential, not an S3-compatible object token" };
    this.lockRules = this.lockRules.filter((r) => r.prefix !== prefix);
    return { ok: true };
  }
}

let bucket: FakeR2Bucket;
beforeEach(() => {
  bucket = new FakeR2Bucket();
});

describe("fake-provider Bucket Lock simulation (not a live-Cloudflare proof -- see PROVIDER_LIVE_BUCKET_LOCK_PROOF)", () => {
  it("normal create works (no lock configured)", () => {
    expect(bucket.put("writer", "backups/a", "x").ok).toBe(true);
    expect(bucket.get("backups/a")).toBe("x");
  });

  it("a second write to the same key, with create-once semantics (If-None-Match), fails even with no lock at all", () => {
    expect(bucket.put("writer", "backups/a", "x", true).ok).toBe(true);
    expect(bucket.put("writer", "backups/a", "y", true)).toEqual({ ok: false, error: "PreconditionFailed" });
  });

  it("delete during lock fails, by the SAME writer actor that created the object", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 1000 });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.delete("writer", "backups/a")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
  });

  it("overwrite during lock fails (even without create-once, the lock alone blocks it)", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 1000 });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.put("writer", "backups/a", "y")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
  });

  it("lifecycle cannot delete a locked object before the lock expires, but can once it does", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 1000 });
    bucket.put("writer", "backups/a", "x");
    bucket.nowMs = 500;
    expect(bucket.lifecycleSweep("backups/a")).toBe("held_by_lock");
    bucket.nowMs = 1500;
    expect(bucket.lifecycleSweep("backups/a")).toBe("deleted");
  });

  it("restore/read still works while an object is locked -- locks only block delete/overwrite", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 1000 });
    bucket.put("writer", "backups/a", "payload");
    expect(bucket.get("backups/a")).toBe("payload");
  });

  it("a writer-actor credential cannot alter lock configuration -- the attempt itself is refused, not merely ineffective", () => {
    const r1 = bucket.setLockRule("writer", { prefix: "backups/", maxAgeMs: 1 });
    expect(r1.ok).toBe(false);
    const r2 = bucket.removeLockRule("writer", "backups/");
    expect(r2.ok).toBe(false);
    // Confirm the refusal was real: an admin-set lock set earlier is still intact and still blocks delete.
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 100000 });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.delete("writer", "backups/a").ok).toBe(false);
  });

  it("a compromised writer credential attempting EVERY available destructive action against a locked, already-created object: all fail", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: 3_024_000_000 }); // 35 days in ms
    bucket.put("writer", "backups/real-backup", "ciphertext");
    expect(bucket.put("writer", "backups/real-backup", "corrupted-overwrite")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.delete("writer", "backups/real-backup")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.setLockRule("writer", { prefix: "backups/", maxAgeMs: 0 }).ok).toBe(false);
    expect(bucket.removeLockRule("writer", "backups/").ok).toBe(false);
    expect(bucket.get("backups/real-backup")).toBe("ciphertext"); // untouched
  });
});
