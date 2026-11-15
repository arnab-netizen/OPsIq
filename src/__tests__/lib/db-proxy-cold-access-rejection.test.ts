/**
 * Root cause of the non-DB suite exiting 1 with zero failed tests: the `db` proxy auto-starts client
 * initialisation on ANY property access and stored that promise without a rejection handler. When
 * initialisation failed and nothing had awaited yet (e.g. a contract test checking `db.user` is
 * defined), Node reported an unhandled rejection — vitest counts it as an error and exits 1; a server
 * would log an unhandled rejection. The auto-start is now observed; awaiting callers still get the error.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const g = globalThis as unknown as { prisma?: unknown; prismaPromise?: unknown };

describe("db proxy cold access when initialisation fails", () => {
  const saved = { DATABASE_URL: process.env.DATABASE_URL, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, prisma: g.prisma, prismaPromise: g.prismaPromise };

  afterEach(() => {
    process.env.DATABASE_URL = saved.DATABASE_URL;
    process.env.TEST_DATABASE_URL = saved.TEST_DATABASE_URL;
    g.prisma = saved.prisma;
    g.prismaPromise = saved.prismaPromise;
    vi.resetModules();
  });

  it("a bare property access never produces an unhandled rejection, and awaiting callers still receive the error", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    g.prisma = undefined;
    g.prismaPromise = undefined;
    vi.resetModules();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const { db } = await import("@/lib/db");
      expect(db.user).toBeDefined(); // cold access: starts initialisation, awaits nothing
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
      await expect(db.user.findFirst({})).rejects.toThrow(/Failed to initialize Prisma client|DATABASE_URL/);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
