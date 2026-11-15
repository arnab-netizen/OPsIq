import { describe, it, expect } from "vitest";
import {
  backupRunInProgress,
  liveArtifacts,
  selectBackupArtifactsToPurge,
} from "@/services/privacy-erasure/backup-artifact-purge";

const a = (id: number, name: string, expired = false) => ({ id, name, expired });

describe("backup artifact purge selection", () => {
  it("selects every production backup artifact (including failure diagnostics) and nothing else", () => {
    const picked = selectBackupArtifactsToPurge([
      a(1, "opsiq-production-backup-111"),
      a(2, "opsiq-production-backup-FAILED-112"),
      a(3, "coverage-report"),
      a(4, "restore-rehearsal-log"),
    ]);
    expect(picked.map((x) => x.id)).toEqual([1, 2]);
  });

  it("selection is by name, never by date (an in-flight dump can finish after the erasure)", () => {
    const old = { id: 1, name: "opsiq-production-backup-1", created_at: "2000-01-01T00:00:00Z" };
    const fresh = { id: 2, name: "opsiq-production-backup-2", created_at: "2999-01-01T00:00:00Z" };
    expect(selectBackupArtifactsToPurge([old, fresh]).map((x) => x.id)).toEqual([1, 2]);
  });

  it("only live artifacts need a DELETE; expired ones are already gone from storage", () => {
    expect(liveArtifacts([a(1, "x", true), a(2, "y", false)]).map((x) => x.id)).toEqual([2]);
  });

  it("refuses while a backup run is queued or in progress", () => {
    expect(backupRunInProgress([{ status: "completed" }])).toBe(false);
    expect(backupRunInProgress([{ status: "completed" }, { status: "in_progress" }])).toBe(true);
    expect(backupRunInProgress([{ status: "queued" }])).toBe(true);
    expect(backupRunInProgress([])).toBe(false);
  });
});
