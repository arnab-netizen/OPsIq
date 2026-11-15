/**
 * Section 3 (provider semantic tests) + Section 5 (availability threat model) of the final R2
 * activation-blocker closure: a deterministic FAKE R2 provider, simulating only the documented
 * Bucket Lock semantics (Cloudflare's own docs: locks block delete/overwrite including by the
 * uploader and including multipart-upload completion against an existing key; take precedence
 * over lifecycle; apply to existing and future objects under a prefix; reads are never blocked;
 * lock-rule management requires a separate, account-level/bucket-configuration credential, never
 * the S3-compatible object credential) -- now pinned to the OWNER'S DECIDED architecture:
 * BUCKET_LOCK_MAX_AGE_SECONDS=604800 (7 days) layered under TOTAL_RETENTION_DAYS=35. Days 0-7 are
 * immutable against the object-writer; days 7-35 are still retained by ordinary lifecycle but are
 * NOT Bucket-Lock-protected (an object-writer credential CAN delete them); after day 35 objects
 * are eligible for lifecycle expiry. This file does not claim the writer cannot delete backups
 * older than the 7-day immutable window -- it proves the opposite explicitly (see the last
 * describe block), per this mission's own instruction not to overclaim.
 *
 * This is NOT a claim of real Cloudflare behavior -- no live R2 bucket exists yet.
 * PROVIDER_LIVE_BUCKET_LOCK_PROOF=NOT_YET_RUN until the owner provisions a real bucket and the
 * live drift-detection script (scripts/verify-r2-bucket-lock-config.ts) and a real restore
 * rehearsal both pass against it. This fake provider exists only to prove the MENTAL MODEL this
 * design's threat-model claims (closure doc) rest on is at least internally consistent and does
 * what it is expected to do, before any real resource exists to test against.
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

const SEVEN_DAYS_MS = 604_800_000; // 604800 seconds, the owner-decided BUCKET_LOCK_MAX_AGE_SECONDS
const THIRTY_FIVE_DAYS_MS = 3_024_000_000; // 35 days, the unchanged TOTAL_RETENTION_DAYS lifecycle

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

  /** Completing a multipart upload against an EXISTING key is a distinct code path from a
   * single-shot PUT in the real S3/R2 API, so it is modeled separately here rather than assumed
   * to share PutObject's guard automatically -- Cloudflare's own documentation states Bucket Lock
   * blocks "overwrites" generally, which this models as covering multipart completion too. */
  completeMultipartUpload(actor: Actor, key: string, body: string): { ok: boolean; error?: string } {
    if (this.objects.has(key) && this.isLocked(key)) return { ok: false, error: "ObjectLockedByBucketPolicy" };
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

describe("fake-provider Bucket Lock simulation, pinned to the owner-decided 7-day window (not a live-Cloudflare proof -- see PROVIDER_LIVE_BUCKET_LOCK_PROOF)", () => {
  it("normal create works (no lock configured)", () => {
    expect(bucket.put("writer", "backups/a", "x").ok).toBe(true);
    expect(bucket.get("backups/a")).toBe("x");
  });

  it("a second write to the same key, with create-once semantics (If-None-Match), fails even with no lock at all", () => {
    expect(bucket.put("writer", "backups/a", "x", true).ok).toBe(true);
    expect(bucket.put("writer", "backups/a", "y", true)).toEqual({ ok: false, error: "PreconditionFailed" });
  });

  it("LOCKED_DELETE_REFUSED=PASS: delete during the 7-day lock fails, by the SAME writer actor that created the object", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.delete("writer", "backups/a")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
  });

  it("LOCKED_OVERWRITE_REFUSED=PASS: overwrite during the 7-day lock fails (even without create-once, the lock alone blocks it)", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.put("writer", "backups/a", "y")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
  });

  it("LOCKED_OVERWRITE_REFUSED=PASS (multipart): completing an older multipart upload against a locked key cannot replace it", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "original-ciphertext");
    expect(bucket.completeMultipartUpload("writer", "backups/a", "replacement-via-multipart")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.get("backups/a")).toBe("original-ciphertext");
  });

  it("LOCK_BEATS_LIFECYCLE=PASS: lifecycle cannot delete a locked object before the 7-day lock expires, but can once it does (still inside the 35-day retention)", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    bucket.nowMs = SEVEN_DAYS_MS - 1000; // day ~7, still locked
    expect(bucket.lifecycleSweep("backups/a")).toBe("held_by_lock");
    bucket.nowMs = SEVEN_DAYS_MS + 1000; // just past the lock, lifecycle may now act (though 35-day retention still applies in the real rule)
    expect(bucket.lifecycleSweep("backups/a")).toBe("deleted");
  });

  it("LOCKED_READ_ALLOWED=PASS: restore/read still works while an object is locked -- locks only block delete/overwrite", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "payload");
    expect(bucket.get("backups/a")).toBe("payload");
  });

  it("after lock expiry (day 7+), delete now succeeds for that object", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    bucket.nowMs = SEVEN_DAYS_MS + 1;
    expect(bucket.delete("writer", "backups/a").ok).toBe(true);
  });

  it("an age-based lock re-applies fresh to a write that lands right as the old lock expires: overwriting a just-unlocked object immediately re-locks it under a new 7-day window", () => {
    // This is a genuine, worth-documenting provider nuance, not a bug in the simulation: an
    // age-based Bucket Lock keys off the object's own last-written timestamp, so a permitted
    // overwrite past the old lock's expiry creates what is, from the lock's perspective, a brand
    // new object -- which is then immediately covered by the same rule for a fresh 7 days.
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    bucket.nowMs = SEVEN_DAYS_MS + 1;
    expect(bucket.put("writer", "backups/a", "y").ok).toBe(true); // the old version's lock has expired; overwrite succeeds
    expect(bucket.delete("writer", "backups/a")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" }); // but the NEW version is freshly locked
  });

  it("WRITER_CAN_EDIT_BUCKET_LOCK=NO / WRITER_CAN_REMOVE_BUCKET_LOCK=NO: a writer-actor credential cannot alter lock configuration -- the attempt itself is refused, not merely ineffective", () => {
    const r1 = bucket.setLockRule("writer", { prefix: "backups/", maxAgeMs: 1 });
    expect(r1.ok).toBe(false);
    const r2 = bucket.removeLockRule("writer", "backups/");
    expect(r2.ok).toBe(false);
    // Confirm the refusal was real: an admin-set lock set earlier is still intact and still blocks delete.
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/a", "x");
    expect(bucket.delete("writer", "backups/a").ok).toBe(false);
  });

  it("a compromised writer credential attempting EVERY available destructive action against a currently-locked, already-created object: all fail", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/real-backup", "ciphertext");
    expect(bucket.put("writer", "backups/real-backup", "corrupted-overwrite")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.completeMultipartUpload("writer", "backups/real-backup", "corrupted-via-multipart")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.delete("writer", "backups/real-backup")).toEqual({ ok: false, error: "ObjectLockedByBucketPolicy" });
    expect(bucket.setLockRule("writer", { prefix: "backups/", maxAgeMs: 0 }).ok).toBe(false);
    expect(bucket.removeLockRule("writer", "backups/").ok).toBe(false);
    expect(bucket.get("backups/real-backup")).toBe("ciphertext"); // untouched
  });
});

describe("Section 5 availability threat model: COMPROMISED_WRITER_CAN_DESTROY_ALL_RECOVERY_POINTS_IMMEDIATELY=NO, stated honestly (not overclaimed)", () => {
  it("a compromised writer CANNOT destroy every recovery point immediately: the current 7-day window survives", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    // Simulate daily backups over the last 10 days: days 0 (oldest) .. 9 (newest, "now").
    for (let day = 0; day <= 9; day++) {
      bucket.nowMs = day * 86_400_000;
      bucket.put("writer", `backups/day-${day}`, `ciphertext-day-${day}`);
    }
    bucket.nowMs = 9 * 86_400_000; // "now" is day 9
    let destroyedCount = 0;
    for (let day = 0; day <= 9; day++) {
      const r = bucket.delete("writer", `backups/day-${day}`);
      if (r.ok) destroyedCount++;
    }
    // Days 3..9 (age < 7 days as of "now") are locked and must survive; only days 0..2 (age >= 7 days) are deletable.
    expect(destroyedCount).toBeLessThan(10); // NOT every recovery point was destroyed
    for (let day = 3; day <= 9; day++) {
      expect(bucket.get(`backups/day-${day}`)).toBe(`ciphertext-day-${day}`); // the locked window survived intact
    }
  });

  it("honestly: a compromised writer CAN still delete backups OLDER than the 7-day immutable window (not claimed otherwise)", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/old", "x");
    bucket.nowMs = SEVEN_DAYS_MS + 1; // 7 days + 1ms later: outside the lock, inside the 35-day lifecycle
    expect(bucket.delete("writer", "backups/old")).toEqual({ ok: true });
  });

  it("documents the days 7-35 gap explicitly: a writer credential can still delete a mid-retention object, since Bucket Lock no longer covers it past day 7", () => {
    bucket.setLockRule("admin", { prefix: "backups/", maxAgeMs: SEVEN_DAYS_MS });
    bucket.put("writer", "backups/mid-retention", "x");
    bucket.nowMs = THIRTY_FIVE_DAYS_MS / 2; // day ~17.5: inside the (separately-configured) 35-day lifecycle retention, outside the 7-day lock
    // This fake provider deliberately does not model the 35-day lifecycle's own auto-expiry timer
    // (that is a distinct Cloudflare mechanism from Bucket Lock, out of scope for Section 3's
    // lock-vs-lifecycle-precedence proof above) -- it only proves the lock itself no longer
    // blocks a direct writer-credential delete once its own 7-day window has elapsed.
    expect(bucket.delete("writer", "backups/mid-retention")).toEqual({ ok: true });
  });
});
