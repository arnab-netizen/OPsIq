/**
 * R11 — Offline integrity seal (§3.4, §93). Pure.
 *
 * Offline-captured proof must retain BOTH device-capture and server-upload timestamps,
 * the submitter identity, and sync status. If the gap between capture and upload exceeds
 * the configured window, TIMESTAMP_SUSPICIOUS fires. Offline proof cannot claim real-time
 * GPS/location metadata it never captured. Offline proof cannot verify a task until synced.
 */

export type OfflineSyncStatus = "CAPTURED_OFFLINE" | "UPLOAD_PENDING" | "SYNCED" | "SYNC_FAILED" | "LATE_UPLOAD" | "OFFLINE_TIMESTAMP_CONFLICT";

export interface OfflineProofRecord {
  offlineCaptured: boolean;
  deviceCaptureAtMs?: number;
  serverUploadAtMs?: number;
  deviceOrSessionId?: string;
  submitterId: string;
  syncStatus: OfflineSyncStatus;
  /** Whether real-time GPS/location metadata was actually captured at capture time. */
  realTimeLocationCaptured: boolean;
  /** Whether the proof CLAIMS to carry location metadata. */
  claimsLocationMetadata: boolean;
}

/** Default max gap (ms) between device capture and server upload before suspicion. */
export const DEFAULT_OFFLINE_GAP_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface OfflineAssessment {
  flags: string[];
  timestampSuspicious: boolean;
  canVerify: boolean;
}

export function assessOfflineProof(r: OfflineProofRecord, gapWindowMs: number = DEFAULT_OFFLINE_GAP_WINDOW_MS): OfflineAssessment {
  const flags: string[] = [];
  if (!r.offlineCaptured) {
    // Online proof — still must have a server timestamp + submitter.
    if (!(typeof r.serverUploadAtMs === "number")) flags.push("missing_server_timestamp");
    if (typeof r.submitterId !== "string" || r.submitterId.trim().length === 0) flags.push("missing_submitter");
    return { flags, timestampSuspicious: false, canVerify: flags.length === 0 };
  }

  // Offline integrity seal requirements.
  if (typeof r.deviceCaptureAtMs !== "number") flags.push("missing_device_capture_timestamp");
  if (typeof r.serverUploadAtMs !== "number") flags.push("missing_server_upload_timestamp");
  if (typeof r.submitterId !== "string" || r.submitterId.trim().length === 0) flags.push("missing_submitter");

  // Offline proof cannot claim location metadata it didn't capture in real time.
  if (r.claimsLocationMetadata && !r.realTimeLocationCaptured) flags.push("offline_location_metadata_unfounded");

  let timestampSuspicious = false;
  if (typeof r.deviceCaptureAtMs === "number" && typeof r.serverUploadAtMs === "number") {
    const gap = r.serverUploadAtMs - r.deviceCaptureAtMs;
    if (gap < 0 || gap > gapWindowMs) { timestampSuspicious = true; flags.push("TIMESTAMP_SUSPICIOUS"); }
  }
  if (r.syncStatus === "OFFLINE_TIMESTAMP_CONFLICT") { timestampSuspicious = true; flags.push("offline_timestamp_conflict"); }

  // Offline proof cannot verify a task until it is synced.
  const synced = r.syncStatus === "SYNCED" || r.syncStatus === "LATE_UPLOAD";
  const canVerify = synced && flags.length === 0;
  return { flags, timestampSuspicious, canVerify };
}
