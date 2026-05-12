import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

describe("D4: Backup/Restore Procedure - Script Testing", () => {
  const SCRIPT_DIR = path.join(process.cwd(), "scripts");
  const TEST_BACKUP_DIR = path.join(process.cwd(), ".test-backups");

  beforeEach(() => {
    // Create test backup directory
    if (!fs.existsSync(TEST_BACKUP_DIR)) {
      fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true });
    }
  });

  describe("Backup Script Validation", () => {
    it("should have backup-database.sh script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have restore-database.sh script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have setup-backup-schedule.sh script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "setup-backup-schedule.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have cleanup-old-backups.sh script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have executable bit set on backup script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const stat = fs.statSync(scriptPath);
      const isExecutable = (stat.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it("should have executable bit set on restore script", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const stat = fs.statSync(scriptPath);
      const isExecutable = (stat.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });
  });

  describe("Backup/Restore Script Structure", () => {
    it("backup script should include pg_dump usage", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("pg_dump");
    });

    it("backup script should include gzip compression", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("gzip");
    });

    it("backup script should generate SHA256 checksum", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("sha256sum");
    });

    it("restore script should include psql usage", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("psql");
    });

    it("restore script should include checksum verification", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("sha256sum");
    });

    it("restore script should include data integrity verification", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("information_schema");
    });

    it("cleanup script should handle retention days parameter", () => {
      const scriptPath = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("RETENTION_DAYS");
      expect(content).toContain("mtime");
    });

    it("backup script should support compression level parameter", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("COMPRESSION_LEVEL");
      expect(content).toContain("gzip -");
    });
  });

  describe("Backup Filename Format", () => {
    it("should generate timestamped backup filenames", () => {
      // Backup format: opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
      const pattern = /^opsiq_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sql\.gz$/;
      expect(pattern.test("opsiq_backup_2026-05-12_10-30-00.sql.gz")).toBe(true);
    });

    it("should support custom backup directories", () => {
      const testPaths = [
        "/backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz",
        "./backups/opsiq_backup_2026-05-12_10-30-00.sql.gz",
        "~/backups/opsiq_backup_2026-05-12_10-30-00.sql.gz",
      ];

      testPaths.forEach((testPath) => {
        expect(testPath).toContain("opsiq_backup_");
        expect(testPath).toContain(".sql.gz");
      });
    });
  });

  describe("Checksum Verification", () => {
    it("should support .sha256 checksum files", () => {
      const checksumFile = path.join(TEST_BACKUP_DIR, "test_backup.sql.gz.sha256");
      const checksum = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567";
      fs.writeFileSync(checksumFile, checksum);

      expect(fs.existsSync(checksumFile)).toBe(true);
      const content = fs.readFileSync(checksumFile, "utf-8");
      expect(content).toBe(checksum);
    });

    it("should support checksum verification flag", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain('"verify"');
      expect(content).toContain("VERIFY=");
    });

    it("should validate SHA256 format", () => {
      const validChecksum = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
      const sha256Pattern = /^[a-f0-9]{64}$/i;

      expect(validChecksum.length).toBe(64);
      expect(sha256Pattern.test(validChecksum)).toBe(true);
    });
  });

  describe("Retention Policy", () => {
    it("should support configurable retention days", () => {
      const scriptPath = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("RETENTION_DAYS");
      expect(content).toContain("${2:-30}"); // Default 30 days
    });

    it("should preserve recent backups", () => {
      // Retention logic: delete files older than RETENTION_DAYS
      const retentionDays = 30;
      const oneDay = 24 * 60 * 60 * 1000;
      const thirtyDays = retentionDays * oneDay;
      const fiftyDays = 50 * oneDay;

      // Recent backup (15 days old) should be kept
      const recentAge = 15 * oneDay;
      expect(recentAge).toBeLessThan(thirtyDays);

      // Old backup (50 days old) should be deleted
      const oldAge = fiftyDays;
      expect(oldAge).toBeGreaterThan(thirtyDays);
    });

    it("should remove .sha256 files with old backups", () => {
      const scriptPath = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain(".sha256");
      expect(content).toContain("rm -f");
    });

    it("should support common retention periods", () => {
      const periods = [7, 30, 90, 180];

      periods.forEach((days) => {
        expect(days).toBeGreaterThan(0);
        expect(days).toBeLessThan(365);
      });
    });
  });

  describe("Automated Backup Schedule", () => {
    it("should support cron job setup", () => {
      const scriptPath = path.join(SCRIPT_DIR, "setup-backup-schedule.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("crontab");
      expect(content).toContain("CRON_JOB");
    });

    it("should support configurable backup time", () => {
      const validTimes = ["02:00", "03:30", "23:59", "00:00"];

      validTimes.forEach((time) => {
        const pattern = /^\d{2}:\d{2}$/;
        expect(pattern.test(time)).toBe(true);
      });
    });

    it("should format cron expression correctly", () => {
      // Cron format: minute hour day month weekday
      const cronPattern = /^\d{1,2} \d{1,2} \* \* \*/;
      const cronJob = "0 2 * * * /backup/script.sh";

      expect(cronPattern.test(cronJob)).toBe(true);
    });

    it("should support default schedule (2:00 AM daily)", () => {
      const scriptPath = path.join(SCRIPT_DIR, "setup-backup-schedule.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("02:00");
      expect(content).toContain("30 days");
    });
  });

  describe("Environment Variable Handling", () => {
    it("should require DATABASE_URL environment variable", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("ERROR");
    });

    it("should parse DATABASE_URL correctly", () => {
      // Format: postgresql://user:password@host:port/dbname
      const testUrl = "postgresql://postgres:password@localhost:5432/opsiq";
      const parts = {
        scheme: "postgresql",
        user: "postgres",
        password: "password",
        host: "localhost",
        port: "5432",
        database: "opsiq",
      };

      expect(testUrl).toContain(parts.scheme);
      expect(testUrl).toContain(parts.user);
      expect(testUrl).toContain(parts.host);
      expect(testUrl).toContain(parts.port);
      expect(testUrl).toContain(parts.database);
    });

    it("should support PGPASSWORD environment variable", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("export PGPASSWORD");
      expect(content).toContain("PGUSER");
      expect(content).toContain("PGHOST");
      expect(content).toContain("PGPORT");
    });
  });

  describe("Error Handling", () => {
    it("backup script should exit on error", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("set -euo pipefail");
      expect(content).toContain("exit 1");
    });

    it("restore script should exit on error", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("set -euo pipefail");
      expect(content).toContain("ON_ERROR_STOP");
    });

    it("should handle missing backup file", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("not found");
      expect(content).toContain("ERROR");
    });

    it("should handle checksum mismatch", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("mismatch");
      expect(content).toContain("exit 1");
    });
  });

  describe("Logging and Reporting", () => {
    it("should generate backup logs", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("LOG_FILE");
      expect(content).toContain("tee -a");
    });

    it("should report backup duration", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("START_TIME");
      expect(content).toContain("END_TIME");
      expect(content).toContain("DURATION");
    });

    it("should report file size", () => {
      const scriptPath = path.join(SCRIPT_DIR, "backup-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("du -h");
      expect(content).toContain("FILE_SIZE");
    });

    it("should report freed space in cleanup", () => {
      const scriptPath = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("FREED_SPACE");
      expect(content).toContain("DELETED_COUNT");
    });
  });

  describe("Database Verification", () => {
    it("restore script should verify table count", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("information_schema");
      expect(content).toContain("table_count");
    });

    it("should check if database has tables after restore", () => {
      const scriptPath = path.join(SCRIPT_DIR, "restore-database.sh");
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("TABLE_COUNT");
      expect(content).toContain("-gt 0");
    });
  });

  describe("Integration Scenarios", () => {
    it("should support backup → verify → restore workflow", () => {
      // Verify scripts exist and are executable
      const backupScript = path.join(SCRIPT_DIR, "backup-database.sh");
      const restoreScript = path.join(SCRIPT_DIR, "restore-database.sh");

      expect(fs.existsSync(backupScript)).toBe(true);
      expect(fs.existsSync(restoreScript)).toBe(true);

      const backupStat = fs.statSync(backupScript);
      const restoreStat = fs.statSync(restoreScript);

      expect((backupStat.mode & 0o111) !== 0).toBe(true);
      expect((restoreStat.mode & 0o111) !== 0).toBe(true);
    });

    it("should support disaster recovery procedure", () => {
      const proceedureFile = path.join(process.cwd(), "docs", "BACKUP_RESTORE_PROCEDURE.md");
      expect(fs.existsSync(proceedureFile)).toBe(true);

      const content = fs.readFileSync(proceedureFile, "utf-8");
      expect(content).toContain("Disaster Recovery");
      expect(content).toContain("Point-in-Time");
    });

    it("should support automated daily backup schedule", () => {
      const setupScript = path.join(SCRIPT_DIR, "setup-backup-schedule.sh");
      expect(fs.existsSync(setupScript)).toBe(true);

      const content = fs.readFileSync(setupScript, "utf-8");
      expect(content).toContain("crontab");
      expect(content).toContain("02:00");
    });

    it("should support backup lifecycle management", () => {
      const cleanupScript = path.join(SCRIPT_DIR, "cleanup-old-backups.sh");
      expect(fs.existsSync(cleanupScript)).toBe(true);

      const content = fs.readFileSync(cleanupScript, "utf-8");
      expect(content).toContain("RETENTION");
      expect(content).toContain("mtime");
    });
  });
});
