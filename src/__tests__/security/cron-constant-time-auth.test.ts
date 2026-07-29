/**
 * Phase 3: Verify the cron scheduler route uses constant-time comparison for CRON_SECRET.
 * A timing-side-channel on bearer token comparison could let an attacker enumerate the
 * secret character-by-character. The fix replaces `===` with `timingSafeEqual`.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_PATH = join(process.cwd(), "src/app/api/internal/cron/scheduler/route.ts");
const src = readFileSync(ROUTE_PATH, "utf-8");

describe("Cron scheduler route — constant-time authentication", () => {
  it("imports timingSafeEqual from crypto", () => {
    expect(src).toMatch(/import\s*\{[^}]*timingSafeEqual[^}]*\}\s*from\s*['"]crypto['"]/);
  });

  it("does not use plain string equality (===) to compare bearer token", () => {
    // Must not contain auth === `Bearer ${secret}` or auth == `Bearer ${secret}`.
    // This catches the pre-fix pattern.
    expect(src).not.toMatch(/auth\s*===?\s*`Bearer \$\{secret\}`/);
  });

  it("uses timingSafeEqual in the verifyCronSecret function body", () => {
    const fnStart = src.indexOf("function verifyCronSecret");
    const fnEnd = src.indexOf("\n}", fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toContain("timingSafeEqual");
  });

  it("fails closed when CRON_SECRET is absent", () => {
    // The guard `if (!secret) return false` must appear before any comparison.
    const fnStart = src.indexOf("function verifyCronSecret");
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/if\s*\(!secret\)\s*return false/);
  });

  it("uses Bearer prefix extraction before comparison (not full auth header)", () => {
    const fnStart = src.indexOf("function verifyCronSecret");
    const fnEnd = src.indexOf("\n}", fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    // Should strip "Bearer " prefix before comparing.
    expect(fnBody).toMatch(/startsWith\(['"]Bearer ['"]\)/);
    expect(fnBody).toMatch(/slice\(7\)/);
  });
});
