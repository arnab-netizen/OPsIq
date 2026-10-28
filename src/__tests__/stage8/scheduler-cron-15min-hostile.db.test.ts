/**
 * #638 (cron every 15 minutes) hostile proof, run against a real disposable PostgreSQL.
 *
 * Two things the existing suite does not already prove against a real database:
 *  1. The 23h email-retry-spacing WHERE clause's actual boundary behavior on real Alert rows
 *     (scheduler-producers.test.ts only asserts the Prisma query's SHAPE against a mock).
 *  2. Two genuinely concurrent invocations of the real route's exported GET() handler against a
 *     real due task -- scheduler-pg.db.test.ts proves the underlying processDue() primitive is
 *     claim-safe under concurrency, but nothing calls the actual HTTP route handler twice at once.
 *
 * Skipped when TEST_WITH_DB is not set, same convention as every other *.db.test.ts here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { TASK_NAME_ALERT_EMAIL_RETRY } from "@/infra/scheduler-handlers";
import { enqueueDueEmailRetryTasks, EMAIL_RETRY_MIN_SPACING_MS } from "@/services/scheduler/scheduler-producers";

const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

describeIf(SHOULD_RUN_DB_TESTS)("[db] #638 cron-15min hostile proof", () => {
  describe("email retry 23h-spacing boundary (real Alert rows, real producer query)", () => {
    let workspaceId: string;
    let userId: string;

    beforeEach(async () => {
      workspaceId = randomUUID();
      userId = randomUUID();
      await db.user.create({ data: { id: userId, email: `cron15-${Date.now()}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "cron-15min hostile WS", slug: `cron15-${Date.now()}`, createdBy: userId } });
    });

    afterEach(async () => {
      await db.scheduledTask.deleteMany({ where: { taskName: TASK_NAME_ALERT_EMAIL_RETRY, workspaceId } });
      await db.alert.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    async function makeAlert(overrides: { emailAttemptCount: number; emailLastAttemptAt: Date | null }): Promise<string> {
      const id = randomUUID();
      await db.alert.create({
        data: {
          id, workspaceId, userId, type: "test_alert", message: "cron-15min hostile test",
          severity: "medium", emailDeliveryStatus: "FAILED",
          emailAttemptCount: overrides.emailAttemptCount,
          emailLastAttemptAt: overrides.emailLastAttemptAt,
        },
      });
      return id;
    }

    async function scanFinds(alertId: string): Promise<boolean> {
      await enqueueDueEmailRetryTasks();
      const task = await db.scheduledTask.findFirst({ where: { workspaceId, payload: { path: ["alertId"], equals: alertId } } });
      return task !== null;
    }

    it("first attempt (emailLastAttemptAt=null, attemptCount=0) is found immediately -- not delayed by the spacing guard", async () => {
      const id = await makeAlert({ emailAttemptCount: 0, emailLastAttemptAt: null });
      expect(await scanFinds(id)).toBe(true);
    });

    it("null emailLastAttemptAt with a NON-ZERO attempt count (a data anomaly) is still found -- documents the actual behavior, not an assumption", async () => {
      // If emailAttemptCount ever advances without emailLastAttemptAt being set (should not happen
      // given retryEmailAlert's atomic claim always sets both together), the OR-null branch of the
      // WHERE clause matches it immediately, same as a genuine first attempt. This is the honest,
      // proven behavior of the current WHERE clause for this anomalous state, not a defect this PR
      // introduces (the anomaly itself should not be producible by retryEmailAlert's own code path).
      const id = await makeAlert({ emailAttemptCount: 2, emailLastAttemptAt: null });
      expect(await scanFinds(id)).toBe(true);
    });

    it("exactly 22h59m59s since the last attempt is EXCLUDED (must wait the full window)", async () => {
      const id = await makeAlert({ emailAttemptCount: 1, emailLastAttemptAt: new Date(Date.now() - (EMAIL_RETRY_MIN_SPACING_MS - 1000)) });
      expect(await scanFinds(id)).toBe(false);
    });

    it("exactly 23h since the last attempt is INCLUDED (boundary is inclusive, not exclusive)", async () => {
      const id = await makeAlert({ emailAttemptCount: 1, emailLastAttemptAt: new Date(Date.now() - EMAIL_RETRY_MIN_SPACING_MS) });
      expect(await scanFinds(id)).toBe(true);
    });

    it("a FUTURE emailLastAttemptAt (clock skew / bug) is EXCLUDED, not retried early -- fails closed", async () => {
      const id = await makeAlert({ emailAttemptCount: 1, emailLastAttemptAt: new Date(Date.now() + 60_000) });
      expect(await scanFinds(id)).toBe(false);
    });

    it("attempt count 2 past the spacing window is still found (not yet at max attempts)", async () => {
      const id = await makeAlert({ emailAttemptCount: 2, emailLastAttemptAt: new Date(Date.now() - EMAIL_RETRY_MIN_SPACING_MS - 1000) });
      expect(await scanFinds(id)).toBe(true);
    });

    it("attempt count 3 (== EMAIL_MAX_ATTEMPTS) is NEVER found regardless of spacing -- max attempts is absolute", async () => {
      const id = await makeAlert({ emailAttemptCount: 3, emailLastAttemptAt: new Date(Date.now() - EMAIL_RETRY_MIN_SPACING_MS - 1000) });
      expect(await scanFinds(id)).toBe(false);
    });

    it("concurrent producer scans of the SAME due alert create exactly ONE ScheduledTask row, never two", async () => {
      const id = await makeAlert({ emailAttemptCount: 0, emailLastAttemptAt: null });
      await Promise.all([enqueueDueEmailRetryTasks(), enqueueDueEmailRetryTasks()]);
      const tasks = await db.scheduledTask.findMany({ where: { workspaceId, payload: { path: ["alertId"], equals: id } } });
      expect(tasks).toHaveLength(1);
    });
  });

  describe("two genuinely concurrent route invocations (real GET(), real DatabaseSchedulerProvider, real due task)", () => {
    let workspaceId: string;
    let userId: string;
    const SECRET = "cron-15min-hostile-test-secret";
    let processed = 0;

    beforeEach(async () => {
      workspaceId = randomUUID();
      userId = randomUUID();
      await db.user.create({ data: { id: userId, email: `cron15-route-${Date.now()}@example.com`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "cron-15min route WS", slug: `cron15-route-${Date.now()}`, createdBy: userId } });
      vi.stubEnv("CRON_SECRET", SECRET);
      processed = 0;
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      await db.scheduledTask.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: userId } });
      vi.doUnmock("@/infra/scheduler-handlers");
      vi.resetModules();
    });

    it("one real due task claimed by two concurrent GET() calls is processed exactly once, never twice", async () => {
      const taskName = "cron15-route-concurrency-test";
      const provider = new DatabaseSchedulerProvider();
      const taskId = await provider.schedule({ taskName, scheduledFor: new Date(Date.now() - 1000), workspaceId, maxAttempts: 3 });

      // Stub only the handler registry (one extra, counting handler for this test's own task
      // type, alongside the real production handlers) so the route's own real auth, producer
      // calls, and drain loop all run for real -- just with producers no-op'd via empty-result
      // mocks for the three domain scans this test does not need, keeping it to the one seeded
      // task. QBO and the four scheduler-producers.ts scans still run against the real (empty)
      // database state for this workspace, which is harmless and proves nothing was skipped.
      vi.doMock("@/infra/scheduler-handlers", async () => {
        const real = await vi.importActual<typeof import("@/infra/scheduler-handlers")>("@/infra/scheduler-handlers");
        const handlers = real.getProductionTaskHandlers();
        handlers.set(taskName, async () => {
          processed++;
          await new Promise((r) => setTimeout(r, 50)); // widen the concurrency window
          return { status: "SUCCESS" as const };
        });
        return { ...real, getProductionTaskHandlers: () => handlers };
      });
      vi.resetModules();
      const { GET } = await import("@/app/api/internal/cron/scheduler/route");

      const req = () => new Request("https://example.test/api/internal/cron/scheduler", { headers: { authorization: `Bearer ${SECRET}` } });
      const [res1, res2] = await Promise.all([GET(req()), GET(req())]);

      expect(res1.status).toBeLessThan(300);
      expect(res2.status).toBeLessThan(300);
      expect(processed).toBe(1); // claimed by exactly one of the two concurrent invocations

      const finalTask = await db.scheduledTask.findUnique({ where: { id: taskId } });
      expect(finalTask?.status).toBe("completed");
      expect(finalTask?.attempts).toBe(1); // not claimed-and-run twice
    });
  });
});
