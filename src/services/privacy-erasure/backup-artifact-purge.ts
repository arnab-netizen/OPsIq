/**
 * Pure selection logic for purging scheduled-backup artifacts after a QuickBooks
 * erasure. The GitHub Actions artifact set IS the recoverable backup history, and
 * every dump in it contains the whole database, so the only deterministic way to
 * remove the erased data from it is to delete the whole set and then take a fresh
 * backup. Selecting by date is unsafe (a dump that started before the erasure can
 * finish uploading after it), so selection is by name only and the tool refuses to
 * run while a backup workflow run is queued or in progress.
 */
export const BACKUP_ARTIFACT_NAME_PREFIX = "opsiq-production-backup-";

export interface BackupArtifactRef {
  id: number;
  name: string;
  expired?: boolean;
  size_in_bytes?: number;
  created_at?: string | null;
}

/** Every artifact the backup workflow produced (including failure diagnostics), expired or not. */
export function selectBackupArtifactsToPurge<T extends BackupArtifactRef>(artifacts: readonly T[]): T[] {
  return artifacts.filter((a) => a.name.startsWith(BACKUP_ARTIFACT_NAME_PREFIX));
}

/** Expired artifacts are already deleted from storage by GitHub; only live ones need a DELETE. */
export function liveArtifacts<T extends BackupArtifactRef>(artifacts: readonly T[]): T[] {
  return artifacts.filter((a) => !a.expired);
}

export function backupRunInProgress(runs: readonly { status: string | null }[]): boolean {
  return runs.some((r) => r.status === "in_progress" || r.status === "queued" || r.status === "waiting" || r.status === "pending" || r.status === "requested");
}
