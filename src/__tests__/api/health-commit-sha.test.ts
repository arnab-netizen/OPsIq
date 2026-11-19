/**
 * /api/health exposes the git commit the running deployment was built from, so release automation can prove which commit is actually
 * being SERVED (a successful build or a deployment record is not proof of that). Only a well-formed 40-hex SHA is ever echoed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockQueryRaw } = vi.hoisted(() => ({ mockQueryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRawUnsafe: mockQueryRaw }, getDbInstance: vi.fn().mockResolvedValue({ $queryRawUnsafe: mockQueryRaw }) }));
vi.mock("@/infra/startup-state", () => ({ isStartupComplete: vi.fn().mockReturnValue(false) }));
vi.mock("@/services/production/retention-cleanup", () => ({ cleanupOldRecords: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "@/app/api/health/route";

const SHA = "6d91b7080486d32548da2daedc505ecdc4466e3b";
beforeEach(() => { mockQueryRaw.mockReset(); mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("health commit field", () => {
  it("echoes the deployed commit when Vercel provides a 40-hex SHA", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    const body = (await (await GET()).json()) as { commit: string | null };
    expect(body.commit).toBe(SHA);
  });
  it("is null when absent, malformed, uppercase, short or carrying extra text (never echoes arbitrary env content)", async () => {
    for (const v of ["", "main", SHA.toUpperCase(), SHA.slice(0, 39), `${SHA}\n::set-output x`, `${SHA} `]) {
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", v);
      const body = (await (await GET()).json()) as { commit: string | null };
      expect(body.commit, JSON.stringify(v)).toBeNull();
    }
  });
});
